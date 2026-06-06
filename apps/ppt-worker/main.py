import os
import uuid
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import boto3
from botocore.client import Config

from normalizer import normalize_presentation
from validator import validate_presentation, ValidationError
from renderer import render_ppt
from slide_classifier import classify_and_reorder
from story_validator import validate_story_arc
from pdf_to_md import pdf_bytes_to_md

app = FastAPI(title="Cortexa PPT Worker")

# Dev CORS — frontend (Vite) hits this worker directly for PDF upload.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/convert/pdf")
async def convert_pdf(file: UploadFile = File(...)):
    """Upload a PDF → clean markdown (digital path). Feeds the Document Ingest node."""
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only .pdf files are supported")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    try:
        result = pdf_bytes_to_md(data)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"filename": file.filename, **result}

class Slide(BaseModel):
    title: str
    bullets: List[str] = []
    type: Optional[str] = "bullets"
    diagram: Optional[Dict[str, Any]] = None

class PPTRequest(BaseModel):
    title: str
    slides: List[Slide]
    template_path: Optional[str] = None
    output_filename: Optional[str] = None
    nvidia_key: Optional[str] = None

class PPTResponse(BaseModel):
    fileUrl: str
    filename: str
    explanation: str
    metrics: Optional[Dict[str, float]] = None

from presentation_engine_v2 import interpret_presentation_v2 as interpret_presentation

@app.post("/generate-ppt", response_model=PPTResponse)
async def generate_ppt_endpoint(req: PPTRequest):
    import time
    metrics = {}
    if req.nvidia_key:
        req.nvidia_key = req.nvidia_key.strip()
    try:
        # 1. Classify & Reorder (deterministic + LLM fallback)
        t0 = time.time()
        data = await classify_and_reorder(req.dict(), api_key=req.nvidia_key)
        metrics["classify_and_reorder"] = round(time.time() - t0, 3)
        
        # 2. Story Arc Validation (structural check)
        t0 = time.time()
        story_result = validate_story_arc(data)
        if not story_result.passed:
            import logging
            logging.warning(f"Story arc issues: {story_result.errors}")
        metrics["validate_story_arc"] = round(time.time() - t0, 3)
        
        # 3. LLM Intelligence Layer (content enrichment)
        t0 = time.time()
        data = await interpret_presentation(data, api_key=req.nvidia_key)
        metrics["interpret_presentation"] = round(time.time() - t0, 3)
        
        # 4. Normalize (role-aware safety net)
        t0 = time.time()
        data = normalize_presentation(data)
        metrics["normalize_presentation"] = round(time.time() - t0, 3)
        
        # 5. Validate (structural)
        t0 = time.time()
        validate_presentation(data)
        metrics["validate_presentation"] = round(time.time() - t0, 3)
        
        # 3. Setup paths
        template_path = req.template_path or os.getenv("PPT_TEMPLATE_PATH", "template.pptx")
        
        # Handle Windows-style absolute paths sent by host API
        if ":" in template_path and not template_path.startswith("/"):
            # It's a Windows path like F:/... 
            # We mapped the whole repo to /cortexa_root, so let's try to translate it.
            # Usually it's F:/AMRITA ALL SEMESTER/projects/Cortexa/scratch/template.pptx
            # We want /cortexa_root/scratch/template.pptx
            parts = template_path.split("Cortexa/")
            if len(parts) > 1:
                template_path = os.path.join("/cortexa_root", parts[1])
            else:
                # Fallback: just use the filename
                template_path = os.path.basename(template_path)

        if not os.path.isabs(template_path):
            # Try relative to the app dir
            template_path = os.path.join(os.path.dirname(__file__), template_path)
            
        filename = req.output_filename or f"presentation-{uuid.uuid4().hex[:8]}.pptx"
        output_path = os.path.join(os.getcwd(), filename)
        
        # 4. Render
        t0 = time.time()
        if req.nvidia_key:
            data["nvidia_key"] = req.nvidia_key
        render_ppt(data, template_path, output_path)
        metrics["render_ppt"] = round(time.time() - t0, 3)
        
        metrics["total_worker_time"] = sum(metrics.values())
        
        # 5. Upload to S3 if configured
        s3_endpoint = os.getenv("S3_ENDPOINT")
        s3_bucket = os.getenv("S3_BUCKET")
        
        if s3_endpoint and s3_bucket:
            s3 = boto3.client(
                's3',
                endpoint_url=s3_endpoint,
                aws_access_key_id="test",
                aws_secret_access_key="test",
                region_name="us-east-1",
                config=Config(s3={'addressing_style': 'path'})
            )
            
            s3_key = f"exports/{filename}"
            with open(output_path, "rb") as f:
                s3.put_object(
                    Bucket=s3_bucket,
                    Key=s3_key,
                    Body=f,
                    ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation"
                )
            
            file_url = f"{s3_endpoint}/{s3_bucket}/{s3_key}"
            # Keep local file for debugging
            # os.remove(output_path)
        else:
            # Fallback to local file URL (not ideal for cross-container)
            file_url = f"file://{output_path}"

        return PPTResponse(
            fileUrl=file_url,
            filename=filename,
            explanation="Rendered PPT using template and normalized JSON.",
            metrics=metrics
        )

    except ValidationError as e:
        raise HTTPException(status_code=400, detail={"message": str(e), "errors": e.errors})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

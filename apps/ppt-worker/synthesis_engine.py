import httpx
import json
import logging
from typing import Dict, Any

from models_config import MODEL_FAST

logger = logging.getLogger(__name__)

SYNTHESIS_PROMPT = """
You are the Cortexa Presentation Synthesis Engine.
Your task is to transform a raw README or technical document into a structured presentation JSON.

GOAL:
Extract the core narrative and technical details into a set of 10-15 slides.

STRUCTURE:
1. Title: The main project name and a punchy tagline.
2. Slides: A list of objects with "title" and "bullets".

RULES:
- Do NOT add marketing fluff. Stick to the technical facts provided.
- Ensure every slide has a clear, descriptive title.
- Bullets should be concise but technically dense.
- Maintain the original terminology and technical specifics (e.g., VLM, FAISS, SRS).

OUTPUT FORMAT:
{
  "title": "Project Name: Tagline",
  "slides": [
    {
      "title": "Slide Title",
      "bullets": ["Bullet 1", "Bullet 2"]
    }
  ]
}
"""

async def synthesize_presentation(text: str, api_key: str) -> Dict[str, Any]:
    """
    Converts raw text into a raw presentation JSON.
    """
    if not api_key:
        raise ValueError("Synthesis requires an NVIDIA API key.")

    prompt = f"Synthesize a presentation from this text:\n\n{text}"

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://integrate.api.nvidia.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": MODEL_FAST,
                    "messages": [
                        {"role": "system", "content": SYNTHESIS_PROMPT},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.2,
                    "response_format": {"type": "json_object"}
                },
                timeout=120.0
            )
            
            if response.status_code == 200:
                content = response.json()["choices"][0]["message"]["content"]
                result = json.loads(content)
                logger.info("Successfully synthesized presentation from text.")
                return result
            else:
                logger.error(f"Synthesis failed: {response.status_code} - {response.text}")
                raise Exception(f"LLM Synthesis failed: {response.status_code}")
    except Exception as e:
        logger.error(f"Error in synthesize_presentation: {e}")
        raise e

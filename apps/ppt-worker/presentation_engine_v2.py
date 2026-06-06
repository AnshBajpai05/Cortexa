import httpx
import json
import logging
from typing import List, Dict, Any

from models_config import MODEL_FAST

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """
You are the Cortexa Presentation Intelligence Engine (v2).
Your task is to transform raw, fragmented JSON slides into a high-impact, professional narrative.

GOAL:
Transform the deck from a "data dump" into a "communication engine".

---
PHASE 1: CONTENT QUALITY & TITLES
1. UPGRADE ALL TITLES: Titles MUST be punchy, professional, and short (max 6 words). 
   - Bad: "Technical Component Alpha Processing Pipeline"
   - Good: "Alpha Processing Pipeline"
   - AVOID using "Enables [X]" or "Ensures [Y]" in every title. Keep it concise.
2. DESCRIPTIVE BUT NATURAL BULLETS: Ensure bullets are highly descriptive and informative. 
   - DO NOT force artificial prefixes like "Component:", "Output:", or "Impact:" on every bullet. 
   - Write natural, professional sentences or phrases.
   - Example: Instead of "Performance: Sub-10ms latency", write "Achieves sub-10ms latency for real-time processing".
3. ENHANCE DIVIDERS: If a slide is type "divider", add a punchy `subtitle` field explaining the section.
   - Example: {"title": "SYSTEM ARCHITECTURE", "subtitle": "High-throughput processing & routing", "type": "divider"}

PHASE 2: STRUCTURAL CONSTRAINTS (STRICT 1:1 MAPPING)
4. DO NOT DELETE OR MERGE SLIDES: You must return the EXACT same number of slides as provided in the input array.
5. PRESERVE ORIGINAL ORDER: You must return the slides in the exact same sequence as they were provided.
6. MINIMUM BULLET REQUIREMENT: Every content slide MUST have at least 3 substantive bullets. 
   If a slide has fewer than 3, EXPAND the existing bullets with more detail from the context.
   - FOR TECHNICAL SLIDES: Require 4-6 bullets and 12-18 words per bullet.
   - FOR EXECUTIVE SLIDES: Require 3-4 bullets, concise but meaty.

PHASE 3: OUTPUT
Return a valid JSON object with the following structure. DO NOT copy this dummy data into your output.
{
  "slides": [
    { 
      "title": "Example Short Title", 
      "bullets": ["Role: Handles data processing", "Latency: Sub-50ms execution time"], 
      "type": "bullets",
      "semantic_role": "component"
    }
  ],
  "explanation": "Briefly explain the narrative improvements."
}

STRICT RULES:
- Do NOT blindly follow original JSON titles or flat lists. You MUST apply insight-driven titles and micro-structured bullets for maximum clarity.
- Titles must be SHORT and PUNCHY (max 6 words). DO NOT write long sentences as titles.
- Retain all semantic_role tags.
- NEVER produce a slide with fewer than 3 bullets (except dividers).
- DO NOT HALLUCINATE OR INVENT CAPABILITIES. Base all content strictly on the provided raw slides.
- DO NOT copy the dummy examples from this prompt into your output.
- CRITICAL: You must return an array of slides of the EXACT same length and in the EXACT same order as the input.
"""

async def interpret_presentation_v2(data: Dict[str, Any], api_key: str = None) -> Dict[str, Any]:
    """
    Advanced Presentation Intelligence layer.
    Uses LLM to perform semantic restructuring, narrative grouping, and bullet enrichment.
    """
    if not api_key:
        logger.warning("No NVIDIA API key provided, falling back to raw data.")
        return data

    raw_slides = data.get("slides", [])
    if not raw_slides:
        return data

    # Prepare input for LLM
    input_payload = {
        "presentation_title": data.get("title", "Untitled"),
        "raw_slides": raw_slides
    }

    prompt = f"Transform this presentation:\n\n{json.dumps(input_payload, indent=2)}"

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
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.2,
                    "response_format": {"type": "json_object"}
                },
                timeout=45.0
            )
            
            if response.status_code == 200:
                content = response.json()["choices"][0]["message"]["content"]
                transformed = json.loads(content)
                
                # CRITICAL: Merge enriched content IN-PLACE instead of replacing.
                # V2 should enrich titles/bullets, NOT reorder slides.
                enriched_slides = transformed.get("slides", [])
                
                if enriched_slides:
                    logger.info(f"Applying LLM enriched slides ({len(enriched_slides)} items mapped 1:1)")
                    
                    # STRICT 1:1 MAPPING: We only take the content improvements, 
                    # we do NOT allow the LLM to change the array length or order.
                    for i in range(min(len(raw_slides), len(enriched_slides))):
                        raw = raw_slides[i]
                        enriched = enriched_slides[i]
                        
                        if enriched.get("title"):
                            raw["title"] = enriched["title"]
                        if enriched.get("subtitle"):
                            raw["subtitle"] = enriched["subtitle"]
                        # Only update bullets if the LLM provided substantive content
                        if enriched.get("bullets") and len(enriched["bullets"]) > 0:
                            raw["bullets"] = enriched["bullets"]
                            
                    data["slides"] = raw_slides
                
                data["intelligence_report"] = transformed.get("explanation", "Content edited for narrative clarity (Strict 1:1 Map).")
                
                logger.info("Successfully applied V2 intelligence layer (1:1 Content Map).")
                return data
            else:
                logger.error(f"LLM V2 failed: {response.status_code} - {response.text}")
    except Exception as e:
        logger.error(f"Error in interpret_presentation_v2: {e}")

    return data

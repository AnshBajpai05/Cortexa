import httpx
import json
import logging

from models_config import MODEL_FAST

logger = logging.getLogger(__name__)

async def enhance_title(title, bullets, api_key):
    """
    Uses LLM to rewrite generic titles into insight-driven conclusions.
    """
    if not api_key:
        return title

    # Skip enhancement for already strong titles (very basic heuristic)
    generic_words = ["problem", "solution", "architecture", "overview", "conclusion", "intro", "summary"]
    if not any(word in title.lower() for word in generic_words):
        return title

    prompt = f"""
    Rewrite this PowerPoint slide title to be more impactful and insight-driven.
    The title must convey a conclusion or specific insight based on the bullets.
    
    Current Title: {title}
    Bullets:
    {chr(10).join(['- ' + b for b in bullets])}
    
    Constraint: Max 10 words. No "Insight:" prefix. Just the new title.
    """

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
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.5,
                    "max_tokens": 50,
                },
                timeout=10.0
            )
            if response.status_code == 200:
                new_title = response.json()["choices"][0]["message"]["content"].strip().strip('"')
                return new_title
    except Exception as e:
        logger.error(f"Failed to enhance title: {e}")
    
    return title

def split_slide(slide):
    """
    Splits a slide into multiple slides if it has too many bullets.
    """
    bullets = slide.get("bullets", [])
    if len(bullets) <= 4:
        return [slide]

    new_slides = []
    # Split into chunks of 3 or 4
    for i in range(0, len(bullets), 4):
        chunk = bullets[i:i+4]
        suffix = f" (Part {len(new_slides) + 1})" if i > 0 else ""
        new_slides.append({
            "title": f"{slide.get('title', 'Untitled')}{suffix}",
            "bullets": chunk,
            "type": slide.get("type", "bullets")
        })
    
    return new_slides

async def interpret_presentation(data, api_key=None):
    """
    The core "Presentation Intelligence" layer.
    Transforms raw JSON into a guided explanation.
    """
    raw_slides = data.get("slides", [])
    refined_slides = []

    for slide in raw_slides:
        # 1. Split if overflow
        splits = split_slide(slide)
        
        for s in splits:
            # 2. Enhance Title if possible
            if api_key:
                s["title"] = await enhance_title(s["title"], s["bullets"], api_key)
            
            refined_slides.append(s)

    # 3. Insert Section Dividers (Basic Heuristic)
    # If the first slide is an overview, and we have more than 8 slides,
    # maybe insert dividers after every 4 slides? Or look for topic shifts?
    # For now, let's just do basic splitting and enhancement.
    
    data["slides"] = refined_slides
    return data

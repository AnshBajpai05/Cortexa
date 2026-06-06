"""
Cortexa Role-Aware Normalizer
===============================
Applies different bullet/word limits based on slide semantic role.
Enforces minimum bullet counts to prevent sparse slides.
"""

import re

# Role-specific constraints: (max_bullets, max_words_per_bullet)
ROLE_CONSTRAINTS = {
    "problem":      (4, 12),
    "gap":          (4, 12),
    "vision":       (4, 12),
    "design":       (4, 14),
    "architecture": (6, 18),
    "component":    (6, 18),
    "flow":         (8, 15),
    "impact":       (4, 12),
    "risk":         (5, 14),
    "roadmap":      (5, 14),
    "divider":      (0, 0),   # No bullets for dividers
}

DEFAULT_CONSTRAINTS = (4, 14)
MIN_BULLETS = 3  # Minimum bullets for any content slide


def _expand_thin_bullets(bullets, min_count=MIN_BULLETS):
    """
    Generically expand a thin bullet list by splitting compound sentences.
    Splits on semicolons, colons, 'via', 'through', and 'and'.
    Only splits if the bullet is long enough (>15 words) to avoid fragmentation.
    """
    if len(bullets) >= min_count:
        return bullets

    expanded = []
    for b in bullets:
        text = str(b).strip()
        words = text.split()
        
        # Don't split very short bullets unless we are desperate
        if len(words) < 8:
            expanded.append(text)
            continue

        # Try splitting on delimiters
        # Priorities: ; -> : -> \s+via\s+ -> \s+through\s+ -> \s+and\s+ -> \s+by\s+ -> \s+using\s+
        split_pattern = r';\s*|:\s*|\s+via\s+|\s+through\s+|\s+by\s+means\s+of\s+'
        parts = [p.strip() for p in re.split(split_pattern, text, flags=re.IGNORECASE) if p.strip()]
        
        if len(parts) > 1:
            expanded.extend(parts)
            continue

        # Fallback to 'and' or 'by' if still thin and somewhat long
        if len(words) > 12:
            # Split on ' and ' or ' by ' or ' using '
            secondary_split = r'\s+and\s+|\s+by\s+|\s+using\s+|\s+with\s+'
            parts = [p.strip() for p in re.split(secondary_split, text, flags=re.IGNORECASE) if p.strip()]
            if len(parts) > 1:
                expanded.extend(parts)
                continue
        
        expanded.append(text)

    # If we still haven't hit the limit, and we have enough words, try a recursive pass
    if len(expanded) < min_count and len(expanded) > 0:
        # Avoid infinite recursion by checking if length increased
        if len(expanded) > len(bullets):
             return _expand_thin_bullets(expanded, min_count)

    return expanded


def normalize_slide(slide):
    """
    Ensures a slide dictionary has all required fields and adheres to
    role-specific constraints. Enforces minimum bullet count.
    """
    role = slide.get("semantic_role", "component")
    slide_type = slide.get("type", "bullets")

    # Dividers get no normalization
    if slide_type == "divider" or role == "divider":
        slide["type"] = "divider"
        slide.setdefault("bullets", [])
        return slide

    # Diagram slides: preserve as-is
    if slide_type == "diagram":
        return slide

    max_bullets, max_words = ROLE_CONSTRAINTS.get(role, DEFAULT_CONSTRAINTS)

    # Enforce bullet limits
    bullets = slide.get("bullets", [])
    if not isinstance(bullets, list):
        bullets = [str(bullets)]

    # --- Minimum bullet enforcement ---
    # If too few bullets, try expanding compound sentences before truncating
    if len(bullets) < MIN_BULLETS and len(bullets) > 0:
        bullets = _expand_thin_bullets(bullets, MIN_BULLETS)

    slide["bullets"] = bullets[:max_bullets]

    # Ensure title exists
    if not slide.get("title") or not str(slide.get("title")).strip():
        slide["title"] = "Insight Driven Conclusion"

    # Enforce max words per bullet (with smart truncation)
    normalized_bullets = []
    for bullet in slide["bullets"]:
        words = str(bullet).split()
        if len(words) > max_words:
            # Try to truncate at a natural break point
            truncated = words[:max_words]
            # If the last word is a preposition/conjunction, back up one
            trailing = truncated[-1].lower().rstrip(".,;:")
            if trailing in ("and", "or", "the", "a", "an", "of", "to", "for", "with", "in", "on"):
                truncated = truncated[:-1]
            normalized_bullets.append(" ".join(truncated) + "…")
        else:
            normalized_bullets.append(" ".join(words))
    slide["bullets"] = normalized_bullets

    # Fallback type
    if not slide.get("type"):
        slide["type"] = "bullets"

    return slide

def _dedup_by_title(slides):
    """
    Final safety-net dedup: removes slides with similar titles.
    Uses word-set overlap (>60%) to catch fuzzy duplicates like
    'Responsible Use' vs 'Responsible Use of FaceVault for High-Trust Identity Search'.
    First occurrence wins, preserving pipeline ordering.
    Diagram slides are always kept.
    """
    seen_title_words = []
    result = []
    for slide in slides:
        title = (slide.get("title") or "").strip().lower()
        slide_type = slide.get("type", "bullets")

        # Always keep diagrams
        if slide_type == "diagram":
            result.append(slide)
            continue

        if not title:
            result.append(slide)
            continue

        # Extract significant words (4+ chars to skip articles/prepositions)
        title_words = set(re.findall(r'[a-z]{4,}', title))

        # Check against all seen titles
        is_dup = False
        for seen_words in seen_title_words:
            if not title_words or not seen_words:
                continue
            overlap = len(title_words & seen_words) / max(len(title_words | seen_words), 1)
            if overlap > 0.60:
                is_dup = True
                break

        if not is_dup:
            result.append(slide)
            seen_title_words.append(title_words)

    return result


def normalize_presentation(data):
    """
    Normalizes the entire presentation JSON structure.
    Applies per-slide normalization + final title-based dedup.
    """
    if not isinstance(data, dict):
        data = {"title": "Presentation", "slides": []}
    
    if "slides" not in data or not isinstance(data["slides"], list):
        data["slides"] = []

    if not data.get("title"):
        data["title"] = "Cortexa Intelligence Export"

    data["slides"] = [normalize_slide(s) for s in data["slides"]]

    # Final dedup pass: remove exact-title duplicates
    before = len(data["slides"])
    data["slides"] = _dedup_by_title(data["slides"])
    removed = before - len(data["slides"])
    if removed > 0:
        import logging
        logging.getLogger(__name__).info(f"Title-dedup removed {removed} duplicate slides")
    
    return data


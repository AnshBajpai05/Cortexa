"""
Cortexa Slide Classifier & Semantic Reorderer
==============================================
Deterministic keyword-based classifier with LLM fallback.
Handles: classification, grouping, bridge injection, reordering, deduplication.
"""

import httpx
import json
import logging
import re
from typing import List, Dict, Any, Optional, Tuple
from copy import deepcopy

from models_config import MODEL_FAST, MODEL_REASONING_MID

logger = logging.getLogger(__name__)

# ─── SEMANTIC ROLE DEFINITIONS ───────────────────────────────────────────────

GOLD_ORDER = [
    "problem", "gap", "vision", "design", "architecture",
    "component", "flow", "impact", "risk", "roadmap"
]

ROLE_KEYWORDS = {
    "problem": {
        "title": ["challenge", "problem", "issue", "crisis", "pain", "failure", "bottleneck", "gap", "risk"],
        "bullet": ["delay", "manual", "duplicate", "flood", "no audit", "erode", "misalloc", "opaque",
                    "waste", "overload", "inefficien", "complain", "backlog", "slow"],
        "weight": 1.0
    },
    "gap": {
        "title": ["why current", "why existing", "fail", "limitation", "shortcoming", "broken"],
        "bullet": ["doesn't scale", "no dedup", "no audit", "can't handle", "unable", "lacks",
                    "manual routing", "resource waste", "accountability gap", "not designed"],
        "weight": 1.0
    },
    "vision": {
        "title": ["mission", "goal", "objective", "future state", "target", "north star", "long-term"],
        "bullet": ["end-to-end", "automat", "real-time", "immutable", "predictive", "self-service",
                    "intelligent", "ai-driven", "transform"],
        "weight": 1.0
    },
    "design": {
        "title": ["design philosophy", "principle", "approach", "strategy", "why this works"],
        "bullet": ["automation before", "deterministic", "modular", "decouple",
                    "layered", "separation of", "principle"],
        "weight": 0.9
    },
    "architecture": {
        "title": ["architecture", "system", "high-level", "overview", "flow", "pipeline", "stack", "engine"],
        "bullet": ["api", "model", "database", "queue", "service", "layer", "module", "component",
                    "ingestion", "processing", "dashboard", "logic", "backend"],
        "weight": 1.1
    },
    "component": {
        "title": ["django", "api", "rest", "model", "bert", "faiss", "ledger", "dashboard", "react",
                   "celery", "rag", "assistant", "slm", "normalization", "classifier", "detection",
                   "silo", "vite", "sahayak", "postgresql", "extraction", "vlm", "transformer", "logic"],
        "bullet": ["endpoint", "async", "jwt", "schema", "inference", "fine-tun", "f1", "cosine",
                    "hash", "append-only", "merkle", "retrieval", "vectorstore", "websocket",
                    "heatmap", "latency", "precision", "recall", "quantiz", "audit"],
        "weight": 1.2
    },
    "flow": {
        "title": ["end-to-end", "workflow", "how it works", "process", "lifecycle", "journey"],
        "bullet": ["step 1", "step 2", "then", "next", "finally", "completes", "triggers",
                    "routes to", "passes to", "feeds into"],
        "weight": 0.9
    },
    "impact": {
        "title": ["impact", "result", "outcome", "metric", "pilot", "benefit", "roi"],
        "bullet": ["reduction", "improvement", "saving", "satisfaction", "star rating",
                    "annually", "cost saving", "traceab", "100%", "100 %"],
        "weight": 1.0
    },
    "risk": {
        "title": ["risk", "limitation", "challenge", "trade-off", "caveat", "constraint",
                   "responsible", "caution", "ethics", "consent", "warning"],
        "bullet": ["risk", "limitation", "trade-off", "depends on", "requires", "assumption",
                    "not yet", "future work", "caveat", "surveillance", "not designed",
                    "consented", "not intended", "biometric"],
        "weight": 1.0
    },
    "roadmap": {
        "title": ["roadmap", "future", "scale", "next step", "plan", "expansion"],
        "bullet": ["multi-city", "federation", "kubernetes", "open-source", "integration",
                    "voice", "iot", "scale", "phase 2", "phase 3", "upcoming"],
        "weight": 1.0
    },
}

# ─── COMPONENT SUB-GROUPS (with dependency order) ────────────────────────────

COMPONENT_GROUPS = {
    "ingestion": {
        "keywords": ["api", "rest", "ingestion", "endpoint", "django", "celery", "slm",
                      "normalization", "text normalization", "cleansing", "silo"],
        "order": 0
    },
    "intelligence": {
        "keywords": ["model", "classifier", "bert", "faiss", "ml", "nlp", "duplicate",
                      "detection", "multitask", "classification", "fine-tun"],
        "order": 1
    },
    "governance": {
        "keywords": ["ledger", "audit", "hash", "compliance", "gdpr", "tamper", "merkle",
                      "postgresql", "pgcrypto", "append-only", "immutable"],
        "order": 2
    },
    "user_layer": {
        "keywords": ["dashboard", "rag", "assistant", "ui", "react", "citizen", "vite",
                      "sahayak", "websocket", "heatmap", "conversational"],
        "order": 3
    },
}

# Dependency ordering within groups (earlier items should appear first)
INTRA_GROUP_DEPS = {
    "ingestion": ["api", "rest", "django", "slm", "normalization", "celery"],
    "intelligence": ["slm", "normalization", "classifier", "multitask", "bert", "faiss", "duplicate"],
    "governance": ["ledger", "audit", "hash", "merkle"],
    "user_layer": ["rag", "assistant", "sahayak", "dashboard", "react", "vite"],
}

CONFIDENCE_THRESHOLD = 0.6
MAX_SLIDES_DEFAULT = 30


# ─── CLASSIFIER ──────────────────────────────────────────────────────────────

def _score_slide(slide: Dict, role: str, config: Dict) -> float:
    """Score a slide against a role using keyword matching.
    Uses absolute hit count (not normalized by keyword set size)
    so roles with large keyword sets aren't penalized."""
    title = (slide.get("title") or "").lower()
    bullets_text = " ".join(str(b).lower() for b in slide.get("bullets", []))
    combined = title + " " + bullets_text

    title_hits = sum(1 for kw in config["title"] if kw in title)
    bullet_hits = sum(1 for kw in config["bullet"] if kw in combined)

    # Title keywords are worth 3x (titles are the strongest signal)
    raw_score = (title_hits * 3.0 + bullet_hits) * config["weight"]

    return raw_score


def classify_slide(slide: Dict) -> Tuple[str, float]:
    """Classify a single slide. Returns (role, confidence)."""
    scores = {}
    for role, config in ROLE_KEYWORDS.items():
        scores[role] = _score_slide(slide, role, config)

    if not scores or max(scores.values()) == 0:
        return "component", 0.0

    best_role = max(scores, key=scores.get)
    best_score = scores[best_role]

    # Confidence = how much better the best is vs second-best (as a ratio)
    sorted_scores = sorted(scores.values(), reverse=True)
    if len(sorted_scores) > 1 and sorted_scores[1] > 0:
        # e.g. best=8, second=3 → ratio=2.67 → confidence=min(1.0, 0.63) = 0.63
        ratio = best_score / sorted_scores[1]
        confidence = min(1.0, (ratio - 1.0) / 2.0)  # ratio 3.0+ → confidence 1.0
    elif best_score > 0:
        confidence = 1.0  # Only one role scored anything
    else:
        confidence = 0.0

    return best_role, confidence


def classify_component_group(slide: Dict) -> Tuple[str, int]:
    """Sub-classify a component slide into its group."""
    title = (slide.get("title") or "").lower()
    bullets_text = " ".join(str(b).lower() for b in slide.get("bullets", []))
    combined = title + " " + bullets_text

    best_group = "intelligence"  # default
    best_hits = 0

    for group, config in COMPONENT_GROUPS.items():
        hits = sum(1 for kw in config["keywords"] if kw in combined)
        if hits > best_hits:
            best_hits = hits
            best_group = group

    return best_group, COMPONENT_GROUPS[best_group]["order"]


def _get_dep_order(slide: Dict, group: str) -> int:
    """Get dependency order within a component group."""
    title = (slide.get("title") or "").lower()
    deps = INTRA_GROUP_DEPS.get(group, [])
    for i, dep_kw in enumerate(deps):
        if dep_kw in title:
            return i
    return len(deps)


# ─── LLM FALLBACK ────────────────────────────────────────────────────────────

async def llm_classify(slide: Dict, api_key: str) -> str:
    """LLM fallback for low-confidence classifications."""
    prompt = f"""Classify this presentation slide into exactly ONE role.

Roles: {', '.join(GOLD_ORDER)}

Slide Title: {slide.get('title', '')}
Bullets: {json.dumps(slide.get('bullets', []))}

Reply with ONLY the role name, nothing else."""

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://integrate.api.nvidia.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": MODEL_FAST,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.0,
                    "max_tokens": 10,
                },
                timeout=10.0
            )
            if resp.status_code == 200:
                role = resp.json()["choices"][0]["message"]["content"].strip().lower()
                if role in GOLD_ORDER:
                    return role
    except Exception as e:
        logger.warning(f"LLM classify fallback failed: {e}")

    return "component"


# ─── BRIDGE SLIDE GENERATION ─────────────────────────────────────────────────

def _generate_gap_slide(problem_slide: Dict) -> Dict:
    """Generate 'Why Current Systems Fail' from problem bullets."""
    bullets = problem_slide.get("bullets", [])
    gap_bullets = []
    for b in bullets[:4]:
        b_lower = b.lower()
        if "manual" in b_lower:
            gap_bullets.append("Manual routing doesn't scale beyond 100 daily complaints")
        elif "duplicate" in b_lower:
            gap_bullets.append("No deduplication leads to 30%+ redundant resource deployment")
        elif "audit" in b_lower:
            gap_bullets.append("Zero audit trail creates accountability and compliance gaps")
        elif "resource" in b_lower or "misalloc" in b_lower:
            gap_bullets.append("Static allocation rules can't adapt to dynamic complaint patterns")
        elif "trust" in b_lower or "opaque" in b_lower:
            gap_bullets.append("Opaque processes erode citizen trust and reduce engagement")
        else:
            gap_bullets.append(f"Current approach: {b.split(',')[0].strip()} — unsustainable at scale")

    return {
        "title": "Why Current Systems Fail",
        "bullets": gap_bullets,
        "type": "bullets",
        "semantic_role": "gap",
        "auto_generated": True
    }


def _generate_design_slide(vision_slide: Dict, arch_slide: Optional[Dict]) -> Dict:
    """Generate 'System Design Philosophy' bridge slide."""
    return {
        "title": "System Design Philosophy",
        "bullets": [
            "Automation before escalation — route complaints without human bottlenecks",
            "Deterministic auditability — every state change is hashed and traceable",
            "Real-time intelligence layer — classify, deduplicate, and score on ingestion",
            "Modular architecture — each silo operates independently and scales horizontally"
        ],
        "type": "bullets",
        "semantic_role": "design",
        "auto_generated": True
    }


def _generate_flow_slide(component_slides: List[Dict]) -> List[Dict]:
    """Generate end-to-end flow slide from component titles, split into Pipeline and Execution."""
    steps = []
    for cs in component_slides:
        title = cs.get("title", "")
        # Extract the core component name
        clean = re.sub(r'\(.*?\)', '', title).strip()
        if clean:
            steps.append(clean)

    flow_chain = " → ".join(steps) if steps else "Ingestion → Processing → Output"

    slide1 = {
        "title": "End-to-End System Processing Flow",
        "bullets": [
            flow_chain
        ],
        "type": "bullets",
        "semantic_role": "flow",
        "auto_generated": True
    }
    
    slide2 = {
        "title": "Optimized Pipeline Logic Ensures High Performance",
        "bullets": [
            "Low-latency processing at every stage",
            "Deterministic validation of all transitions",
            "Immutable audit logs for transparency"
        ],
        "type": "bullets",
        "semantic_role": "flow",
        "auto_generated": True
    }

    return [slide1, slide2]

def _generate_positioning_slide() -> Dict:
    """Generate 'Why This Wins' strategic positioning slide."""
    return {
        "title": "Why This System Outperforms Traditional Solutions",
        "bullets": [
            "Eliminates manual processing bottlenecks",
            "Prevents systemic errors via automated validation",
            "Ensures full explainability by design",
            "Scales horizontally to handle massive datasets"
        ],
        "type": "bullets",
        "semantic_role": "impact",
        "auto_generated": True
    }

def _generate_risk_slide() -> Dict:
    """Generate 'Known Limitations & Risks' slide."""
    return {
        "title": "Known Limitations & Risks",
        "bullets": [
            "Model accuracy depends on data quality",
            "Edge cases in multilingual complaints",
            "Infrastructure cost at large scale"
        ],
        "type": "bullets",
        "semantic_role": "risk",
        "auto_generated": True
    }


async def _llm_enhance_bridge(slide: Dict, api_key: str) -> Dict:
    """Use LLM to improve auto-generated bridge slide quality."""
    if not api_key:
        return slide

    prompt = f"""Improve this bridge slide for a professional presentation.
Keep the same title and role. Make bullets more specific and impactful.
Max 4 bullets, max 15 words each.

Title: {slide['title']}
Current bullets: {json.dumps(slide['bullets'])}

Return valid JSON: {{"title": "...", "bullets": ["...", "..."]}}"""

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://integrate.api.nvidia.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": MODEL_FAST,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.3,
                    "max_tokens": 200,
                    "response_format": {"type": "json_object"}
                },
                timeout=12.0
            )
            if resp.status_code == 200:
                enhanced = json.loads(resp.json()["choices"][0]["message"]["content"])
                if enhanced.get("bullets") and len(enhanced["bullets"]) >= 2:
                    slide["title"] = enhanced.get("title", slide["title"])
                    slide["bullets"] = enhanced["bullets"][:4]
    except Exception as e:
        logger.warning(f"LLM bridge enhancement failed: {e}")

    return slide


# ─── DEDUPLICATION ────────────────────────────────────────────────────────────

def _slide_signature(slide: Dict) -> str:
    """Create a rough content signature for deduplication."""
    title = (slide.get("title") or "").lower()
    bullets = " ".join(str(b).lower() for b in slide.get("bullets", []))
    # Extract key nouns (rough)
    words = set(re.findall(r'[a-z]{4,}', title + " " + bullets))
    return frozenset(words)


def deduplicate_slides(slides: List[Dict]) -> List[Dict]:
    """Remove slides with >70% keyword overlap."""
    if len(slides) < 2:
        return slides

    result = []
    seen_sigs = []

    for slide in slides:
        sig = _slide_signature(slide)
        is_dup = False
        for existing_sig in seen_sigs:
            if not sig or not existing_sig:
                continue
            overlap = len(sig & existing_sig) / max(len(sig | existing_sig), 1)
            if overlap > 0.70:
                is_dup = True
                logger.info(f"Dedup: Removed '{slide.get('title')}' (70%+ overlap)")
                break
        if not is_dup:
            result.append(slide)
            seen_sigs.append(sig)

    return result


# ─── SLIDE LIMIT CONTROL ─────────────────────────────────────────────────────

def enforce_slide_limit(slides: List[Dict], max_slides: int = MAX_SLIDES_DEFAULT) -> List[Dict]:
    """Merge low-value slides if deck exceeds limit."""
    if len(slides) <= max_slides:
        return slides

    # Priority: dividers are lowest value, then auto-generated bridges
    # Never remove: problem, vision, impact, roadmap
    protected_roles = {"problem", "vision", "impact", "roadmap", "architecture"}

    # First pass: merge small component slides in same group
    i = 0
    while i < len(slides) - 1 and len(slides) > max_slides:
        curr = slides[i]
        nxt = slides[i + 1]
        if (curr.get("semantic_role") == "component" and
            nxt.get("semantic_role") == "component" and
            curr.get("component_group") == nxt.get("component_group")):
            # Merge
            curr["title"] = f"{curr['title']} & {nxt['title']}"
            curr["bullets"] = curr.get("bullets", [])[:6] + nxt.get("bullets", [])[:6]
            slides.pop(i + 1)
            logger.info(f"Merged slides: {curr['title']}")
        else:
            i += 1

    # Second pass: remove excess dividers from the END (preserving start ones)
    divider_count = sum(1 for s in slides if s.get("type") == "divider")
    while len(slides) > max_slides and divider_count > 4:
        for i in range(len(slides) - 1, -1, -1):
            if slides[i].get("type") == "divider":
                slides.pop(i)
                divider_count -= 1
                break

    return slides


# ─── MAIN PIPELINE ───────────────────────────────────────────────────────────

async def _convert_diagram_to_flux(slide: Dict, api_key: str) -> None:
    """Convert an existing diagram/mermaid slide into a FLUX prompt."""
    diagram_info = slide.get("diagram", {})
    if diagram_info.get("render_mode") == "flux" and diagram_info.get("spec", {}).get("diagram_prompt"):
        return # Already a flux diagram with prompt
        
    content_text = json.dumps(slide)
    prompt = f"""Based on the following diagram specification or presentation content, write a highly detailed image generation prompt for an AI model (like FLUX) to create a System Architecture Diagram.
The image should be a professional, modern system architecture diagram. Do NOT include text in the image. Just describe the visual layout, nodes, flowing data lines, and style (e.g. high-tech, glowing, minimalist).
Data:
{content_text[:3000]}

Return valid JSON with the prompt: 
{{"diagram_prompt": "A highly detailed, modern system architecture diagram showing..."}}"""
    
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://integrate.api.nvidia.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": MODEL_REASONING_MID,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.3,
                    "max_tokens": 400,
                    "response_format": {"type": "json_object"}
                },
                timeout=20.0
            )
            if resp.status_code == 200:
                res = json.loads(resp.json()["choices"][0]["message"]["content"])
                if res.get("diagram_prompt"):
                    slide["diagram"] = {
                        "render_mode": "flux",
                        "spec": {
                            "diagram_prompt": res["diagram_prompt"]
                        }
                    }
                    logger.info("Successfully converted diagram to FLUX prompt.")
    except Exception as e:
        logger.warning(f"Failed to convert diagram to FLUX: {e}")

async def generate_architecture_flow(slides: List[Dict], api_key: str) -> Dict:
    """Generate an architecture diagram slide from all content if none exists."""
    content_summary = []
    for s in slides:
        title = s.get("title", "")
        bullets = " | ".join(str(b) for b in s.get("bullets", []))
        content_summary.append(f"{title}: {bullets}")
        
    content_text = "\n".join(content_summary)
    
    if api_key:
        prompt = f"""Based on the following presentation content, generate an image generation prompt for an AI model (like FLUX) to create a System Architecture Diagram.
Identify the 3-6 major stages or components of the system.
Write a highly detailed visual prompt describing a professional, modern system architecture block diagram. Include styling details like minimalist, high-tech, clean layout, nodes, and connecting arrows. Do NOT include text in the image.

Content:
{content_text[:3000]}

Return valid JSON with the title and the prompt: 
{{"title": "System Architecture Flow", "diagram_prompt": "A highly detailed, modern system architecture diagram showing..."}}"""
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    "https://integrate.api.nvidia.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": MODEL_REASONING_MID,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.2,
                        "max_tokens": 400,
                        "response_format": {"type": "json_object"}
                    },
                    timeout=20.0
                )
                if resp.status_code == 200:
                    enhanced = json.loads(resp.json()["choices"][0]["message"]["content"])
                    if enhanced.get("diagram_prompt"):
                        return {
                            "title": enhanced.get("title", "System Architecture Flow"),
                            "type": "diagram",
                            "semantic_role": "architecture",
                            "auto_generated": True,
                            "diagram": {
                                "render_mode": "flux",
                                "spec": {
                                    "diagram_prompt": enhanced["diagram_prompt"]
                                }
                            }
                        }
        except Exception as e:
            logger.warning(f"LLM FLUX prompt generation failed: {e}")

    # Fallback to deterministic
    return _generate_flow_slide(slides)[0]

async def classify_and_reorder(data: Dict[str, Any], api_key: str = None) -> Dict[str, Any]:
    """
    Deterministic Structure Engine (The Skeleton).
    1. Classify each slide using keywords.
    2. Place slides into strict structural buckets.
    3. Sort the Core bucket chronologically (Phase 1, 2, etc.).
    4. Generate an Agenda programmatically.
    5. Assemble the final deck.
    """
    slides = deepcopy(data.get("slides", []))
    if not slides:
        return data

    # ── Step 1: Classify all slides ──
    for slide in slides:
        role, confidence = classify_slide(slide)
        slide["semantic_role"] = role
        slide["_confidence"] = confidence

    # ── Step 2: LLM fallback for low confidence (Optional) ──
    if api_key:
        for slide in slides:
            if slide["_confidence"] < CONFIDENCE_THRESHOLD:
                logger.info(f"Low confidence ({slide['_confidence']:.2f}) for '{slide.get('title')}', using LLM fallback")
                slide["semantic_role"] = await llm_classify(slide, api_key)
                
            # ── Step 2.5: Force all diagrams to FLUX ──
            if slide.get("type") == "diagram":
                await _convert_diagram_to_flux(slide, api_key)

    # ── Step 3: Strict Bucketing ──
    overview_bucket = []
    core_bucket = []
    validation_bucket = []
    risk_bucket = []
    
    for slide in slides:
        role = slide.get("semantic_role", "component")
        title = (slide.get("title") or "").lower()
        
        # Override: Any slide explicitly numbered as a phase/step belongs in core
        if re.search(r'(?:phase|step|stage)[\s\-_]*\d+', title):
            core_bucket.append(slide)
        elif role in ("problem", "vision", "design", "architecture", "gap", "flow"):
            overview_bucket.append(slide)
        elif role in ("impact", "result"):
            validation_bucket.append(slide)
        elif role in ("risk", "roadmap"):
            risk_bucket.append(slide)
        else:
            core_bucket.append(slide)

    # Improved regex for detecting architecture-related content
    arch_pattern = re.compile(r"(architecture|diagram|workflow|pipeline|infrastructure|stack|system design|sys flow|arch\b|pipe\b)", re.IGNORECASE)
    has_arch = any(
        s.get("semantic_role") in ("architecture", "flow") or 
        arch_pattern.search(s.get("title", "")) or 
        arch_pattern.search(" ".join(str(b) for b in s.get("bullets", [])))
        for s in slides
    )
    has_diagram = any(s.get("type") == "diagram" for s in slides)
    
    if not has_arch and not has_diagram and core_bucket:
        logger.info("No architecture/flow diagram detected. Generating one from content.")
        flow_slide = await generate_architecture_flow(core_bucket, api_key)
        overview_bucket.append(flow_slide)

    # ── Step 4: Sub-sort Core Bucket (Chronological Phase Preservation) ──
    def _phase_sort_key(slide):
        title = (slide.get("title") or "").lower()
        match = re.search(r'(?:phase|step|stage)[\s\-_]*(\d+)', title)
        if match:
            return (0, int(match.group(1)))  # Phases come first, sorted by number
        return (1, 0)  # Other core slides keep stable relative order

    core_bucket.sort(key=_phase_sort_key)

    # ── Step 5: Assemble ordered content first ──
    ordered_content = []
    title_slide = None

    if overview_bucket:
        title_slide = overview_bucket.pop(0)

    ordered_content.extend(overview_bucket)
    ordered_content.extend(core_bucket)
    ordered_content.extend(validation_bucket)
    ordered_content.extend(risk_bucket)

    # ── Step 5b: Ordering Guard ──
    # If bucketing failed to produce a coherent narrative, revert to original order
    if len(ordered_content) < 3 and len(slides) >= 3:
        logger.warning(f"Bucketing returned only {len(ordered_content)} slides. Falling back to original input order.")
        ordered_content = slides

    # ── Step 7: Deduplicate & Final Ordering ──
    final_slides = []
    if title_slide:
        final_slides.append(title_slide)
    
    # We'll add the agenda AFTER we know which slides survived deduplication and limits
    content_slides = deduplicate_slides(ordered_content)
    content_slides = enforce_slide_limit(content_slides)
    
    # ── Step 7b: Accurate Agenda Generation ──
    # Generate the agenda list AFTER all deduplication and limits are applied
    agenda_bullets = [s.get("title") for s in content_slides if s.get("title")]
    if len(agenda_bullets) > 10:
        agenda_bullets = agenda_bullets[:10] + [f"... and {len(content_slides) - 10} more technical deep-dives"]

    if agenda_bullets:
        agenda_slide = {
            "title": "Agenda",
            "type": "bullets",
            "semantic_role": "agenda",
            "bullets": agenda_bullets
        }
        final_slides.append(agenda_slide)

    final_slides.extend(content_slides)

    # ── Step 8: Clean internal fields ──
    for slide in final_slides:
        slide.pop("_confidence", None)

    data["slides"] = final_slides

    # ── Classification report ──
    role_counts = {}
    for s in final_slides:
        r = s.get("semantic_role", "unknown")
        role_counts[r] = role_counts.get(r, 0) + 1
    data["classification_report"] = role_counts

    logger.info(f"Classifier: {len(final_slides)} slides, roles: {role_counts}")

    return data

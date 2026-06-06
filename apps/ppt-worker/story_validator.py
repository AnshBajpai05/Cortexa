"""
Cortexa Story Validator
========================
Validates that the presentation follows a coherent narrative arc.
Catches structural issues AFTER classification and reordering.
"""

import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

REQUIRED_ROLES = ["problem", "vision", "architecture", "impact"]
RECOMMENDED_ROLES = ["gap", "design", "flow", "roadmap"]

class StoryValidationResult:
    def __init__(self):
        self.passed = True
        self.errors: List[str] = []
        self.warnings: List[str] = []

    def add_error(self, msg: str):
        self.errors.append(msg)
        self.passed = False

    def add_warning(self, msg: str):
        self.warnings.append(msg)

    def __repr__(self):
        status = "PASS" if self.passed else "FAIL"
        lines = [f"Story Validation: {status}"]
        for e in self.errors:
            lines.append(f"  [ERROR] {e}")
        for w in self.warnings:
            lines.append(f"  [WARN]  {w}")
        return "\n".join(lines)


def validate_story_arc(data: Dict[str, Any]) -> StoryValidationResult:
    """
    Validates the presentation follows a coherent story arc.
    
    Checks:
    1. Required roles exist (problem, vision, architecture, impact)
    2. Recommended roles present (gap, design, flow, roadmap)
    3. Problem comes before vision
    4. Vision comes before architecture
    5. Architecture comes before impact
    6. No orphaned components (components without architecture context)
    7. Slide count sanity
    """
    result = StoryValidationResult()
    slides = data.get("slides", [])
    
    if not slides:
        result.add_error("Presentation has no slides")
        return result

    # Collect roles and their positions
    content_slides = [s for s in slides if s.get("type") != "divider"]
    role_positions = {}
    for i, slide in enumerate(content_slides):
        role = slide.get("semantic_role", "unknown")
        if role not in role_positions:
            role_positions[role] = i

    # Check 1: Required roles
    for role in REQUIRED_ROLES:
        if role not in role_positions:
            result.add_error(f"Missing required section: '{role}'")

    # Check 2: Recommended roles
    for role in RECOMMENDED_ROLES:
        if role not in role_positions:
            result.add_warning(f"Missing recommended section: '{role}'")

    # Check 3-5: Ordering constraints
    order_checks = [
        ("problem", "vision", "Problem should come before Vision"),
        ("vision", "architecture", "Vision should come before Architecture"),
        ("architecture", "impact", "Architecture should come before Impact"),
        ("problem", "impact", "Problem should come before Impact"),
    ]

    for before, after, msg in order_checks:
        if before in role_positions and after in role_positions:
            if role_positions[before] > role_positions[after]:
                result.add_error(f"Ordering violation: {msg}")

    # Check 6: Component context
    has_components = "component" in role_positions
    has_arch = "architecture" in role_positions
    if has_components and not has_arch:
        result.add_warning("Components exist without architecture overview context")

    # Check 7: Slide count sanity
    total = len(slides)
    content_count = len(content_slides)
    divider_count = total - content_count
    
    if content_count < 3:
        result.add_error(f"Too few content slides ({content_count}). Need at least 3.")
    if content_count > 25:
        result.add_warning(f"Very long deck ({content_count} content slides). Consider trimming.")
    if divider_count > content_count * 0.5:
        result.add_warning(f"Too many dividers ({divider_count}) relative to content ({content_count})")

    # Check 8: Empty slides
    for i, slide in enumerate(content_slides):
        bullets = slide.get("bullets", [])
        if not bullets and slide.get("type") != "divider":
            result.add_warning(f"Slide '{slide.get('title', f'#{i+1}')}' has no bullets")

    # Log result
    if result.passed:
        logger.info(f"Story validation PASSED. {len(result.warnings)} warnings.")
    else:
        logger.error(f"Story validation FAILED. {len(result.errors)} errors, {len(result.warnings)} warnings.")

    return result

"""
Central Model Configuration (Python ppt-worker)
================================================
Mirror of packages/nodes/src/models.config.ts — KEEP THE ENV VAR NAMES IN SYNC.

Every NVIDIA NIM model id used by the PPT worker resolves through here, and each
is overridable via environment variable. This means a catalog deprecation (like
the retired meta/llama-3.1-405b / 70b) is fixed in ONE place / an env var,
never by hunting string literals across the codebase.

Verify ids against https://build.nvidia.com/models before relying on them.
"""

import os


def _env(key: str, fallback: str) -> str:
    val = os.getenv(key)
    return val.strip() if val and val.strip() else fallback


# Heavy reasoning / evaluation / planning.
MODEL_REASONING = _env("CORTEXA_MODEL_REASONING", "moonshotai/kimi-k2-instruct")

# Mid-tier reasoning / formatting / diagram-prompt synthesis.
# Replaces the DEPRECATED meta/llama-3.1-70b-instruct.
MODEL_REASONING_MID = _env("CORTEXA_MODEL_REASONING_MID", "meta/llama-3.3-70b-instruct")

# Fast / cheap completions, classification, tight loops.
MODEL_FAST = _env("CORTEXA_MODEL_FAST", "meta/llama-3.1-8b-instruct")

# Image generation (FLUX).
MODEL_IMAGE = _env("CORTEXA_MODEL_IMAGE", "black-forest-labs/flux.1-dev")

MODELS = {
    "reasoning": MODEL_REASONING,
    "reasoning_mid": MODEL_REASONING_MID,
    "fast": MODEL_FAST,
    "image": MODEL_IMAGE,
}

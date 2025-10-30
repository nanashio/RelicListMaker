"""Helpers for resolving OCR text to relic effect metadata."""

from .effects import MatchResult, apply_corrections, find_best_effect
from .levels import detect_level_from_text, find_level_candidates

__all__ = [
    "MatchResult",
    "apply_corrections",
    "find_best_effect",
    "detect_level_from_text",
    "find_level_candidates",
]

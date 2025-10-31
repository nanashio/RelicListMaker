"""Level matching helpers for OCR results."""

from __future__ import annotations

from typing import Mapping, Sequence

_LEVEL_NORMALIZE_TABLE = str.maketrans({
    "０": "0",
    "１": "1",
    "２": "2",
    "３": "3",
    "４": "4",
    "５": "5",
    "６": "6",
    "７": "7",
    "８": "8",
    "９": "9",
    "＋": "+",
    "－": "-",
    "ー": "-",
    "−": "-",
    "Ⅰ": "1",
    "Ⅱ": "2",
    "Ⅲ": "3",
    "Ⅳ": "4",
    "Ⅴ": "5",
})


def _normalize_level_text(text: str) -> str:
    if not text:
        return ""
    normalized = text.translate(_LEVEL_NORMALIZE_TABLE)
    return normalized.replace(" ", "").replace("　", "")


def find_level_candidates(effect_name: str, *, level_map: Mapping[str, Sequence[str]]) -> list[str]:
    """Return potential levels for the given effect name."""

    if not effect_name:
        return []

    if effect_name in level_map:
        return list(level_map[effect_name])

    for base, tokens in level_map.items():
        if base and base in effect_name:
            return list(tokens)
    return []


def detect_level_from_text(raw_text: str, *, candidates: Sequence[str]) -> str:
    """Detect a level string from OCR text and candidate list."""

    if not raw_text or not candidates:
        return ""

    normalized_raw = _normalize_level_text(raw_text)
    if not normalized_raw:
        return ""

    normalized_candidates: list[tuple[str, str]] = []
    for candidate in candidates:
        if not candidate:
            continue
        normalized_candidate = _normalize_level_text(candidate)
        if normalized_candidate:
            normalized_candidates.append((candidate, normalized_candidate))

    for original, normalized in normalized_candidates:
        if normalized and normalized in normalized_raw:
            return original

    for original, normalized in normalized_candidates:
        if normalized and normalized_raw.endswith(normalized):
            return original

    return ""


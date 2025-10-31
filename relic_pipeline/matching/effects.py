"""Matching utilities for OCR results."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Mapping, Sequence

from rapidfuzz import process

from ..settings import MatchingSettings


@dataclass(slots=True)
class MatchResult:
    """Represents the outcome of matching OCR text against dictionaries."""

    raw_text: str
    matched_text: str
    score: float
    source: str

    @classmethod
    def from_mapping(cls, payload: Mapping[str, object]) -> "MatchResult":
        raw = str(payload.get("raw", ""))
        matched = str(payload.get("match", ""))
        score_value = payload.get("score", 0.0)
        try:
            score = float(score_value)
        except (TypeError, ValueError):
            score = 0.0
        source = str(payload.get("source", "dictionary"))
        return cls(raw_text=raw, matched_text=matched, score=score, source=source)

    def to_dict(self) -> dict[str, object]:
        return {
            "raw": self.raw_text,
            "match": self.matched_text,
            "score": float(self.score),
            "source": self.source,
        }


def apply_corrections(
    text: str,
    *,
    corrections: Mapping[str, str],
    default_score: float,
) -> MatchResult | None:
    """Return a match result backed by manual corrections when available."""

    if not corrections:
        return None

    corrected = corrections.get(text)
    if not corrected:
        return None

    return MatchResult(
        raw_text=text,
        matched_text=corrected,
        score=default_score,
        source="feedback",
    )


def find_best_effect(
    text: str,
    *,
    dictionary: Sequence[str],
    scorer: Callable[[str, str], int] | Callable[[str, str], float] | None,
) -> MatchResult:
    """Return the dictionary entry that best matches the OCR text."""

    if not dictionary:
        return MatchResult(raw_text=text, matched_text="No match", score=0.0, source="dictionary")

    match = process.extractOne(text, dictionary, scorer=scorer)
    if not match:
        return MatchResult(raw_text=text, matched_text="No match", score=0.0, source="dictionary")

    best_match, score, _ = match
    score_value = float(score) if score is not None else 0.0
    return MatchResult(raw_text=text, matched_text=best_match, score=score_value, source="dictionary")


def resolve_effect(text: str, *, settings: MatchingSettings) -> MatchResult:
    """Combine manual corrections and dictionary lookup for a single OCR text."""

    corrections = settings.corrections or {}
    correction = apply_corrections(
        text,
        corrections=corrections,
        default_score=settings.correction_score,
    )
    if correction:
        return correction

    dictionary = settings.dictionary or ()
    return find_best_effect(
        text,
        dictionary=dictionary,
        scorer=settings.scorer,
    )


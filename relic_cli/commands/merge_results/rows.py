"""CSV 行に関するユーティリティ."""

from __future__ import annotations

from pathlib import Path
from typing import Sequence

from .constants import EXTRA_FIELD_PREFIXES, _REVIEWED_STATUSES
from .errors import MergeResultsError


def _is_duplicate(value: object) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(int(value))
    text = str(value).strip().lower()
    if not text:
        return False
    return text in {"true", "1", "yes", "y", "duplicate", "dup", "t"}


def _normalize_effect_status(value: object) -> str:
    if value is None:
        return "pending"
    text = str(value).strip().lower()
    if not text:
        return "pending"
    if text in _REVIEWED_STATUSES:
        return text
    if text in {"fail", "failed", "ng", "reject", "rejected", "x"}:
        return "pending"
    return text


def _ensure_no_correction_columns(row: dict[str, object], *, source: Path, row_index: int) -> None:
    if not row:
        return

    remaining = [
        key
        for key in row.keys()
        if isinstance(key, str) and key.endswith("Correction")
    ]
    if not remaining:
        return

    columns = ", ".join(sorted(remaining))
    raise MergeResultsError(
        "補助列が残存しています。Effect{n}Correction などの列を基列へ転記"
        " してから削除し、再実行してください: "
        f"{source} #{row_index} ({columns})"
    )


def _slot_has_content(row: dict[str, object], slot: int) -> bool:
    effect_key = f"Effect{slot}"
    raw_key = f"RawText{slot}"
    score_key = f"Effect{slot}Score"
    for key in (effect_key, raw_key, score_key):
        if key not in row:
            continue
        value = row.get(key)
        if value is None:
            continue
        if isinstance(value, str):
            if value.strip():
                return True
        else:
            return True
    return False


def _has_all_effects_reviewed(row: dict[str, object]) -> bool:
    slots: list[int] = []
    for key in row.keys():
        if not key.startswith("Effect") or not key.endswith("Status"):
            continue
        slot_text = key[len("Effect") : -len("Status")]
        if not slot_text.isdigit():
            continue
        slot = int(slot_text)
        if not _slot_has_content(row, slot):
            continue
        slots.append(slot)

    if not slots:
        return False

    for slot in slots:
        status = _normalize_effect_status(row.get(f"Effect{slot}Status"))
        if status not in _REVIEWED_STATUSES:
            return False
    return True


def _collect_field_order(rows: Sequence[dict[str, object]]) -> list[str]:
    order: list[str] = []
    reserved = [
        "Image",
        "BaseImage",
        "Dataset",
        "DatasetFolder",
        "SourceCsv",
        "SourceImage",
        "Duplicate",
        "ItemColor",
    ]

    def register(name: str) -> None:
        if not name:
            return
        if name not in order:
            order.append(name)

    for field in reserved:
        register(field)

    extra_fields: set[str] = set()
    for row in rows:
        for key in row.keys():
            if key in reserved:
                continue
            for prefix in EXTRA_FIELD_PREFIXES:
                if key.startswith(prefix):
                    extra_fields.add(key)
                    break
            else:
                register(key)

    for key in sorted(extra_fields, key=lambda value: (value.rstrip("0123456789"), value)):
        register(key)

    return order


__all__ = [
    "_collect_field_order",
    "_ensure_no_correction_columns",
    "_has_all_effects_reviewed",
    "_is_duplicate",
]

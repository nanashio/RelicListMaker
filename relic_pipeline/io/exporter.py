"""CSV export helpers for OCR pipeline results."""

from __future__ import annotations

import csv
import re
from pathlib import Path
from typing import Iterable, Mapping, MutableMapping, Sequence

from ..matching.levels import detect_level_from_text, find_level_candidates
from ..matching.effects import MatchResult
from ..settings import ExportOptions

_TRUE_VALUES = {"1", "true", "t", "yes", "y", "on"}
_FALSE_VALUES = {"0", "false", "f", "no", "n", "off"}


def parse_column_flag_value(value: object) -> bool | None:
    """Convert CLI/GUI supplied values into booleans for column flags."""

    if isinstance(value, bool):
        return value

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return bool(value)

    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in _TRUE_VALUES:
            return True
        if lowered in _FALSE_VALUES:
            return False
        if lowered == "":
            return None

    return None

LEVEL_OPTIONS_SEPARATOR = " | "


def normalize_column_visibility(
    overrides: Mapping[str, object] | None,
    *,
    defaults: MutableMapping[str, bool],
) -> MutableMapping[str, bool]:
    """Merge CLI overrides with the default column visibility flags."""

    flags = defaults.copy()
    if not overrides:
        return flags

    for raw_key, raw_value in overrides.items():
        key = str(raw_key)
        parsed = parse_column_flag_value(raw_value)
        if parsed is None:
            print(
                f"[WARN] 列 `{key}` の値を True/False に解釈できません: {raw_value!r}"
            )
            continue
        flags[key] = parsed
    return flags


def _serialize_level_options(levels: Sequence[str]) -> str:
    filtered = [level for level in levels if level]
    if not filtered:
        return "none"
    ordered: list[str] = []
    for level in filtered:
        if level not in ordered:
            ordered.append(level)
    return LEVEL_OPTIONS_SEPARATOR.join(ordered)


def _ensure_effect_slots(row: MutableMapping[str, object], options: ExportOptions) -> None:
    column_flags = options.column_visibility
    demerit_slots = set(options.demerit_slots or [])

    for idx in options.slot_range:
        effect_key = f"Effect{idx}"
        level_key = f"Effect{idx}Level"
        status_key = f"Effect{idx}Status"

        row.setdefault(effect_key, "")
        row.setdefault(level_key, "none")
        row.setdefault(status_key, "pending")
        row.setdefault(f"Effect{idx}Kind", "effect")

        if column_flags.get("LevelOptions", True):
            row.setdefault(f"Effect{idx}LevelOptions", "none")
        if column_flags.get("LevelCorrection", True):
            row.setdefault(f"Effect{idx}LevelCorrection", "")
        if column_flags.get("RawText", True):
            row.setdefault(f"RawText{idx}", "")
        if column_flags.get("Score", True):
            row.setdefault(f"Effect{idx}Score", 0.0)
        if column_flags.get("Source", True):
            row.setdefault(f"Effect{idx}Source", "")
            row.setdefault(f"Effect{idx}LevelSource", "none")

        if idx in demerit_slots:
            row.setdefault(f"Demerit{idx}", "")
            row.setdefault(f"Demerit{idx}Level", "none")
            row.setdefault(f"Demerit{idx}Status", "pending")
            row.setdefault(f"Demerit{idx}Kind", "demerit")
            if column_flags.get("LevelOptions", True):
                row.setdefault(f"Demerit{idx}LevelOptions", "none")
            if column_flags.get("LevelCorrection", True):
                row.setdefault(f"Demerit{idx}LevelCorrection", "")
            if column_flags.get("RawText", True):
                row.setdefault(f"Demerit{idx}RawText", "")
            if column_flags.get("Score", True):
                row.setdefault(f"Demerit{idx}Score", 0.0)
            if column_flags.get("Source", True):
                row.setdefault(f"Demerit{idx}Source", "")
                row.setdefault(f"Demerit{idx}LevelSource", "none")


def build_row(
    image_name: str,
    matches: Sequence[MatchResult],
    *,
    options: ExportOptions,
    demerit_matches: Mapping[int, MatchResult] | None = None,
) -> dict[str, object]:
    """Construct a CSV row for a single image."""

    column_flags = options.column_visibility
    row: dict[str, object] = {"Image": image_name, "Duplicate": False}

    if column_flags.get("ItemColor", True):
        row["ItemColor"] = options.item_color or "none"
    if column_flags.get("RelicType", True):
        row["RelicType"] = options.relic_type or "none"

    level_map = options.level_map or {}
    demerit_slots = set(options.demerit_slots or [])
    demerit_map = dict(demerit_matches or {})

    for idx, match in zip(options.slot_range, matches):
        effect_key = f"Effect{idx}"
        row[effect_key] = match.matched_text
        row[f"Effect{idx}Status"] = "pending"
        row[f"Effect{idx}Kind"] = "effect"

        if column_flags.get("RawText", True):
            row[f"RawText{idx}"] = match.raw_text
        if column_flags.get("Score", True):
            row[f"Effect{idx}Score"] = match.score
        if column_flags.get("Source", True):
            row[f"Effect{idx}Source"] = match.matched_text

        detected_level = ""
        if level_map:
            candidates = find_level_candidates(match.matched_text, level_map=level_map)
            if candidates:
                detected_level = detect_level_from_text(match.raw_text, candidates=candidates)
                if column_flags.get("LevelOptions", True):
                    row[f"Effect{idx}LevelOptions"] = _serialize_level_options(candidates)

        level_value = detected_level or "none"
        row[f"Effect{idx}Level"] = level_value
        if column_flags.get("Source", True):
            row[f"Effect{idx}LevelSource"] = level_value

        demerit_match = demerit_map.get(idx)
        if demerit_match is not None:
            row[f"Demerit{idx}"] = demerit_match.matched_text
            row[f"Demerit{idx}Status"] = "pending"
            row[f"Demerit{idx}Kind"] = "demerit"
            if column_flags.get("RawText", True):
                row[f"Demerit{idx}RawText"] = demerit_match.raw_text
            if column_flags.get("Score", True):
                row[f"Demerit{idx}Score"] = demerit_match.score
            if column_flags.get("Source", True):
                row[f"Demerit{idx}Source"] = demerit_match.matched_text
                row.setdefault(f"Demerit{idx}LevelSource", "none")
        elif idx in demerit_slots:
            row.setdefault(f"Demerit{idx}", "")
            row.setdefault(f"Demerit{idx}Status", "pending")
            row.setdefault(f"Demerit{idx}Kind", "demerit")
            if column_flags.get("RawText", True):
                row.setdefault(f"Demerit{idx}RawText", "")
            if column_flags.get("Score", True):
                row.setdefault(f"Demerit{idx}Score", 0.0)
            if column_flags.get("Source", True):
                row.setdefault(f"Demerit{idx}Source", "")
                row.setdefault(f"Demerit{idx}LevelSource", "none")

        if column_flags.get("LevelCorrection", True):
            row.setdefault(f"Effect{idx}LevelCorrection", "")

    _ensure_effect_slots(row, options)

    for hidden_key in (
        "Dataset",
        "DatasetFolder",
        "SourceCsv",
        "SourceImage",
        "BaseImage",
        "RelicType",
    ):
        if not column_flags.get(hidden_key, True):
            row.pop(hidden_key, None)

    return row


def _infer_slot_range(rows: Sequence[Mapping[str, object]]) -> range:
    max_slot = 0
    slot_pattern = re.compile(r"^Effect(\d+)$")
    for row in rows:
        for key in row.keys():
            match = slot_pattern.match(key)
            if match:
                slot_index = int(match.group(1))
                max_slot = max(max_slot, slot_index)
    return range(1, max_slot + 1)


def _infer_demerit_slots(rows: Sequence[Mapping[str, object]]) -> Sequence[int]:
    pattern = re.compile(r"^Demerit(\d+)")
    slots: set[int] = set()
    for row in rows:
        for key in row.keys():
            match = pattern.match(key)
            if match:
                slots.add(int(match.group(1)))
    return sorted(slots)


def write_csv(
    rows: Iterable[Mapping[str, object]],
    *,
    path: Path,
    column_flags: Mapping[str, bool],
) -> None:
    """Write OCR rows to CSV using the configured column flags."""

    row_list = list(rows)
    if not row_list:
        return

    slot_range = _infer_slot_range(row_list)
    demerit_slots = _infer_demerit_slots(row_list)

    fieldnames: list[str] = ["Image", "Duplicate"]
    if column_flags.get("ItemColor", True):
        fieldnames.append("ItemColor")
    if column_flags.get("RelicType", True):
        fieldnames.append("RelicType")

    for idx in slot_range:
        fieldnames.append(f"Effect{idx}")
        fieldnames.append(f"Effect{idx}Level")
        if column_flags.get("LevelOptions", True):
            fieldnames.append(f"Effect{idx}LevelOptions")
        fieldnames.append(f"Effect{idx}Status")
        fieldnames.append(f"Effect{idx}Kind")

    for idx in demerit_slots:
        fieldnames.append(f"Demerit{idx}")
        fieldnames.append(f"Demerit{idx}Level")
        if column_flags.get("LevelOptions", True):
            fieldnames.append(f"Demerit{idx}LevelOptions")
        fieldnames.append(f"Demerit{idx}Status")
        fieldnames.append(f"Demerit{idx}Kind")

    if column_flags.get("RawText", True):
        for idx in slot_range:
            fieldnames.append(f"RawText{idx}")
        for idx in demerit_slots:
            fieldnames.append(f"Demerit{idx}RawText")
    if column_flags.get("Score", True):
        for idx in slot_range:
            fieldnames.append(f"Effect{idx}Score")
        for idx in demerit_slots:
            fieldnames.append(f"Demerit{idx}Score")
    if column_flags.get("Source", True):
        for idx in slot_range:
            fieldnames.append(f"Effect{idx}Source")
            fieldnames.append(f"Effect{idx}LevelSource")
        for idx in demerit_slots:
            fieldnames.append(f"Demerit{idx}Source")
            fieldnames.append(f"Demerit{idx}LevelSource")
    if column_flags.get("LevelCorrection", True):
        for idx in slot_range:
            fieldnames.append(f"Effect{idx}LevelCorrection")
        for idx in demerit_slots:
            fieldnames.append(f"Demerit{idx}LevelCorrection")

    for row in row_list:
        for key in row.keys():
            if key not in fieldnames:
                fieldnames.append(key)

    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in row_list:
            writer.writerow(row)


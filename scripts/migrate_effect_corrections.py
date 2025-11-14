"""Utility to migrate legacy Effect{n}Correction columns into base fields."""

from __future__ import annotations

import argparse
import csv
import shutil
from pathlib import Path
from typing import Iterable, List, MutableMapping, Sequence

CORRECTION_MAP = (
    ("Effect{index}Correction", "Effect{index}", "Effect{index}Status"),
    ("Effect{index}LevelCorrection", "Effect{index}Level", "Effect{index}Status"),
    ("Demerit{index}Correction", "Demerit{index}", "Demerit{index}Status"),
)


def _detect_slots(fieldnames: Sequence[str]) -> List[int]:
    slots: set[int] = set()
    for name in fieldnames:
        if not isinstance(name, str):
            continue
        if name.startswith("Effect") and name[6:].isdigit():
            slots.add(int(name[6:]))
            continue
        if name.startswith("Effect") and "Level" in name:
            number = name[6:name.find("Level")]
            if number.isdigit():
                slots.add(int(number))
            continue
        if name.startswith("Demerit") and name[7:].isdigit():
            slots.add(int(name[7:]))
    return sorted(slots)



def _normalize_status(value: str | None) -> str:
    if value is None:
        return ""
    return str(value).strip().lower()



def migrate_rows(rows: Iterable[MutableMapping[str, str]]) -> List[MutableMapping[str, str]]:
    migrated: List[MutableMapping[str, str]] = []
    for row in rows:
        row_data: MutableMapping[str, str] = dict(row)
        slots = _detect_slots(row_data.keys())
        for slot in slots:
            for correction_tpl, target_tpl, status_tpl in CORRECTION_MAP:
                correction_key = correction_tpl.format(index=slot)
                if correction_key not in row_data:
                    continue
                target_key = target_tpl.format(index=slot)
                status_key = status_tpl.format(index=slot)
                value = row_data.get(correction_key)
                if value is not None and str(value).strip():
                    row_data[target_key] = str(value).strip()
                    if _normalize_status(row_data.get(status_key)) != "pass":
                        row_data[status_key] = "corrected"
                row_data.pop(correction_key, None)
        migrated.append(row_data)
    return migrated



def migrate_file(path: Path, *, backup: bool = True) -> None:
    original_text = path.read_text(encoding="utf-8")
    reader = csv.DictReader(original_text.splitlines())
    rows = migrate_rows(reader)
    fieldnames = [name for name in reader.fieldnames or [] if not name.endswith("Correction")]

    if backup:
        backup_path = path.with_suffix(path.suffix + ".bak")
        shutil.copy(path, backup_path)

    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)



def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("inputs", nargs="+", help="Path(s) to CSV files to migrate")
    parser.add_argument("--no-backup", action="store_true", help="Do not create .bak backups")
    return parser.parse_args(argv)



def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    for input_path in args.inputs:
        path = Path(input_path)
        if not path.exists():
            raise FileNotFoundError(f"CSV file not found: {path}")
        migrate_file(path, backup=not args.no_backup)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

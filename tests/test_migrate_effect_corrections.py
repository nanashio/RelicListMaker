from __future__ import annotations

import csv
from pathlib import Path

from scripts.migrate_effect_corrections import migrate_file, migrate_rows


def test_migrate_rows_transfers_corrections():
    rows = [
        {
            "Image": "sample.png",
            "Effect1": "Original",
            "Effect1Correction": "Manual",
            "Effect1Status": "pending",
            "Effect1Level": "none",
            "Effect1LevelCorrection": "+2",
            "Demerit1": "Heavy",
            "Demerit1Correction": "Light",
            "Demerit1Status": "pending",
        }
    ]
    migrated = migrate_rows(rows)
    assert migrated[0]["Effect1"] == "Manual"
    assert migrated[0]["Effect1Level"] == "+2"
    assert migrated[0]["Demerit1"] == "Light"
    assert migrated[0]["Effect1Status"] == "corrected"
    assert migrated[0]["Demerit1Status"] == "corrected"
    assert "Effect1Correction" not in migrated[0]
    assert "Effect1LevelCorrection" not in migrated[0]
    assert "Demerit1Correction" not in migrated[0]


def test_migrate_rows_respects_pass_status():
    rows = [
        {
            "Effect1": "Original",
            "Effect1Correction": "Manual",
            "Effect1Status": "pass",
        }
    ]
    migrated = migrate_rows(rows)
    assert migrated[0]["Effect1"] == "Manual"
    assert migrated[0]["Effect1Status"] == "pass"


def test_migrate_file_creates_backup(tmp_path: Path):
    csv_path = tmp_path / "input.csv"
    csv_path.write_text(
        "Image,Effect1,Effect1Correction,Effect1Status\n"
        "foo.png,Original,Manual,pending\n",
        encoding="utf-8",
    )

    migrate_file(csv_path)

    backup_path = csv_path.with_suffix(".csv.bak")
    assert backup_path.exists()

    with csv_path.open(encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        row = next(iter(reader))
        assert row["Effect1"] == "Manual"
        assert row["Effect1Status"] == "corrected"
        assert "Effect1Correction" not in reader.fieldnames


def test_migrate_file_without_backup(tmp_path: Path):
    csv_path = tmp_path / "input.csv"
    csv_path.write_text(
        "Image,Effect1,Effect1Correction,Effect1Status\n"
        "foo.png,Original,Manual,pending\n",
        encoding="utf-8",
    )

    migrate_file(csv_path, backup=False)
    assert not csv_path.with_suffix(".csv.bak").exists()



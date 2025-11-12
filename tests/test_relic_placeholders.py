import sys
import types
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

if "cv2" not in sys.modules:
    sys.modules["cv2"] = types.SimpleNamespace()

from relic_pipeline.io.exporter import _ensure_effect_slots, build_row, write_csv
from relic_pipeline.settings import DEFAULT_COLUMN_VISIBILITY, ExportOptions
from relic_pipeline.matching import MatchResult
from relic_data import (
    load_master_effect_metadata,
    load_master_effects_and_levels,
    normalize_master_values,
)


def test_normalize_master_values_keeps_placeholder():
    values = normalize_master_values(["-", "効果A", "-"])
    assert values == ["-", "効果A"]


def test_load_master_effects_includes_placeholder(tmp_path: Path):
    csv_path = tmp_path / "master.csv"
    csv_path.write_text(
        "\n".join(
            [
                "EffectBase,Category,Levels",
                "-,placeholder,FALSE",
                '効果A,カテゴリ,"+1, FALSE, +2"',
            ]
        ),
        encoding="utf-8",
    )

    effects, level_map = load_master_effects_and_levels(csv_path)

    assert "-" in effects
    assert "効果A" in effects
    assert "-" not in level_map
    assert level_map["効果A"] == ["+1", "+2"]


def test_load_master_effect_metadata_keeps_zero_placeholder(tmp_path: Path):
    csv_path = tmp_path / "master.csv"
    csv_path.write_text(
        "\n".join(
            [
                "EffectBase,Category,Levels,Demerit",
                '効果A,カテゴリ,"0,＋１,＋２","0,＋２"',
            ]
        ),
        encoding="utf-8",
    )

    metadata = load_master_effect_metadata(csv_path)
    assert metadata["効果a"]["hasDemerit"] is True
    assert metadata["効果a"]["levels"] == ["0", "＋２"]


def test_load_master_effect_metadata_ignores_false_tokens(tmp_path: Path):
    csv_path = tmp_path / "master.csv"
    csv_path.write_text(
        "\n".join(
            [
                "EffectBase,Category,Levels,Demerit",
                '効果A,カテゴリ,"＋１,＋２","FALSE,＋２"',
            ]
        ),
        encoding="utf-8",
    )

    metadata = load_master_effect_metadata(csv_path)
    assert metadata["効果a"]["hasDemerit"] is True
    assert metadata["効果a"]["levels"] == ["＋２"]


def test_ensure_effect_slots_adds_placeholder_values():
    row = {"Effect1": "効果A", "Effect1Status": "approved"}
    slot_range = range(1, 4)

    options = ExportOptions(
        column_visibility=dict(DEFAULT_COLUMN_VISIBILITY),
        slot_range=slot_range,
        level_map=None,
        item_color=None,
    )

    _ensure_effect_slots(row, options)

    assert row["Effect1"] == "効果A"
    assert row["Effect1Status"] == "approved"
    assert row["Effect2"] == "-"
    assert row["Effect3"] == "-"
    assert row["Effect2Status"] == "pending"
    assert row["Effect2Level"] == ""
    assert row["Effect2Kind"] == "effect"
    assert row["RawText2"] == ""
    assert row["Effect2Score"] == 0.0
    assert row["Effect2Source"] == ""
    assert row["Effect2LevelOptions"] == ""
    assert row["Effect2LevelCorrection"] == ""
    assert "Demerit1" not in row
    assert "Demerit2" not in row


def test_ensure_effect_slots_adds_demerit_columns():
    row = {}
    slot_range = range(1, 3)

    options = ExportOptions(
        column_visibility=dict(DEFAULT_COLUMN_VISIBILITY),
        slot_range=slot_range,
        level_map=None,
        item_color=None,
        demerit_slots=(2,),
    )

    _ensure_effect_slots(row, options)

    assert "Demerit1" not in row
    assert row["Demerit2"] == ""
    assert row["DemeritRawText2"] == ""
    assert row["DemeritScore2"] == 0.0
    assert row["DemeritSource2"] == ""


def test_write_csv_includes_relic_type_column(tmp_path: Path):
    column_flags = dict(DEFAULT_COLUMN_VISIBILITY)
    rows = [{"Image": "sample.png", "Duplicate": False, "RelicType": "deep"}]
    output = tmp_path / "results.csv"

    write_csv(rows, path=output, column_flags=column_flags)

    header = output.read_text(encoding="utf-8").splitlines()[0].split(",")
    assert "RelicType" in header


def test_write_csv_includes_demerit_columns(tmp_path: Path):
    column_flags = dict(DEFAULT_COLUMN_VISIBILITY)
    rows = [
        {
            "Image": "sample.png",
            "Duplicate": False,
            "Effect1": "効果A",
            "Effect1Level": "",
            "Effect1Status": "pending",
            "Effect1Kind": "effect",
            "Demerit1": "効果A",
            "DemeritRawText1": "OCR",
            "DemeritScore1": 87.5,
            "DemeritSource1": "dictionary",
        }
    ]

    output = tmp_path / "results.csv"

    write_csv(rows, path=output, column_flags=column_flags)

    header = output.read_text(encoding="utf-8").splitlines()[0].split(",")
    assert "Demerit1" in header
    assert "DemeritRawText1" in header
    assert "DemeritScore1" in header
    assert "DemeritSource1" in header


def test_build_row_merges_demerit_results():
    options = ExportOptions(
        column_visibility=dict(DEFAULT_COLUMN_VISIBILITY),
        slot_range=range(1, 2),
        level_map=None,
        item_color=None,
        demerit_slots=(1,),
    )

    effect_match = MatchResult(
        raw_text="Effect Raw",
        matched_text="Effect Matched",
        score=91.2,
        source="dictionary",
    )
    demerit_match = MatchResult(
        raw_text="Demerit Raw",
        matched_text="Demerit Matched",
        score=65.4,
        source="demerit",
    )

    row = build_row(
        "image.png",
        [effect_match],
        options=options,
        demerit_matches={1: demerit_match},
    )

    assert row["Effect1"] == "Effect Matched"
    assert row["Effect1Kind"] == "effect"
    assert row["RawText1"] == "Effect Raw"
    assert row["Effect1Score"] == 91.2
    assert row["Effect1Source"] == "dictionary"
    assert row["Demerit1"] == "Demerit Matched"
    assert row["DemeritRawText1"] == "Demerit Raw"
    assert row["DemeritScore1"] == 65.4
    assert row["DemeritSource1"] == "demerit"


def test_build_row_converts_zero_level_to_blank():
    options = ExportOptions(
        column_visibility=dict(DEFAULT_COLUMN_VISIBILITY),
        slot_range=range(1, 2),
        level_map={'Effect Matched': ['0', '＋3']},
        item_color=None,
        demerit_slots=(),
    )
    match = MatchResult(
        raw_text='0',
        matched_text='Effect Matched',
        score=88.0,
        source='dictionary',
    )

    row = build_row('image.png', [match], options=options)

    assert row['Effect1Level'] == ''
    assert row['Effect1LevelOptions'] == '＋3'

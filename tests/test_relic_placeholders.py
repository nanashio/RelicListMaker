import sys
import types
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

if "cv2" not in sys.modules:
    sys.modules["cv2"] = types.SimpleNamespace()

from pathlib import Path

from match_and_export import _ensure_effect_slots
from relic_data import load_master_effects_and_levels, normalize_master_values


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
                '効果A,カテゴリ,"+1, -, +2"',
            ]
        ),
        encoding="utf-8",
    )

    effects, level_map = load_master_effects_and_levels(csv_path)

    assert "-" in effects
    assert "効果A" in effects
    assert "-" not in level_map
    assert level_map["効果A"] == ["+1", "+2"]


def test_ensure_effect_slots_adds_placeholder_values():
    row = {"Effect1": "効果A", "Effect1Status": "approved"}
    slot_range = range(1, 4)

    _ensure_effect_slots(row, slot_range, {})

    assert row["Effect1"] == "効果A"
    assert row["Effect1Status"] == "approved"
    assert row["Effect2"] == "-"
    assert row["Effect3"] == "-"
    assert row["Effect2Status"] == "pending"
    assert row["Effect2Level"] == ""
    assert row["RawText2"] == ""
    assert row["Effect2Score"] == ""
    assert row["Effect2Source"] == ""
    assert row["Effect2LevelOptions"] == ""
    assert row["Effect2LevelCorrection"] == ""

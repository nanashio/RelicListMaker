import sys
import types
from argparse import Namespace
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from relic_pipeline.cli.commands import build_column_flags, process_images_command


def test_process_images_command_invokes_runner_with_overrides(monkeypatch):
    captured_runner: dict[str, object] = {}
    captured_builder: dict[str, object] = {}

    def fake_runner(**kwargs):
        captured_runner.update(kwargs)

    def fake_builder(**kwargs):
        captured_builder.update(kwargs)
        return types.SimpleNamespace(
            crop_boxes=[(0, 0, 1, 1)],
            ocr_settings=types.SimpleNamespace(engine=kwargs.get("ocr_engine", "tesseract")),
            export_options=types.SimpleNamespace(
                column_visibility={
                    "RawText": True,
                    "Score": True,
                    "Source": True,
                },
                slot_range=range(1, 2),
                demerit_slots=(),
            ),
            default_matching=types.SimpleNamespace(dictionary=["dummy"]),
            slot_settings={},
            slot_sources={},
            demerit_matching=None,
        )

    monkeypatch.setattr("match_and_export.build_processing_parameters", fake_builder)

    args = Namespace(
        image_dir="crops-dir",
        output_path="out.csv",
        scale=1.25,
        upsample=1.5,
        preprocess=False,
        corrections_csv="corr.csv",
        item_color="blue",
        column_visibility=["RawText=false", "Score=0", "Source=on"],
        relic_type="deep",
    )

    exit_code = process_images_command(args, runner=fake_runner)

    assert exit_code == 0
    assert captured_builder["scale"] == pytest.approx(1.25)
    assert captured_builder["upsample"] == pytest.approx(1.5)
    assert captured_builder["preprocess"] is False
    assert captured_builder["corrections_csv"] == "corr.csv"
    assert captured_builder["item_color"] == "blue"
    assert captured_builder["column_visibility"]["RawText"] is False
    assert captured_builder["column_visibility"]["Score"] is False
    assert captured_builder["column_visibility"]["Source"] is True
    assert captured_builder["relic_type"] == "deep"

    assert captured_runner["image_dir"] == "crops-dir"
    assert captured_runner["output_path"] == "out.csv"
    assert captured_runner["crop_boxes"] == [(0, 0, 1, 1)]
    assert captured_runner["ocr_settings"].engine == "tesseract"
    assert captured_runner["export_options"].column_visibility["RawText"] is True
    assert captured_runner["default_matching"].dictionary == ["dummy"]


def test_build_column_flags_merges_defaults(capsys):
    flags = build_column_flags(["RawText=false", "Unknown=1", "Invalid"])

    captured = capsys.readouterr()
    assert "列指定には KEY=VALUE" in captured.out
    assert flags["RawText"] is False
    assert flags["Score"] is True
    assert flags["Unknown"] is True

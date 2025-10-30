import sys
from argparse import Namespace
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from relic_pipeline.cli.commands import build_column_flags, process_images_command


def test_process_images_command_invokes_runner_with_overrides():
    captured: dict[str, object] = {}

    def fake_runner(**kwargs):
        captured.update(kwargs)

    args = Namespace(
        image_dir="crops-dir",
        output_path="out.csv",
        scale=1.25,
        upsample=1.5,
        preprocess=False,
        corrections_csv="corr.csv",
        item_color="blue",
        column_visibility=["RawText=false", "Score=0", "Source=on"],
    )

    exit_code = process_images_command(args, runner=fake_runner)

    assert exit_code == 0
    assert captured["image_dir"] == "crops-dir"
    assert captured["output_path"] == "out.csv"
    assert captured["scale"] == pytest.approx(1.25)
    assert captured["upsample"] == pytest.approx(1.5)
    assert captured["preprocess"] is False
    assert captured["corrections_csv"] == "corr.csv"
    assert captured["item_color"] == "blue"
    assert captured["column_visibility"] == {
        "RawText": False,
        "Score": False,
        "Source": True,
    }


def test_build_column_flags_merges_defaults(capsys):
    flags = build_column_flags(["RawText=false", "Unknown=1", "Invalid"])

    captured = capsys.readouterr()
    assert "列指定には KEY=VALUE" in captured.out
    assert flags["RawText"] is False
    assert flags["Score"] is True
    assert flags["Unknown"] is True

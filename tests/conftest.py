from __future__ import annotations

import shutil
from pathlib import Path

import pytest


@pytest.fixture
def sample_results_dir(tmp_path: Path) -> Path:
    """tests/data/results 配下の実データを一時領域へコピーして返す。"""
    source = Path(__file__).resolve().parent / "data" / "results"
    if not source.exists():
        pytest.skip("tests/data/results が存在しないため、実データを用いたテストをスキップします。")

    destination = tmp_path / "results"
    shutil.copytree(source, destination)
    return destination

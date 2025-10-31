from __future__ import annotations

import shutil
import sys
import types
from pathlib import Path

import pytest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

if "cv2" not in sys.modules:
    sys.modules["cv2"] = types.SimpleNamespace()

# `match_and_export` をテスト全体でインポートしておくことで、
# `tests/pipeline/test_processors.py` が挿入するスタブより先に
# 実装モジュールをロードし、プライベート関数の互換性テストが可能になる。
import match_and_export  # noqa: F401  pylint: disable=unused-import


@pytest.fixture
def sample_results_dir(tmp_path: Path) -> Path:
    """tests/data/results 配下の実データを一時領域へコピーして返す。"""
    source = Path(__file__).resolve().parent / "data" / "results"
    if not source.is_dir():
        pytest.skip(
            "tests/data/results が存在しないため、実データを用いたテストをスキップします。",
            allow_module_level=True,
        )

    destination = tmp_path / "results"
    shutil.copytree(source, destination)
    return destination

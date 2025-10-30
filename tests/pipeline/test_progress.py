"""`pipeline.progress` の挙動テスト."""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import List, Tuple

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
PROGRESS_PATH = PROJECT_ROOT / "pipeline" / "progress.py"
_spec = importlib.util.spec_from_file_location("pipeline.progress", PROGRESS_PATH)
progress = importlib.util.module_from_spec(_spec)
assert _spec and _spec.loader
sys.modules[_spec.name] = progress
_spec.loader.exec_module(progress)

CallbackProgressReporter = progress.CallbackProgressReporter
CliProgressReporter = progress.CliProgressReporter


@pytest.fixture
def event_collector() -> List[Tuple[int, int, str]]:
    return []


def test_callback_progress_reporter_tracks_steps(event_collector: List[Tuple[int, int, str]]) -> None:
    """ステップ数とメッセージがコールバックへ正しく伝搬されることを確認する."""

    def _callback(current: int, total: int, message: str) -> None:
        event_collector.append((current, total, message))

    reporter = CallbackProgressReporter(callback=_callback)
    reporter.prepare(3)

    reporter.step("処理開始")
    reporter.advance("抽出完了")
    reporter.advance("OCR 完了")
    reporter.advance("HTML 完了")
    reporter.advance("追加の advance は上限で打ち止め")

    assert event_collector == [
        (0, 3, "処理開始"),
        (1, 3, "抽出完了"),
        (2, 3, "OCR 完了"),
        (3, 3, "HTML 完了"),
        (3, 3, "追加の advance は上限で打ち止め"),
    ]
    assert reporter._current_step == reporter._total_steps == 3  # type: ignore[attr-defined]


def test_cli_progress_reporter_emits_and_handles_callback_errors(
    capsys: pytest.CaptureFixture[str],
    event_collector: List[Tuple[int, int, str]],
) -> None:
    """標準出力とコールバックが両立し、例外が握り潰されることを検証する."""

    def _callback(current: int, total: int, message: str) -> None:
        event_collector.append((current, total, message))
        if message == "進行状況計測中":
            raise RuntimeError("intentional callback failure")

    reporter = CliProgressReporter(callback=_callback)
    reporter.prepare(2)

    reporter.step("進行状況計測中")
    first_out = capsys.readouterr().out
    assert "[PROGRESS] (0/2) 進行状況計測中" in first_out
    assert "[WARN] プログレス更新に失敗しました" in first_out

    reporter.advance("1 件目完了")
    second_out = capsys.readouterr().out
    assert "[PROGRESS] (1/2) 1 件目完了" in second_out

    reporter.advance("全件完了")
    third_out = capsys.readouterr().out
    assert "[PROGRESS] (2/2) 全件完了" in third_out

    assert event_collector == [
        (0, 2, "進行状況計測中"),
        (1, 2, "1 件目完了"),
        (2, 2, "全件完了"),
    ]
    assert reporter._current_step == reporter._total_steps == 2  # type: ignore[attr-defined]

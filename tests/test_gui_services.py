"""gui_services モジュールのサービス層を検証するテスト."""
from __future__ import annotations

import threading
from pathlib import Path

import pytest

from gui_services import BackgroundTaskRunner, GuiState, PipelineExecutor
from pipeline import DEFAULT_GCP_CREDENTIALS_FILENAME, DEFAULT_OCR_ENGINE, PipelineSettings


class DummyReporter:
    def __init__(self, *, callback):
        self.callback = callback


def build_state(tmp_path: Path) -> GuiState:
    video_dir = tmp_path / "videos"
    results_dir = tmp_path / "results"
    entries = [
        {"path": str(video_dir / "a.mp4"), "color": "red", "relic_type": "normal"},
        {"path": str(video_dir / "b.mp4"), "color": "none", "relic_type": "deep"},
        {"path": "", "color": "green"},
    ]
    return GuiState(
        base_dir=tmp_path,
        video_dir=video_dir,
        results_dir=results_dir,
        queue_entries=entries,
        ocr_upsample=2.0,
        ocr_engine="vision",
        save_full_frames=True,
        column_visibility={"ItemColor": True, "RawText": True},
        merge_only_reviewed=False,
        server_host="0.0.0.0",
        server_port=8080,
        gcp_credentials_filename="bundled.json",
    )


def test_gui_state_accessors(tmp_path: Path) -> None:
    state = build_state(tmp_path)

    assert state.videos_to_process() == [entry["path"] for entry in state.queue_entries[:2]]
    assert state.color_overrides() == {state.queue_entries[0]["path"]: "red"}
    assert state.type_overrides() == {
        state.queue_entries[0]["path"]: "normal",
        state.queue_entries[1]["path"]: "deep",
    }


def test_pipeline_executor_builds_settings(tmp_path: Path) -> None:
    state = build_state(tmp_path)
    captured: dict[str, object] = {}

    def fake_runner(*, settings, reporter):
        captured["settings"] = settings
        captured["reporter"] = reporter

    executor = PipelineExecutor(
        pipeline_runner=fake_runner,
        reporter_factory=lambda **kwargs: DummyReporter(**kwargs),
        merge_func=lambda *_, **__: Path("merged.csv"),
        server_factory=lambda *_, **__: None,
    )

    def callback(current: int, total: int, message: str) -> None:
        captured.setdefault("progress", []).append((current, total, message))

    executor.execute_pipeline(state, progress_callback=callback)

    settings = captured["settings"]
    assert isinstance(settings, PipelineSettings)
    assert settings.video_dir == state.video_dir
    assert settings.result_dir == state.results_dir
    assert settings.video_files == state.videos_to_process()
    assert settings.item_color_overrides == state.color_overrides()
    assert settings.relic_type_overrides == state.type_overrides()
    assert settings.ocr_engine == state.ocr_engine
    assert settings.gcp_credentials is None
    assert settings.gcp_credentials_filename == state.gcp_credentials_filename
    assert settings.save_full_frames is True
    assert settings.csv_column_visibility == dict(state.column_visibility)

    reporter = captured["reporter"]
    assert isinstance(reporter, DummyReporter)
    assert reporter.callback is callback


def test_pipeline_executor_merge_and_server(tmp_path: Path) -> None:
    state = build_state(tmp_path)
    state.ocr_engine = DEFAULT_OCR_ENGINE
    state.gcp_credentials_filename = DEFAULT_GCP_CREDENTIALS_FILENAME
    merge_calls: dict[str, object] = {}
    server_calls: dict[str, object] = {}

    def fake_merge(results_dir: str, *, only_reviewed: bool) -> Path:
        merge_calls["dir"] = results_dir
        merge_calls["only_reviewed"] = only_reviewed
        return Path(results_dir) / "merged.csv"

    class DummyContext:
        def __init__(self, **kwargs):
            server_calls.update(kwargs)

    executor = PipelineExecutor(
        pipeline_runner=lambda **_: None,
        reporter_factory=lambda **_: DummyReporter(callback=lambda *_: None),
        merge_func=fake_merge,
        server_factory=lambda **kwargs: DummyContext(**kwargs),
    )

    merged = executor.merge_results(state)
    assert merged == state.results_dir / "merged.csv"
    assert merge_calls == {"dir": str(state.results_dir), "only_reviewed": state.merge_only_reviewed}

    context = executor.start_server(state)
    assert isinstance(context, DummyContext)
    assert server_calls == {
        "results_dir": str(state.results_dir),
        "host": state.server_host,
        "port": state.server_port,
        "video": None,
    }


def test_background_task_runner_start_and_mark() -> None:
    runner = BackgroundTaskRunner()
    executed = threading.Event()

    def task() -> None:
        executed.set()

    thread = runner.start("task", task)
    thread.join(timeout=1)
    assert executed.is_set()
    runner.mark_finished("task")
    assert runner.is_running("task") is False


def test_background_task_runner_prevents_duplicates() -> None:
    runner = BackgroundTaskRunner()
    started = threading.Event()
    finish = threading.Event()

    def task() -> None:
        started.set()
        finish.wait(timeout=1)

    thread = runner.start("long", task)
    started.wait(timeout=1)
    with pytest.raises(RuntimeError):
        runner.start("long", task)

    finish.set()
    thread.join(timeout=1)
    runner.mark_finished("long")


def test_background_task_runner_join_is_safe() -> None:
    runner = BackgroundTaskRunner()
    # 未登録キーでも例外が出ないことを確認
    runner.join("missing", timeout=0.01)

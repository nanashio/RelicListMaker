"""GUI向けのサービス層ヘルパー."""
from __future__ import annotations

import re
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Mapping

from relic_cli.commands.merge_results import merge_results
from pipeline import (
    DEFAULT_GCP_CREDENTIALS_FILENAME,
    DEFAULT_OCR_ENGINE,
    CallbackProgressReporter,
    PipelineSettings,
    run_pipeline,
)
from viewer_server import ServerContext, create_server


@dataclass
class GuiState:
    """GUIフォームの状態と処理設定を保持する."""

    base_dir: Path
    video_dir: Path
    results_dir: Path
    queue_entries: list[dict[str, str]] = field(default_factory=list)
    ocr_upsample: float = 1.0
    ocr_engine: str = DEFAULT_OCR_ENGINE
    gcp_credentials: str | None = None
    gcp_credentials_filename: str | None = DEFAULT_GCP_CREDENTIALS_FILENAME
    save_full_frames: bool = False
    column_visibility: Mapping[str, bool] = field(default_factory=dict)
    merge_only_reviewed: bool = True
    server_host: str = "127.0.0.1"
    server_port: int = 0

    def videos_to_process(self) -> list[str]:
        return [entry["path"] for entry in self.queue_entries if entry.get("path")]

    def color_overrides(self) -> dict[str, str]:
        overrides: dict[str, str] = {}
        for entry in self.queue_entries:
            color = entry.get("color")
            path = entry.get("path")
            if not path or not color or color == "none":
                continue
            overrides[path] = color
        return overrides

    def type_overrides(self) -> dict[str, str]:
        overrides: dict[str, str] = {}
        for entry in self.queue_entries:
            path = entry.get("path")
            relic_type = entry.get("relic_type")
            if not path or not relic_type:
                continue
            overrides[path] = relic_type
        return overrides


class PipelineExecutor:
    """パイプライン、マージ、サーバー起動を司るサービス."""

    def __init__(
        self,
        *,
        pipeline_runner: Callable[[PipelineSettings, CallbackProgressReporter], None] = run_pipeline,
        reporter_factory: Callable[..., CallbackProgressReporter] = CallbackProgressReporter,
        merge_func: Callable[..., Path] = merge_results,
        server_factory: Callable[..., ServerContext] = create_server,
    ) -> None:
        self._pipeline_runner = pipeline_runner
        self._reporter_factory = reporter_factory
        self._merge_func = merge_func
        self._server_factory = server_factory

    def execute_pipeline(
        self,
        state: GuiState,
        *,
        progress_callback: Callable[[int, int, str], None],
        save_frames: bool | None = None,
        templates_only: bool = False,
    ) -> None:
        settings = PipelineSettings(
            video_dir=str(state.video_dir),
            result_dir=str(state.results_dir),
            ocr_upsample=state.ocr_upsample,
            ocr_engine=state.ocr_engine,
            gcp_credentials=state.gcp_credentials,
            gcp_credentials_filename=state.gcp_credentials_filename,
            video_files=state.videos_to_process(),
            item_color_overrides=state.color_overrides(),
            relic_type_overrides=state.type_overrides(),
            save_full_frames=state.save_full_frames if save_frames is None else save_frames,
            csv_column_visibility=dict(state.column_visibility),
            templates_only=templates_only,
        )
        reporter = self._reporter_factory(callback=progress_callback)
        self._pipeline_runner(settings=settings, reporter=reporter)

    def merge_results(self, state: GuiState) -> Path:
        return self._merge_func(str(state.results_dir), only_reviewed=state.merge_only_reviewed)

    def start_server(self, state: GuiState) -> ServerContext:
        return self._server_factory(
            results_dir=str(state.results_dir),
            host=state.server_host,
            port=state.server_port,
            video=None,
        )


class BackgroundTaskRunner:
    """バックグラウンドタスク実行を共通化するヘルパー."""

    def __init__(self, thread_factory: Callable[..., threading.Thread] | None = None) -> None:
        self._thread_factory = thread_factory or threading.Thread
        self._threads: dict[str, threading.Thread] = {}
        self._lock = threading.Lock()

    def is_running(self, key: str) -> bool:
        with self._lock:
            thread = self._threads.get(key)
            return bool(thread and thread.is_alive())

    def start(self, key: str, target: Callable[[], None]) -> threading.Thread:
        with self._lock:
            existing = self._threads.get(key)
            if existing and existing.is_alive():
                raise RuntimeError(f"Task '{key}' is already running")
            thread = self._thread_factory(target=target, daemon=True)
            self._threads[key] = thread
            thread.start()
            return thread

    def mark_finished(self, key: str) -> None:
        with self._lock:
            self._threads.pop(key, None)

    def join(self, key: str, timeout: float | None = None) -> None:
        thread = None
        with self._lock:
            thread = self._threads.get(key)
        if thread:
            thread.join(timeout=timeout)


_APP_VERSION_RE = re.compile(r'data-app-version="([^"]+)"', re.IGNORECASE)
_GENERATOR_RE = re.compile(
    r'<meta[^>]+name=["\']generator["\'][^>]+content=["\']([^"\']+)["\']',
    re.IGNORECASE,
)


def detect_gallery_template_version(results_dir: Path) -> str | None:
    viewer_path = Path(results_dir) / "gallery" / "index.html"
    try:
        html_text = viewer_path.read_text(encoding="utf-8")
    except OSError:
        return None

    for pattern in (_APP_VERSION_RE, _GENERATOR_RE):
        match = pattern.search(html_text)
        if not match:
            continue
        version = match.group(1).replace("\ufeff", "").strip()
        if version:
            return version

    return None

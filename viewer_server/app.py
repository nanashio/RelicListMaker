"""サーバーライフサイクル管理."""
from __future__ import annotations

import threading
import webbrowser
from dataclasses import dataclass, field
from http.server import ThreadingHTTPServer
from pathlib import Path
from typing import Optional
from urllib.parse import quote

from .index_page import iter_gallery_files


@dataclass
class ServerContext:
    """HTTP サーバーのライフサイクルを管理するコンテキスト."""

    server: ThreadingHTTPServer
    host: str
    port: int
    results_dir: Path
    initial_viewer: Optional[Path]
    matched_initial: bool
    _thread: Optional[threading.Thread] = field(default=None, init=False, repr=False)

    def start_in_thread(self) -> threading.Thread:
        """サーバーをバックグラウンドスレッドで起動する."""

        if self._thread and self._thread.is_alive():
            return self._thread
        thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        thread.start()
        self._thread = thread
        return thread

    def stop(self) -> None:
        """サーバーを停止し、ソケットを解放する."""

        self.server.shutdown()
        self.server.server_close()

    def __enter__(self) -> "ServerContext":
        self.start_in_thread()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:  # noqa: ANN001 - 標準プロトコル準拠
        self.stop()
        if self._thread:
            self._thread.join(timeout=2)


def resolve_results_dir(path_str: str) -> Path:
    path = Path(path_str).expanduser().resolve()
    path.mkdir(parents=True, exist_ok=True)
    return path


def find_viewer(results_dir: Path, video_name: Optional[str]) -> tuple[Optional[Path], bool]:
    candidates = iter_gallery_files(results_dir)
    if not candidates:
        return None, False
    if not video_name:
        return candidates[0], True
    suffix = "_viewer.html"
    for candidate in candidates:
        name = candidate.name
        stem = candidate.stem
        parent_name = candidate.parent.name
        if name == f"{video_name}{suffix}" or stem == f"{video_name}_viewer" or parent_name == video_name:
            return candidate, True
    return candidates[0], False


def open_browser(results_dir: Path, target: Optional[Path], host: str, port: int) -> None:
    if target is None:
        url_path = ""
    else:
        try:
            rel = target.relative_to(results_dir)
            url_path = quote(rel.as_posix())
        except ValueError:
            url_path = quote(target.as_posix())
    browser_host = "localhost" if host in {"0.0.0.0", "::"} else host
    url = f"http://{browser_host}:{port}/{url_path}" if url_path else f"http://{browser_host}:{port}/"
    threading.Thread(target=lambda: webbrowser.open(url), daemon=True).start()

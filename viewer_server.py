"""結果ビューワ用の軽量HTTPサーバー."""
from __future__ import annotations

from viewer_server.main import create_server, main
from viewer_server.handlers import API_SAVE_PATH, GalleryRequestHandler
from viewer_server.app import ServerContext, find_viewer, open_browser as _open_browser, resolve_results_dir as _resolve_results_dir

__all__ = [
    "API_SAVE_PATH",
    "GalleryRequestHandler",
    "ServerContext",
    "create_server",
    "find_viewer",
    "main",
    "_open_browser",
    "_resolve_results_dir",
]


if __name__ == "__main__":  # pragma: no cover
    main()

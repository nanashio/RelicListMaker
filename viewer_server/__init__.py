"""viewer_server パッケージ."""
from __future__ import annotations

from importlib import import_module
from typing import TYPE_CHECKING

from .app import ServerContext, find_viewer, open_browser, resolve_results_dir
from .handlers import API_SAVE_PATH, GalleryRequestHandler

if TYPE_CHECKING:  # pragma: no cover - 型チェック専用
    from .main import create_server, main

__all__ = [
    "API_SAVE_PATH",
    "GalleryRequestHandler",
    "ServerContext",
    "create_server",
    "find_viewer",
    "main",
    "open_browser",
    "resolve_results_dir",
]


def __getattr__(name: str):
    if name in {"create_server", "main"}:
        module = import_module(".main", __name__)
        value = getattr(module, name)
        globals()[name] = value
        return value
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def __dir__():
    return sorted(__all__)

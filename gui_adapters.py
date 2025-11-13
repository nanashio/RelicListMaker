"""`gui.adapters` モジュールへの互換ラッパー."""
from __future__ import annotations

from gui.adapters import (
    DND_FILES,
    HAS_TKDND,
    QueueWriter,
    TkinterDnD,
    get_windows_drop_support,
    redirect_streams,
)

__all__ = [
    "DND_FILES",
    "HAS_TKDND",
    "QueueWriter",
    "TkinterDnD",
    "redirect_streams",
    "get_windows_drop_support",
]

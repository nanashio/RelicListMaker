from __future__ import annotations

from .adapters import (
    DND_FILES,
    HAS_TKDND,
    QueueWriter,
    TkinterDnD,
    get_windows_drop_support,
    redirect_streams,
)
from .app import RelicGuiApp, main
from .services import BackgroundTaskRunner, GuiState, PipelineExecutor

__all__ = [
    "RelicGuiApp",
    "main",
    "GuiState",
    "BackgroundTaskRunner",
    "PipelineExecutor",
    "QueueWriter",
    "redirect_streams",
    "TkinterDnD",
    "HAS_TKDND",
    "DND_FILES",
    "get_windows_drop_support",
]

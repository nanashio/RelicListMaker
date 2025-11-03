"""GUI向けのドラッグ＆ドロップ・ログ関連アダプタ."""
from __future__ import annotations

import contextlib
import io
import queue
import sys
import tkinter as tk
from typing import Iterator

try:
    from tkinterdnd2 import DND_FILES, TkinterDnD  # type: ignore

    HAS_TKDND = True
except Exception:  # noqa: BLE001 - optional dependency fallback
    TkinterDnD = None
    DND_FILES = "DND_Files"
    HAS_TKDND = False

if sys.platform.startswith("win"):
    import ctypes
    from ctypes import wintypes
else:  # pragma: no cover - 非Windowsでは利用されない
    ctypes = None
    wintypes = None


class QueueWriter(io.TextIOBase):
    """標準ストリームをキューに流すための擬似ファイル."""

    def __init__(self, target_queue: "queue.Queue[str]") -> None:
        super().__init__()
        self._queue = target_queue

    def write(self, data: str) -> int:
        if not data:
            return 0
        self._queue.put(data)
        return len(data)

    def flush(self) -> None:  # pragma: no cover - queue操作は副作用なし
        return None


@contextlib.contextmanager
def redirect_streams(target_queue: "queue.Queue[str]") -> Iterator[None]:
    """標準出力・標準エラーを指定キューへリダイレクトする."""

    writer = QueueWriter(target_queue)
    original_stdout = sys.stdout
    original_stderr = sys.stderr
    try:
        sys.stdout = writer
        sys.stderr = writer
        yield
    finally:
        sys.stdout = original_stdout
        sys.stderr = original_stderr


_WINDOWS_DROP_SUPPORT = None


if sys.platform.startswith("win") and ctypes is not None and hasattr(wintypes, "LRESULT"):

    class WindowsDropSupport:
        """TkウィジェットへのDrag & DropをWin32 APIで提供する."""

        WM_DROPFILES = 0x0233
        GWL_WNDPROC = -4

        def __init__(self) -> None:
            self._user32 = ctypes.windll.user32
            self._shell32 = ctypes.windll.shell32
            self._targets: dict[int, dict[str, object]] = {}
            self._wndproc_factory = ctypes.WINFUNCTYPE(
                wintypes.LRESULT,
                wintypes.HWND,
                wintypes.UINT,
                wintypes.WPARAM,
                wintypes.LPARAM,
            )
            self._set_window_long = self._user32.SetWindowLongPtrW
            self._set_window_long.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_void_p]
            self._set_window_long.restype = ctypes.c_void_p
            self._call_window_proc = self._user32.CallWindowProcW
            self._call_window_proc.argtypes = [ctypes.c_void_p, wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
            self._call_window_proc.restype = wintypes.LRESULT
            self._shell32.DragAcceptFiles.argtypes = [wintypes.HWND, wintypes.BOOL]
            self._shell32.DragAcceptFiles.restype = None
            self._shell32.DragQueryFileW.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_wchar_p, ctypes.c_uint]
            self._shell32.DragQueryFileW.restype = ctypes.c_uint
            self._shell32.DragFinish.argtypes = [ctypes.c_void_p]
            self._shell32.DragFinish.restype = None

        def register(self, widget: tk.Misc, callback) -> None:
            hwnd = int(widget.winfo_id())
            entry = self._targets.get(hwnd)
            if entry is None:
                callbacks: list = []
                entry = {"widget": widget, "callbacks": callbacks}

                def wnd_proc(h_wnd, msg, w_param, l_param):
                    if msg == self.WM_DROPFILES:
                        paths = self._extract_paths(w_param)
                        if paths:
                            for cb in list(callbacks):
                                widget.after(0, cb, list(paths))
                        return 0
                    return self._call_window_proc(entry["old_proc"], h_wnd, msg, w_param, l_param)

                proc = self._wndproc_factory(wnd_proc)
                old_proc = self._set_window_long(
                    wintypes.HWND(hwnd),
                    self.GWL_WNDPROC,
                    ctypes.cast(proc, ctypes.c_void_p),
                )
                self._shell32.DragAcceptFiles(wintypes.HWND(hwnd), True)
                entry.update({"proc": proc, "old_proc": old_proc})
                self._targets[hwnd] = entry
            else:
                callbacks = entry["callbacks"]

            if callback not in callbacks:
                callbacks.append(callback)

        def unregister(self, widget: tk.Misc) -> None:
            hwnd = int(widget.winfo_id())
            entry = self._targets.get(hwnd)
            if not entry:
                return
            entry["callbacks"] = []
            self._set_window_long(wintypes.HWND(hwnd), self.GWL_WNDPROC, entry["old_proc"])
            self._shell32.DragAcceptFiles(wintypes.HWND(hwnd), False)
            self._targets.pop(hwnd, None)

        def _extract_paths(self, h_drop) -> list[str]:
            count = self._shell32.DragQueryFileW(h_drop, 0xFFFFFFFF, None, 0)
            paths: list[str] = []
            for index in range(count):
                length = self._shell32.DragQueryFileW(h_drop, index, None, 0) + 1
                buffer = ctypes.create_unicode_buffer(length)
                self._shell32.DragQueryFileW(h_drop, index, buffer, length)
                paths.append(buffer.value)
            self._shell32.DragFinish(h_drop)
            return paths


    def get_windows_drop_support() -> WindowsDropSupport | None:
        global _WINDOWS_DROP_SUPPORT
        if _WINDOWS_DROP_SUPPORT is None:
            _WINDOWS_DROP_SUPPORT = WindowsDropSupport()
        return _WINDOWS_DROP_SUPPORT

else:

    class WindowsDropSupport:  # pragma: no cover - Windows専用のため
        def register(self, widget: tk.Misc, callback) -> None:  # noqa: D401
            """Windows以外ではDrag & Dropを提供しないダミー."""

        def unregister(self, widget: tk.Misc) -> None:  # noqa: D401
            """Windows以外ではDrag & Dropを提供しないダミー."""

    def get_windows_drop_support() -> None:  # pragma: no cover - 非Windows
        return None

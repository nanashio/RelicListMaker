from __future__ import annotations

import argparse
import contextlib
import queue
import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import messagebox
from typing import Iterator, Optional, Sequence

from .adapters import TkinterDnD
from .services import BackgroundTaskRunner, GuiState, PipelineExecutor
from viewer_server import ServerContext, _open_browser
from version_info import get_version

from .config_store import AppConfig, CONFIG_FILE_NAME, load_config, save_config
from .controllers import MergeController, PipelineController, ServerController
from .handlers import AppEventHandlers
from .layout import LayoutComponents, LayoutManager

VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".avi", ".wmv", ".m4v"}
GITHUB_URL = "https://github.com/nanashio/RelicListMaker"


@contextlib.contextmanager
def _windows_cli_output(argv: Sequence[str] | None) -> Iterator[None]:
    if not sys.platform.startswith("win"):
        yield
        return
    if not argv:
        yield
        return
    try:
        kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001 - ctypes未提供の環境では無視
        yield
        return
    attached = False
    if kernel32.AttachConsole(ctypes.c_uint(-1).value):  # type: ignore[attr-defined]
        attached = True
    else:
        last_error = kernel32.GetLastError()  # type: ignore[attr-defined]
        if last_error != 5:
            yield
            return
    old_stdout, old_stderr = sys.stdout, sys.stderr
    try:
        new_stdout = open("CONOUT$", "w", encoding="utf-8", buffering=1)
        new_stderr = open("CONOUT$", "w", encoding="utf-8", buffering=1)
    except OSError:
        if attached:
            kernel32.FreeConsole()  # type: ignore[attr-defined]
        yield
        return
    sys.stdout = new_stdout
    sys.stderr = new_stderr
    try:
        yield
    finally:
        try:
            sys.stdout.flush()
        except Exception:  # noqa: BLE001
            pass
        try:
            sys.stderr.flush()
        except Exception:  # noqa: BLE001
            pass
        sys.stdout = old_stdout
        sys.stderr = old_stderr
        new_stdout.close()
        new_stderr.close()
        if attached:
            kernel32.FreeConsole()  # type: ignore[attr-defined]


if sys.platform.startswith("win"):
    import ctypes
else:
    ctypes = None  # type: ignore[assignment]


class RelicGuiApp:
    POLL_INTERVAL_MS = 100
    ERROR_DISPLAY_MAX_CHARS = 48

    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("RelicListMaker ツール")
        self.app_version = get_version()
        self.github_url = GITHUB_URL
        self.video_extensions = VIDEO_EXTENSIONS

        self.base_dir = self._default_base_dir()
        self.config_path = self.base_dir / CONFIG_FILE_NAME

        self.video_dir_var = tk.StringVar(value="videos")
        self.results_dir_var = tk.StringVar(value="results")
        self.ocr_upsample_var = tk.StringVar(value="1.0")
        self.ocr_engine_var = tk.StringVar(value="tesseract")
        self.gcp_credentials_filename_var = tk.StringVar()
        self.server_host_var = tk.StringVar(value="127.0.0.1")
        self.server_port_var = tk.StringVar(value="0")
        self.open_browser_var = tk.BooleanVar(value=True)
        self.save_frames_var = tk.BooleanVar(value=False)
        self.merge_only_reviewed_var = tk.BooleanVar(value=True)
        self.log_visible_var = tk.BooleanVar(value=False)
        self.results_status_var = tk.StringVar(value="結果フォルダを読み込んでください")
        self.progress_var = tk.StringVar(value="ドラッグ&ドロップで動画を追加してください")
        self.queue_selection_var = tk.StringVar(value="ドラッグ＆ドロップで動画を追加してください")

        self.csv_column_vars: dict[str, tk.BooleanVar] = {
            "ItemColor": tk.BooleanVar(value=True),
            "RelicType": tk.BooleanVar(value=True),
            "RawText": tk.BooleanVar(value=True),
            "Score": tk.BooleanVar(value=True),
            "Source": tk.BooleanVar(value=True),
            "LevelOptions": tk.BooleanVar(value=True),
            "Dataset": tk.BooleanVar(value=True),
            "DatasetFolder": tk.BooleanVar(value=True),
            "SourceCsv": tk.BooleanVar(value=True),
            "SourceImage": tk.BooleanVar(value=True),
            "BaseImage": tk.BooleanVar(value=True),
        }

        self._load_config_into_vars()

        self.log_queue: "queue.Queue[str]" = queue.Queue()
        self.executor = PipelineExecutor()
        self.background_tasks = BackgroundTaskRunner()
        self.server_context: ServerContext | None = None
        self.server_thread: threading.Thread | None = None

        self.state = GuiState(
            base_dir=self.base_dir,
            video_dir=self._resolve_initial_path(self.video_dir_var.get()),
            results_dir=self._resolve_initial_path(self.results_dir_var.get()),
            queue_entries=[],
            ocr_upsample=float(self._safe_float(self.ocr_upsample_var.get(), 1.0)),
            ocr_engine=(self.ocr_engine_var.get() or "tesseract").lower(),
            gcp_credentials=None,
            gcp_credentials_filename=self.gcp_credentials_filename_var.get().strip() or None,
            save_full_frames=self.save_frames_var.get(),
            column_visibility={key: var.get() for key, var in self.csv_column_vars.items()},
            merge_only_reviewed=self.merge_only_reviewed_var.get(),
            server_host=self.server_host_var.get().strip() or "127.0.0.1",
            server_port=self._safe_int(self.server_port_var.get(), 0),
        )

        self.handlers = AppEventHandlers(self)
        self.pipeline_controller = PipelineController(self)
        self.merge_controller = MergeController(self)
        self.server_controller = ServerController(self)
        self.handlers.attach_controllers(
            pipeline=self.pipeline_controller,
            merge=self.merge_controller,
            server=self.server_controller,
        )

        self.results_dir_var.trace_add("write", lambda *_: self.handlers.schedule_results_refresh())

        self.layout_manager = LayoutManager(self, self.handlers)
        self.ui: LayoutComponents = self.layout_manager.build()

        self.handlers.init_drag_and_drop([self.root, self.ui.main_frame])

        self.progress_tasks: list[dict[str, object]] = []
        self._progress_counter = 0
        self._progress_active = False
        self._progress_mode = "idle"

        self.root.protocol("WM_DELETE_WINDOW", self.on_close)
        self.handlers.process_log_queue()

        self.handlers.refresh_queue_view()
        self.handlers.update_log_visibility()
        self.handlers.refresh_results_list()
        self.refresh_progress_display()
        self.root.after(0, self._apply_initial_results_refresh)

    # ------------------------------------------------------------------
    # Configuration

    def _load_config_into_vars(self) -> None:
        config = load_config(self.config_path, AppConfig())
        self.video_dir_var.set(config.video_dir)
        self.results_dir_var.set(config.results_dir)
        self.ocr_upsample_var.set(config.ocr_upsample)
        self.ocr_engine_var.set(config.ocr_engine)
        self.gcp_credentials_filename_var.set(config.gcp_credentials_filename)
        self.server_host_var.set(config.server_host)
        self.server_port_var.set(config.server_port)
        self.open_browser_var.set(config.open_browser)
        self.save_frames_var.set(config.save_full_frames)
        self.merge_only_reviewed_var.set(config.merge_only_reviewed)
        for key, value in config.csv_columns.items():
            if key in self.csv_column_vars:
                self.csv_column_vars[key].set(bool(value))

    def save_config(self) -> None:
        config = AppConfig(
            video_dir=self.video_dir_var.get().strip(),
            results_dir=self.results_dir_var.get().strip(),
            ocr_upsample=self.ocr_upsample_var.get().strip(),
            ocr_engine=self.ocr_engine_var.get().strip(),
            gcp_credentials_filename=self.gcp_credentials_filename_var.get().strip(),
            server_host=self.server_host_var.get().strip(),
            server_port=self.server_port_var.get().strip(),
            open_browser=self.open_browser_var.get(),
            save_full_frames=self.save_frames_var.get(),
            merge_only_reviewed=self.merge_only_reviewed_var.get(),
            csv_columns={key: var.get() for key, var in self.csv_column_vars.items()},
        )
        try:
            save_config(self.config_path, config)
        except Exception as exc:  # noqa: BLE001 - GUIログのみ
            try:
                self.append_log(f"[WARN] 設定ファイルを書き込めませんでした: {exc}")
            except Exception:  # noqa: BLE001
                pass

    # ------------------------------------------------------------------
    # Progress handling

    def start_progress(self, message: str, *, total_steps: Optional[int] = None) -> int:
        self._progress_counter += 1
        token = self._progress_counter
        task = {"token": token, "message": message, "total": total_steps, "value": 0}
        self.progress_tasks.append(task)
        self.refresh_progress_display()
        return token

    def update_progress(
        self,
        token: int,
        *,
        value: Optional[int] = None,
        total: Optional[int] = None,
        message: Optional[str] = None,
    ) -> None:
        for task in self.progress_tasks:
            if task.get("token") == token:
                if total is not None:
                    task["total"] = total
                if value is not None:
                    task["value"] = value
                if message is not None:
                    task["message"] = message
                break
        self.refresh_progress_display()

    def stop_progress(
        self, token: int, final_message: str = "ドラッグ&ドロップで動画を追加してください"
    ) -> None:
        self.progress_tasks = [
            task for task in self.progress_tasks if task.get("token") != token
        ]
        if not self.progress_tasks:
            self._reset_progress(final_message)
        else:
            self.refresh_progress_display()

    def refresh_progress_display(self) -> None:
        if not self.progress_tasks:
            self._reset_progress("ドラッグ&ドロップで動画を追加してください")
            return
        task = self.progress_tasks[-1]
        message = str(task.get("message") or "")
        total = task.get("total")
        value = int(task.get("value") or 0)
        self.progress_var.set(message)
        progress_bar = self.ui.progress_bar
        if isinstance(total, int) and total > 0:
            if self._progress_active:
                progress_bar.stop()
                self._progress_active = False
            if self._progress_mode != "determinate":
                progress_bar.configure(mode="determinate")
                self._progress_mode = "determinate"
            maximum = max(total, 1)
            clamped = max(0, min(value, maximum))
            progress_bar.configure(maximum=maximum, value=clamped)
        else:
            if self._progress_mode != "indeterminate":
                progress_bar.configure(mode="indeterminate")
                self._progress_mode = "indeterminate"
            if not self._progress_active:
                progress_bar.start(10)
                self._progress_active = True

    def _reset_progress(self, message: str) -> None:
        progress_bar = self.ui.progress_bar
        if self._progress_active:
            progress_bar.stop()
            self._progress_active = False
        progress_bar.configure(mode="determinate", maximum=1, value=0)
        self._progress_mode = "idle"
        self.progress_var.set(message)

    # ------------------------------------------------------------------
    # Compatibility accessors (legacy tests rely on these names)

    @property
    def queue_tree(self):
        return self.ui.queue_tree

    @property
    def inline_color_combo(self):
        editor = self.handlers.inline_color_editor
        return editor.widget if editor else None

    @property
    def inline_type_combo(self):
        editor = self.handlers.inline_type_editor
        return editor.widget if editor else None

    @property
    def _queue_item_paths(self):
        return self.handlers._queue_item_paths

    @property
    def _dropped_videos(self):
        return self.state.queue_entries

    @_dropped_videos.setter
    def _dropped_videos(self, entries):
        normalized: list[dict[str, object]] = []
        if entries:
            for entry in entries:
                if isinstance(entry, dict):
                    normalized.append(dict(entry))
        self.state.queue_entries = normalized
        self.handlers._dropped_video_set = {
            str(entry.get("path")) for entry in normalized if entry.get("path")
        }

    @property
    def _dropped_video_set(self):
        return self.handlers._dropped_video_set

    @_dropped_video_set.setter
    def _dropped_video_set(self, values):
        self.handlers._dropped_video_set = set(values)

    def _refresh_queue_view(self) -> None:
        self.handlers.refresh_queue_view()

    def _show_inline_color_editor(self, item: str) -> None:
        self.handlers.show_inline_color_editor(item)

    def _show_inline_relic_type_editor(self, item: str) -> None:
        self.handlers.show_inline_relic_type_editor(item)

    def _hide_inline_color_editor(self) -> None:
        self.handlers.hide_inline_color_editor()

    def _hide_inline_relic_type_editor(self) -> None:
        self.handlers.hide_inline_relic_type_editor()

    def _on_inline_color_focus_out(self, _event=None) -> None:
        editor = self.handlers.inline_color_editor
        item = editor.item if editor and editor.item else ""
        self.handlers.on_color_focus_out(item)

    def _on_inline_type_focus_out(self, _event=None) -> None:
        editor = self.handlers.inline_type_editor
        item = editor.item if editor and editor.item else ""
        self.handlers.on_relic_type_focus_out(item)

    def _on_inline_color_selected(self, _event=None) -> None:
        editor = self.handlers.inline_color_editor
        if editor is None:
            return
        target = editor.item or self.handlers._inline_last_item
        if not target and self.ui.queue_tree is not None:
            focus = self.ui.queue_tree.focus()
            if focus:
                target = focus
            elif self.ui.queue_tree.selection():
                target = self.ui.queue_tree.selection()[0]
        if not target:
            return
        value = editor.widget.get() if editor.widget else self.handlers.color_options[0]
        if value not in self.handlers.color_options:
            value = self.handlers.color_options[0]
        self.handlers.on_color_selected(target, value)

    def _on_inline_type_selected(self, _event=None) -> None:
        editor = self.handlers.inline_type_editor
        if editor is None:
            return
        target = editor.item or self.handlers._inline_type_last_item
        if not target and self.ui.queue_tree is not None:
            focus = self.ui.queue_tree.focus()
            if focus:
                target = focus
            elif self.ui.queue_tree.selection():
                target = self.ui.queue_tree.selection()[0]
        if not target:
            return
        label = editor.widget.get() if editor.widget else self.handlers.relic_type_options[0]
        self.handlers.on_relic_type_selected(target, label)

    # ------------------------------------------------------------------
    # Utilities

    def append_log(self, message: str) -> None:
        text = message if message.endswith("\n") else message + "\n"
        self.log_queue.put(text)

    def open_browser(self, results_dir: Path, target: Path | None, host: str, port: int) -> None:
        _open_browser(results_dir, target, host, port)

    def _apply_initial_results_refresh(self) -> None:
        self.handlers.refresh_results_list()

    def _safe_float(self, value: str, default: float) -> float:
        try:
            return float(value)
        except ValueError:
            return default

    def _safe_int(self, value: str, default: int) -> int:
        try:
            return int(value)
        except ValueError:
            return default

    def _resolve_initial_path(self, value: str) -> Path:
        raw = Path(value.strip()) if value else Path()
        if raw.is_absolute():
            return raw.resolve()
        return (self.base_dir / raw).resolve()

    def _default_base_dir(self) -> Path:
        if getattr(sys, "frozen", False):
            try:
                return Path(sys.executable).resolve().parent
            except OSError:
                return Path.cwd()
        return Path(__file__).resolve().parent.parent

    # ------------------------------------------------------------------
    # Lifecycle

    def on_close(self) -> None:
        if self.background_tasks.is_running("pipeline"):
            if not messagebox.askokcancel(
                "終了確認", "動画処理が実行中です。アプリを終了しますか？"
            ):
                return
        self.server_controller.stop()
        try:
            self.background_tasks.join("pipeline", timeout=1)
            self.background_tasks.join("merge", timeout=1)
        except Exception:  # noqa: BLE001
            pass
        self.layout_manager.close_settings_dialog()
        self.save_config()
        self.root.destroy()


def _parse_cli_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    args_list = list(sys.argv[1:] if argv is None else argv)
    with _windows_cli_output(args_list):
        version = get_version()
        parser = argparse.ArgumentParser(
            description=f"RelicListMaker GUI ランチャー (バージョン {version})"
        )
        parser.add_argument("--version", action="version", version=f"%(prog)s {version}")
        return parser.parse_args(args_list)


def create_root_window() -> tk.Misc:
    """TkinterDnDが利用可能な場合は対応するTkを生成する."""

    if TkinterDnD is not None:
        try:
            return TkinterDnD.Tk()
        except Exception:  # noqa: BLE001 - フォールバックで再試行
            pass
    return tk.Tk()


def main(argv: Optional[Sequence[str]] = None) -> None:
    _parse_cli_args(argv)
    root = create_root_window()
    app = RelicGuiApp(root)
    root.mainloop()


"""解析処理とビューワサーバーを統合するGUIランチャー."""
from __future__ import annotations

import argparse
import contextlib
import csv
import queue
import shutil
import sys
import types
import threading
import traceback
import tkinter as tk
import webbrowser
from datetime import datetime
from pathlib import Path
from tkinter import filedialog, messagebox, ttk, font
from typing import Iterator, Optional, Sequence

from gui_adapters import (
    DND_FILES,
    HAS_TKDND,
    TkinterDnD,
    get_windows_drop_support,
    redirect_streams,
)
from gui_services import BackgroundTaskRunner, GuiState, PipelineExecutor
from merge_results import MergeResultsError
from pipeline import (
    DEFAULT_OCR_ENGINE,
    DEFAULT_OCR_UPSAMPLE,
    detect_item_color,
    detect_relic_type,
    normalize_relic_type,
)
from viewer_server import ServerContext, _open_browser
from version_info import get_version
VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".avi", ".wmv", ".m4v"}


GITHUB_URL = "https://github.com/nanashio/RelicListMaker"


if sys.platform.startswith("win"):
    import ctypes
    from ctypes import wintypes
else:
    ctypes = None
    wintypes = None


@contextlib.contextmanager
def _windows_cli_output(argv: Sequence[str] | None) -> Iterator[None]:
    """Windows の GUI ビルドでも CLI 出力を親コンソールに表示する."""

    if not sys.platform.startswith("win"):
        yield
        return

    if not argv:
        yield
        return

    if ctypes is None:
        yield
        return

    try:
        kernel32 = ctypes.windll.kernel32
    except AttributeError:
        yield
        return

    attached = False
    # ATTACH_PARENT_PROCESS = DWORD(-1)
    if kernel32.AttachConsole(ctypes.c_uint(-1).value):
        attached = True
    else:
        last_error = kernel32.GetLastError()
        # ERROR_ACCESS_DENIED (5) は既にコンソールへ接続済みという意味
        if last_error != 5:
            yield
            return

    old_stdout, old_stderr = sys.stdout, sys.stderr
    try:
        new_stdout = open("CONOUT$", "w", encoding="utf-8", buffering=1)
        new_stderr = open("CONOUT$", "w", encoding="utf-8", buffering=1)
    except OSError:
        if attached:
            kernel32.FreeConsole()
        yield
        return

    sys.stdout = new_stdout
    sys.stderr = new_stderr
    try:
        yield
    finally:
        try:
            sys.stdout.flush()
        except Exception:
            pass
        try:
            sys.stderr.flush()
        except Exception:
            pass
        sys.stdout = old_stdout
        sys.stderr = old_stderr
        new_stdout.close()
        new_stderr.close()
        if attached:
            kernel32.FreeConsole()


_REVIEWED_STATUSES = {"pass", "corrected"}


def _normalize_effect_status(value: object) -> str:
    if value is None:
        return "pending"
    text = str(value).strip().lower()
    if not text:
        return "pending"
    if text in _REVIEWED_STATUSES:
        return text
    if text in {"fail", "failed", "ng", "reject", "rejected", "x"}:
        return "pending"
    return text


def _slot_has_content(row: dict[str, object], slot: int) -> bool:
    effect_key = f"Effect{slot}"
    raw_key = f"RawText{slot}"
    score_key = f"Effect{slot}Score"
    correction_key = f"Effect{slot}Correction"
    for key in (effect_key, raw_key, correction_key, score_key):
        if key not in row:
            continue
        value = row.get(key)
        if value is None:
            continue
        if isinstance(value, str):
            if value.strip():
                return True
        else:
            return True
    return False


def _row_has_effect_entries(row: dict[str, object]) -> bool:
    for key in row.keys():
        if not key.startswith("Effect") or not key.endswith("Status"):
            continue
        slot_text = key[len("Effect") : -len("Status")]
        if not slot_text.isdigit():
            continue
        if _slot_has_content(row, int(slot_text)):
            return True
    return False


def _row_is_fully_reviewed(row: dict[str, object]) -> bool:
    has_slots = False
    for key in row.keys():
        if not key.startswith("Effect") or not key.endswith("Status"):
            continue
        slot_text = key[len("Effect") : -len("Status")]
        if not slot_text.isdigit():
            continue
        slot = int(slot_text)
        if not _slot_has_content(row, slot):
            continue
        has_slots = True
        status = _normalize_effect_status(row.get(key))
        if status not in _REVIEWED_STATUSES:
            return False
    return has_slots


def _summarize_review_state(csv_path: Path) -> str:
    try:
        with csv_path.open("r", newline="", encoding="utf-8-sig") as csv_file:
            reader = csv.DictReader(csv_file)
            any_effect_rows = False
            for row in reader:
                if not row:
                    continue
                if not _row_has_effect_entries(row):
                    continue
                any_effect_rows = True
                if not _row_is_fully_reviewed(row):
                    return "未レビュー含む"
            if any_effect_rows:
                return "全レビュー済"
    except Exception:
        return "未レビュー含む"
    return "未レビュー含む"


if sys.platform.startswith("win"):
    import ctypes
    from ctypes import wintypes
else:
    ctypes = None
    wintypes = None


def _default_base_dir() -> Path:
    """実行形態に応じて videos/results の既定配置場所を返す."""

    if getattr(sys, "frozen", False):
        # PyInstaller 実行体は exe の配置ディレクトリをベースにする
        try:
            return Path(sys.executable).resolve().parent
        except OSError:
            return Path.cwd()
    return Path(__file__).resolve().parent
class RelicGuiApp:
    """RelicListMaker パイプラインのGUIフロントエンド."""

    POLL_INTERVAL_MS = 100

    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("RelicListMaker ツール")
        self._apply_japanese_fonts()
        self._menubar_attached = False
        self._fallback_menu_frame: Optional[ttk.Frame] = None
        self._app_version = get_version()
        self._create_menubar()

        self.base_dir = _default_base_dir()
        self.video_dir_var = tk.StringVar(value="videos")
        self.results_dir_var = tk.StringVar(value="results")
        self.ocr_upsample_var = tk.StringVar(value=str(DEFAULT_OCR_UPSAMPLE))
        self.ocr_engine_var = tk.StringVar(value=DEFAULT_OCR_ENGINE)
        self.server_host_var = tk.StringVar(value="127.0.0.1")
        self.server_port_var = tk.StringVar(value="0")
        self.open_browser_var = tk.BooleanVar(value=True)
        self.save_frames_var = tk.BooleanVar(value=False)
        self.csv_column_vars: dict[str, tk.BooleanVar] = {
            "ItemColor": tk.BooleanVar(value=True),
            "RelicType": tk.BooleanVar(value=True),
            "RawText": tk.BooleanVar(value=True),
            "Score": tk.BooleanVar(value=True),
            "Source": tk.BooleanVar(value=True),
            "LevelOptions": tk.BooleanVar(value=True),
            "LevelCorrection": tk.BooleanVar(value=True),
            "Dataset": tk.BooleanVar(value=True),
            "DatasetFolder": tk.BooleanVar(value=True),
            "SourceCsv": tk.BooleanVar(value=True),
            "SourceImage": tk.BooleanVar(value=True),
            "BaseImage": tk.BooleanVar(value=True),
        }
        self.merge_only_reviewed_var = tk.BooleanVar(value=True)
        self.results_status_var = tk.StringVar(value="結果フォルダを読み込んでください")
        self.log_visible_var = tk.BooleanVar(value=False)

        self.server_context: Optional[ServerContext] = None
        self.server_thread: Optional[threading.Thread] = None
        self.log_queue: "queue.Queue[str]" = queue.Queue()
        self.executor = PipelineExecutor()
        self.background_tasks = BackgroundTaskRunner()
        self.progress_var = tk.StringVar(value="待機中")
        self.progress_bar: Optional[ttk.Progressbar] = None
        self._progress_tasks: list[dict[str, object]] = []
        self._progress_counter = 0
        self._progress_active = False
        self._progress_mode = "idle"
        self._pipeline_progress_token: Optional[int] = None
        self._merge_progress_token: Optional[int] = None
        self._tkdnd_ready = False
        self.color_options = ["none", "red", "green", "blue", "yellow"]
        self.relic_type_options = ["通常", "深層遺物"]
        self._relic_type_value_map = {"通常": "normal", "深層遺物": "deep"}
        self._relic_type_display_map = {value: label for label, value in self._relic_type_value_map.items()}
        self._dropped_video_set: set[str] = set()
        self._queue_item_paths: dict[str, str] = {}
        try:
            initial_ocr = float(self.ocr_upsample_var.get())
        except ValueError:
            initial_ocr = DEFAULT_OCR_UPSAMPLE
        try:
            initial_port = int(self.server_port_var.get().strip() or "0")
        except ValueError:
            initial_port = 0
        self.state = GuiState(
            base_dir=self.base_dir,
            video_dir=self._resolve_input_path(self.video_dir_var.get()),
            results_dir=self._resolve_input_path(self.results_dir_var.get()),
            queue_entries=[],
            ocr_upsample=initial_ocr,
            ocr_engine=self.ocr_engine_var.get(),
            save_full_frames=self.save_frames_var.get(),
            column_visibility={key: var.get() for key, var in self.csv_column_vars.items()},
            merge_only_reviewed=self.merge_only_reviewed_var.get(),
            server_host=self.server_host_var.get().strip() or "127.0.0.1",
            server_port=initial_port,
        )
        self.queue_tree: Optional[ttk.Treeview] = None
        self._inline_hide_after: Optional[str] = None
        self._inline_type_hide_after: Optional[str] = None
        self._inline_last_item: Optional[str] = None
        self._inline_type_last_item: Optional[str] = None
        self.queue_selection_var: tk.StringVar = tk.StringVar(value="ドラッグ＆ドロップで動画を追加してください")
        self._settings_window: Optional[tk.Toplevel] = None
        self.results_tree: Optional[ttk.Treeview] = None
        self.log_frame: Optional[ttk.LabelFrame] = None
        self._results_entries: list[dict[str, object]] = []
        self._results_refresh_pending = False

        self.results_dir_var.trace_add("write", lambda *_args: self._schedule_results_refresh())

        self._build_layout()
        self._init_drag_and_drop()
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)
        self.root.after(self.POLL_INTERVAL_MS, self._process_log_queue)
        self._refresh_results_list()

    @property
    def _dropped_videos(self) -> list[dict[str, object]]:
        """後方互換性のために旧インターフェースを保持する."""

        return self.state.queue_entries

    @_dropped_videos.setter
    def _dropped_videos(self, entries: Sequence[dict[str, object]] | None) -> None:
        """テストや旧コードからの直接代入をサポートし、状態を同期する."""

        normalized: list[dict[str, object]] = []
        if entries:
            for entry in entries:
                if isinstance(entry, dict):
                    normalized.append(dict(entry))
        self.state.queue_entries = normalized
        self._dropped_video_set = {
            str(entry.get("path"))
            for entry in normalized
            if entry.get("path")
        }

    def _apply_japanese_fonts(self) -> None:
        """Tkの標準フォントを日本語表示に適したフォントへ切り替える."""
        try:
            self.root.update_idletasks()
            families = list(font.families(self.root))
        except tk.TclError:
            return

        if not families:
            return

        def match_font_name(candidate: str) -> str | None:
            lowered = candidate.casefold()
            for name in families:
                name_lower = name.casefold()
                if name_lower == lowered or lowered in name_lower:
                    return name
            return None

        candidate_map: dict[str, tuple[str, ...]] = {
            "windows": (
                "Yu Gothic UI",
                "Yu Gothic",
                "游ゴシック UI",
                "游ゴシック",
                "Meiryo UI",
                "Meiryo",
                "メイリオ",
                "MS Gothic",
                "ＭＳ ゴシック",
            ),
            "darwin": (
                "Hiragino Sans",
                "Hiragino Kaku Gothic ProN",
                "ヒラギノ角ゴ ProN W3",
                "ヒラギノ角ゴシック",
                "YuGothic",
                "游ゴシック",
                "Osaka",
            ),
            "linux": (
                "Noto Sans CJK JP",
                "Noto Sans JP",
                "Source Han Sans JP",
                "源ノ角ゴシック",
                "IPAPGothic",
                "IPAGothic",
                "IPAexGothic",
                "VL Gothic",
                "TakaoPGothic",
                "TakaoGothic",
            ),
            "default": (
                "Noto Sans CJK JP",
                "Noto Sans JP",
                "Yu Gothic UI",
                "游ゴシック",
                "Meiryo",
                "メイリオ",
                "Hiragino Sans",
            ),
        }
        if sys.platform.startswith("win"):
            key = "windows"
        elif sys.platform == "darwin":
            key = "darwin"
        elif sys.platform.startswith("linux"):
            key = "linux"
        else:
            key = "default"

        chosen = None
        for candidate in candidate_map.get(key, candidate_map["default"]):
            match = match_font_name(candidate)
            if match:
                chosen = match
                break

        if chosen is None:
            for candidate in candidate_map["default"]:
                match = match_font_name(candidate)
                if match:
                    chosen = match
                    break

        if chosen is None:
            keywords = (
                "gothic",
                "ゴシック",
                "mincho",
                "明朝",
                "hiragino",
                "ヒラギノ",
                "noto",
                "源ノ",
                "source han",
                "ipa",
                "takao",
                "jp",
            )
            for name in families:
                name_lower = name.casefold()
                if any(keyword in name_lower for keyword in keywords):
                    chosen = name
                    break

        if chosen is None:
            return

        for target in ("TkDefaultFont", "TkTextFont", "TkHeadingFont", "TkMenuFont"):
            try:
                tk_font = font.nametofont(target)
                tk_font.configure(family=chosen)
            except tk.TclError:
                continue

    def _build_layout(self) -> None:
        self.root.columnconfigure(0, weight=1)
        base_row = 0
        if not self._menubar_attached:
            self._fallback_menu_frame = self._create_menu_buttonbar(self.root)
            self._fallback_menu_frame.grid(row=base_row, column=0, sticky="ew")
            base_row += 1

        main_frame = ttk.Frame(self.root, padding=12)
        self.main_frame = main_frame
        main_frame.grid(row=base_row, column=0, sticky="nsew")
        self.root.rowconfigure(base_row, weight=1)
        main_frame.columnconfigure(0, weight=1)

        self._build_queue_section(main_frame)
        self._build_results_section(main_frame)
        self._build_log_section(main_frame)

        self._refresh_progress_display()
        self._refresh_queue_view()
        self._update_log_visibility()

    def _build_queue_section(self, parent: ttk.Frame) -> ttk.LabelFrame:
        queue_frame = ttk.LabelFrame(parent, text="動画処理", padding=12)
        queue_frame.grid(row=0, column=0, sticky="nsew")
        parent.rowconfigure(0, weight=1)
        for col_index in range(3):
            queue_frame.columnconfigure(col_index, weight=1)
        queue_frame.rowconfigure(0, weight=1)

        self.queue_tree = ttk.Treeview(
            queue_frame,
            columns=("name", "color", "relic_type", "fullpath"),
            displaycolumns=("name", "color", "relic_type"),
            show="headings",
            selectmode="extended",
            height=6,
        )
        self.queue_tree.heading("name", text="動画")
        self.queue_tree.heading("color", text="item_color")
        self.queue_tree.heading("relic_type", text="遺物タイプ")
        self.queue_tree.column("name", anchor="w", width=260)
        self.queue_tree.column("color", anchor="center", width=100)
        self.queue_tree.column("relic_type", anchor="center", width=120)
        self.queue_tree.column("fullpath", width=0, stretch=False)
        queue_scroll = ttk.Scrollbar(queue_frame, orient="vertical", command=self.queue_tree.yview)
        self.queue_tree.configure(yscrollcommand=queue_scroll.set)
        self.queue_tree.grid(row=0, column=0, columnspan=3, sticky="nsew")
        queue_scroll.grid(row=0, column=3, sticky="ns")
        self.queue_tree.bind("<<TreeviewSelect>>", self._on_queue_selection)
        self.queue_tree.bind("<Button-1>", self._on_queue_click, add="+")
        self.queue_tree.bind("<MouseWheel>", self._on_queue_scroll_event, add="+")
        self.queue_tree.bind("<Button-4>", self._on_queue_scroll_event, add="+")
        self.queue_tree.bind("<Button-5>", self._on_queue_scroll_event, add="+")
        self.queue_tree.bind("<Configure>", self._on_queue_scroll_event, add="+")

        self.inline_color_combo = None
        self._inline_color_item = None
        self._create_inline_color_editor()
        self.inline_type_combo = None
        self._inline_type_item = None
        self._create_inline_relic_type_editor()

        self.queue_selection_var.set("ドラッグ＆ドロップで動画を追加してください")
        selection_label = ttk.Label(queue_frame, textvariable=self.queue_selection_var, anchor="w")
        selection_label.grid(row=1, column=0, columnspan=4, sticky="ew", pady=(8, 0))

        self.run_button = ttk.Button(queue_frame, text="動画処理を実行", command=self.on_run_pipeline)
        self.run_button.grid(row=2, column=0, columnspan=2, sticky="ew", padx=(0, 8), pady=(8, 0))
        ttk.Button(queue_frame, text="選択動画を削除", command=self._remove_selected_videos).grid(
            row=2, column=2, sticky="ew", pady=(8, 0)
        )

        progress_frame = ttk.Frame(queue_frame, padding=8)
        progress_frame.grid(row=3, column=0, columnspan=3, sticky="ew", pady=(12, 0))
        progress_frame.columnconfigure(0, weight=1)
        self.progress_bar = ttk.Progressbar(progress_frame, orient="horizontal", mode="indeterminate")
        self.progress_bar.grid(row=0, column=0, sticky="ew")
        ttk.Label(progress_frame, textvariable=self.progress_var).grid(row=1, column=0, sticky="w", pady=(8, 0))

        return queue_frame

    def _build_results_section(self, parent: ttk.Frame) -> ttk.LabelFrame:
        actions_frame = ttk.LabelFrame(parent, text="処理結果の確認", padding=12)
        actions_frame.grid(row=1, column=0, sticky="nsew", pady=(12, 0))
        parent.rowconfigure(1, weight=1)
        actions_frame.columnconfigure(0, weight=1)
        actions_frame.columnconfigure(1, weight=0)
        actions_frame.rowconfigure(2, weight=1)

        buttons_frame = ttk.Frame(actions_frame)
        buttons_frame.grid(row=0, column=0, columnspan=2, sticky="ew")
        buttons_frame.columnconfigure(0, weight=1)
        buttons_frame.columnconfigure(1, weight=1)

        self.server_start_button = ttk.Button(buttons_frame, text="ビューワを開く", command=self.on_start_server)
        self.server_start_button.grid(row=0, column=0, sticky="ew", padx=(4, 2), pady=4)
        self.merge_button = ttk.Button(buttons_frame, text="統合結果を生成", command=self.on_merge_results)
        self.merge_button.grid(row=0, column=1, sticky="ew", padx=(2, 4), pady=4)

        ttk.Checkbutton(
            buttons_frame,
            text="効果が全てレビュー済みの項目のみ統合",
            variable=self.merge_only_reviewed_var,
        ).grid(row=1, column=0, columnspan=2, sticky="w", padx=(4, 4), pady=(0, 4))

        toolbar = ttk.Frame(actions_frame)
        toolbar.grid(row=1, column=0, columnspan=2, sticky="ew", pady=(8, 0))
        ttk.Button(toolbar, text="再読み込み", command=lambda: self._refresh_results_list(log=True)).pack(side="left")
        ttk.Label(toolbar, textvariable=self.results_status_var).pack(side="left", padx=8)
        ttk.Checkbutton(
            toolbar,
            text="ログを表示",
            variable=self.log_visible_var,
            command=self._update_log_visibility,
        ).pack(side="right")

        columns = ("folder", "status", "csv", "updated")
        tree = ttk.Treeview(actions_frame, columns=columns, show="headings", height=6)
        tree.heading("folder", text="フォルダ名")
        tree.heading("status", text="レビュー状態")
        tree.heading("csv", text="CSVファイル")
        tree.heading("updated", text="最終更新")
        tree.column("folder", anchor="w", width=140, stretch=True)
        tree.column("status", anchor="w", width=120, stretch=False)
        tree.column("csv", anchor="w", width=160, stretch=True)
        tree.column("updated", anchor="center", width=140, stretch=False)
        tree.grid(row=2, column=0, sticky="nsew")
        results_scroll = ttk.Scrollbar(actions_frame, orient="vertical", command=tree.yview)
        results_scroll.grid(row=2, column=1, sticky="ns")
        tree.configure(yscrollcommand=results_scroll.set)
        self.results_tree = tree

        return actions_frame

    def _build_log_section(self, parent: ttk.Frame) -> ttk.LabelFrame:
        log_frame = ttk.LabelFrame(parent, text="ログ", padding=12)
        log_frame.grid(row=2, column=0, sticky="nsew", pady=(12, 0))
        parent.rowconfigure(2, weight=1)
        self.log_frame = log_frame

        self.log_text = tk.Text(log_frame, height=20, state="disabled", wrap="word")
        self.log_text.grid(row=0, column=0, sticky="nsew")
        log_scroll = ttk.Scrollbar(log_frame, orient="vertical", command=self.log_text.yview)
        log_scroll.grid(row=0, column=1, sticky="ns")
        self.log_text.configure(yscrollcommand=log_scroll.set)
        log_frame.columnconfigure(0, weight=1)
        log_frame.rowconfigure(0, weight=1)

        return log_frame

    def _create_menubar(self) -> None:
        """アプリケーションのメニューバーを初期化する。"""

        self.root.option_add("*tearOff", False)
        menubar = tk.Menu(self.root)

        file_menu = tk.Menu(menubar, tearoff=False)
        file_menu.add_command(label="終了", command=self.on_close)
        menubar.add_cascade(label="ファイル", menu=file_menu)

        settings_menu = tk.Menu(menubar, tearoff=False)
        settings_menu.add_command(label="設定を開く", command=self._open_settings_dialog)
        menubar.add_cascade(label="設定", menu=settings_menu)

        help_menu = tk.Menu(menubar, tearoff=False)
        help_menu.add_command(label=f"バージョン: {self._app_version}", state="disabled")
        help_menu.add_command(label=GITHUB_URL, command=self._open_project_site)
        help_menu.add_separator()
        help_menu.add_command(label="このアプリについて", command=self._show_about_dialog)
        menubar.add_cascade(label="ヘルプ", menu=help_menu)

        attached = False
        for setter in (
            lambda menu: self.root.configure(menu=menu),
            lambda menu: self.root.__setitem__("menu", menu),
        ):
            try:
                setter(menubar)
                attached = bool(self.root.cget("menu"))
            except tk.TclError:
                continue
            if attached:
                break

        self._menubar_attached = attached
        self.menubar = menubar

    def _create_menu_buttonbar(self, master: tk.Misc) -> ttk.Frame:
        """メニューバーが表示できない環境向けの代替ボタン群を生成する。"""

        frame = ttk.Frame(master, padding=(12, 8, 12, 0))
        frame.columnconfigure(3, weight=1)

        file_button = ttk.Menubutton(frame, text="ファイル")
        file_menu = tk.Menu(file_button, tearoff=False)
        file_menu.add_command(label="終了", command=self.on_close)
        file_button["menu"] = file_menu
        file_button.grid(row=0, column=0, padx=(0, 8))

        ttk.Button(frame, text="設定...", command=self._open_settings_dialog).grid(
            row=0, column=1, padx=8
        )

        help_button = ttk.Menubutton(frame, text="ヘルプ")
        help_menu = tk.Menu(help_button, tearoff=False)
        help_menu.add_command(label=f"バージョン: {self._app_version}", state="disabled")
        help_menu.add_command(label=GITHUB_URL, command=self._open_project_site)
        help_menu.add_separator()
        help_menu.add_command(label="このアプリについて", command=self._show_about_dialog)
        help_button["menu"] = help_menu
        help_button.grid(row=0, column=2, padx=8)

        ttk.Label(
            frame,
            text="メニューバーが表示されない場合はこちらをご利用ください",
            foreground="gray",
        ).grid(row=1, column=0, columnspan=4, sticky="w", pady=(6, 0))

        return frame

    def _build_settings_content(self, parent: tk.Widget) -> None:
        """設定ダイアログの内容を構築する。"""

        for index in range(3):
            weight = 1 if index == 1 else 0
            parent.columnconfigure(index, weight=weight)

        ttk.Label(parent, text="動画フォルダ").grid(row=0, column=0, sticky="w", padx=(0, 8), pady=2)
        ttk.Entry(parent, textvariable=self.video_dir_var).grid(row=0, column=1, sticky="ew", pady=2)
        ttk.Button(parent, text="選択", command=self._select_video_dir).grid(row=0, column=2, padx=(8, 0), pady=2)

        ttk.Label(parent, text="結果フォルダ").grid(row=1, column=0, sticky="w", padx=(0, 8), pady=2)
        ttk.Entry(parent, textvariable=self.results_dir_var).grid(row=1, column=1, sticky="ew", pady=2)
        ttk.Button(parent, text="選択", command=self._select_results_dir).grid(row=1, column=2, padx=(8, 0), pady=2)

        ttk.Label(parent, text="OCRアップサンプル").grid(row=2, column=0, sticky="w", padx=(0, 8), pady=2)
        ttk.Entry(parent, textvariable=self.ocr_upsample_var, width=10).grid(row=2, column=1, sticky="w", pady=2)

        ttk.Label(parent, text="OCRエンジン").grid(row=3, column=0, sticky="w", padx=(0, 8), pady=2)
        engine_frame = ttk.Frame(parent)
        engine_frame.grid(row=3, column=1, columnspan=2, sticky="w", pady=2)
        ttk.Radiobutton(
            engine_frame,
            text="Tesseract",
            value="tesseract",
            variable=self.ocr_engine_var,
        ).pack(side="left", padx=(0, 8))
        ttk.Radiobutton(
            engine_frame,
            text="Google Cloud Vision",
            value="vision",
            variable=self.ocr_engine_var,
        ).pack(side="left")

        ttk.Label(parent, text="サーバーホスト").grid(row=4, column=0, sticky="w", padx=(0, 8), pady=2)
        ttk.Entry(parent, textvariable=self.server_host_var, width=16).grid(row=4, column=1, sticky="w", pady=2)

        ttk.Label(parent, text="サーバーポート").grid(row=5, column=0, sticky="w", padx=(0, 8), pady=2)
        ttk.Entry(parent, textvariable=self.server_port_var, width=10).grid(row=5, column=1, sticky="w", pady=2)

        ttk.Checkbutton(
            parent,
            text="サーバー起動時にブラウザを開く",
            variable=self.open_browser_var,
        ).grid(row=6, column=0, columnspan=3, sticky="w", pady=4)

        ttk.Checkbutton(
            parent,
            text="全体画像を出力する",
            variable=self.save_frames_var,
        ).grid(row=7, column=0, columnspan=3, sticky="w", pady=(0, 4))

        csv_frame = ttk.LabelFrame(parent, text="CSV出力列", padding=12)
        csv_frame.grid(row=8, column=0, columnspan=3, sticky="ew", pady=(8, 0))
        for col_index in range(2):
            csv_frame.columnconfigure(col_index, weight=1)

        required_specs = [
            ("RawText[n]", "RawText"),
            ("Effect[n]Score", "Score"),
            ("Effect[n]LevelOptions", "LevelOptions"),
            ("Effect[n]LevelCorrection", "LevelCorrection"),
        ]
        optional_specs = [
            ("ItemColor", "ItemColor"),
            ("RelicType", "RelicType"),
            ("Effect[n]Source", "Source"),
            ("Dataset", "Dataset"),
            ("DatasetFolder", "DatasetFolder"),
            ("SourceCsv", "SourceCsv"),
            ("SourceImage", "SourceImage"),
            ("BaseImage", "BaseImage"),
        ]

        ttk.Label(csv_frame, text="ビューワで必要な列").grid(
            row=0, column=0, columnspan=2, sticky="w", pady=(0, 4)
        )
        for index, (label, key) in enumerate(required_specs):
            row_index = 1 + index // 2
            col_index = index % 2
            ttk.Checkbutton(
                csv_frame,
                text=label,
                variable=self.csv_column_vars[key],
                state="disabled",
            ).grid(row=row_index, column=col_index, sticky="w", padx=(0, 8), pady=2)

        optional_header_row = 1 + (len(required_specs) + 1) // 2
        ttk.Separator(csv_frame, orient="horizontal").grid(
            row=optional_header_row,
            column=0,
            columnspan=2,
            sticky="ew",
            pady=(6, 6),
        )
        ttk.Label(csv_frame, text="任意で出力する列").grid(
            row=optional_header_row + 1,
            column=0,
            columnspan=2,
            sticky="w",
            pady=(0, 4),
        )
        for index, (label, key) in enumerate(optional_specs):
            row_index = optional_header_row + 2 + index // 2
            col_index = index % 2
            ttk.Checkbutton(
                csv_frame,
                text=label,
                variable=self.csv_column_vars[key],
            ).grid(row=row_index, column=col_index, sticky="w", padx=(0, 8), pady=2)

        button_frame = ttk.Frame(parent)
        button_frame.grid(row=9, column=0, columnspan=3, sticky="ew", pady=(12, 0))
        button_frame.columnconfigure(0, weight=1)
        ttk.Button(button_frame, text="閉じる", command=self._close_settings_dialog).grid(row=0, column=0, sticky="e")

    def _open_settings_dialog(self) -> None:
        """設定ダイアログを表示する。"""

        if self._settings_window is not None and tk.Toplevel.winfo_exists(self._settings_window):
            self._settings_window.deiconify()
            self._settings_window.lift()
            self._settings_window.focus_set()
            return

        window = tk.Toplevel(self.root)
        window.title("設定")
        window.transient(self.root)
        window.resizable(False, False)
        window.protocol("WM_DELETE_WINDOW", self._close_settings_dialog)
        window.grab_set()

        content = ttk.Frame(window, padding=12)
        content.grid(row=0, column=0, sticky="nsew")
        window.columnconfigure(0, weight=1)
        window.rowconfigure(0, weight=1)

        self._build_settings_content(content)

        self._settings_window = window
        window.focus_set()

    def _close_settings_dialog(self) -> None:
        """設定ダイアログを閉じる。"""

        if self._settings_window is None:
            return

        window = self._settings_window
        self._settings_window = None
        with contextlib.suppress(tk.TclError):
            window.grab_release()
        with contextlib.suppress(tk.TclError):
            window.destroy()

    def _show_about_dialog(self) -> None:
        """アプリケーションの情報を表示する。"""

        message = f"RelicListMaker\nバージョン: {self._app_version}\n{GITHUB_URL}"
        messagebox.showinfo("このアプリについて", message)

    def _open_project_site(self) -> None:
        """公式リポジトリのページを開く。"""

        try:
            opened = webbrowser.open(GITHUB_URL, new=0, autoraise=True)
        except Exception as exc:  # noqa: BLE001 - GUI でユーザーに通知する
            messagebox.showerror("ブラウザ起動エラー", f"GitHub ページを開けませんでした: {exc}")
            return

        if not opened:
            messagebox.showerror("ブラウザ起動エラー", "GitHub ページを開けませんでした。既定のブラウザ設定を確認してください。")

    def _init_drag_and_drop(self) -> None:
        """動画ファイルのドラッグ＆ドロップ受付を設定する."""

        self._dnd_enabled = False
        widgets: list[tk.Misc] = []

        if self._attach_tkdnd(self.root):
            widgets.append(self.root)

        main_frame = getattr(self, "main_frame", None)
        if main_frame is not None and self._attach_tkdnd(main_frame):
            widgets.append(main_frame)

        for widget in widgets:
            try:
                widget.drop_target_register(DND_FILES)
                widget.dnd_bind("<<Drop>>", self._handle_file_drop)
                self._dnd_enabled = True
            except Exception as exc:  # noqa: BLE001 - 環境により未対応
                self.append_log(f"[WARN] ドラッグ＆ドロップの初期化に失敗しました: {exc}")

        if self._dnd_enabled:
            self.append_log("[GUI] 動画ファイルをウィンドウへドラッグ＆ドロップできます")
        else:
            self.append_log("[WARN] この環境ではドラッグ＆ドロップを利用できません (tkinterdnd2 / tkdnd の導入をご検討ください)")

    def _attach_tkdnd(self, widget: tk.Misc) -> bool:
        """tkdnd または代替手段でDnDメソッドを付与する."""

        if not isinstance(widget, tk.Misc):
            return False
        if hasattr(widget, "drop_target_register"):
            return True

        if self._ensure_tkdnd_available():
            tk_app = widget.tk

            def drop_target_register(self_widget: tk.Misc, *dnd_types: str) -> None:
                types_tuple = dnd_types or (DND_FILES,)
                tk_app.call('tkdnd::drop_target', 'register', self_widget._w, *types_tuple)

            def drop_target_unregister(self_widget: tk.Misc, *dnd_types: str) -> None:
                types_tuple = dnd_types or (DND_FILES,)
                tk_app.call('tkdnd::drop_target', 'unregister', self_widget._w, *types_tuple)

            def dnd_bind(self_widget: tk.Misc, sequence: str, func, add: str = ''):
                return self_widget.bind(sequence, func, add=add)

            widget.drop_target_register = types.MethodType(drop_target_register, widget)
            widget.drop_target_unregister = types.MethodType(drop_target_unregister, widget)
            widget.dnd_bind = types.MethodType(dnd_bind, widget)
            return True

        if self._install_windows_drop(widget):
            return True

        return False


    def _install_windows_drop(self, widget: tk.Misc) -> bool:
        support = get_windows_drop_support()
        if support is None:
            return False

        def drop_target_register(self_widget: tk.Misc, *dnd_types: str) -> None:
            support.register(self_widget, lambda paths, target=self_widget: self._on_windows_drop(target, paths))

        def drop_target_unregister(self_widget: tk.Misc, *dnd_types: str) -> None:
            support.unregister(self_widget)

        def dnd_bind(self_widget: tk.Misc, sequence: str, func, add: str = ''):
            return self_widget.bind(sequence, func, add=add)

        widget.drop_target_register = types.MethodType(drop_target_register, widget)
        widget.drop_target_unregister = types.MethodType(drop_target_unregister, widget)
        widget.dnd_bind = types.MethodType(dnd_bind, widget)
        return True

    def _on_windows_drop(self, widget: tk.Misc, paths: list[str]) -> None:
        if not paths:
            return
        try:
            data = widget.tk.call('list', *paths)
        except Exception:
            data = ' '.join(paths)
        widget.event_generate('<<Drop>>', data=data)

    def _ensure_tkdnd_available(self) -> bool:
        if self._tkdnd_ready:
            return True
        if not HAS_TKDND:
            return False
        try:
            self.root.tk.call('package', 'require', 'tkdnd')
        except tk.TclError:
            return False
        self._tkdnd_ready = True
        return True

    def _handle_file_drop(self, event) -> None:
        """ドラッグ＆ドロップされたファイル/フォルダを処理する."""

        data = getattr(event, "data", "")
        if not data:
            return

        try:
            dropped = [Path(path) for path in self.root.tk.splitlist(data)]
        except Exception:
            dropped = [Path(data)]

        if not dropped:
            return

        current_video_dir = self._resolve_input_path(self.video_dir_var.get())
        current_video_dir.mkdir(parents=True, exist_ok=True)

        video_sources: list[Path] = []
        skipped_files: list[str] = []
        skipped_dirs: list[str] = []

        for entry in dropped:
            if entry.is_dir():
                found = False
                for file_path in sorted(entry.rglob('*')):
                    if not file_path.is_file():
                        continue
                    if file_path.suffix.lower() not in VIDEO_EXTENSIONS:
                        continue
                    video_sources.append(file_path)
                    found = True
                if not found:
                    skipped_dirs.append(entry.name)
                continue

            if entry.suffix.lower() not in VIDEO_EXTENSIONS:
                skipped_files.append(entry.name)
                continue

            video_sources.append(entry)

        added_files: list[str] = []
        reused_files: list[str] = []
        seen_sources: set[str] = set()

        for source in video_sources:
            try:
                resolved_source = source.resolve()
            except OSError:
                resolved_source = source

            resolved_key = str(resolved_source)
            if resolved_key in seen_sources:
                continue
            seen_sources.add(resolved_key)

            destination = current_video_dir / resolved_source.name
            same_file = False
            if destination.exists():
                try:
                    if destination.resolve() == resolved_source:
                        same_file = True
                except OSError:
                    same_file = False

            if same_file:
                self._record_dropped_video(destination)
                reused_files.append(destination.name)
                continue

            destination = self._resolve_unique_destination(destination)

            try:
                shutil.copy2(resolved_source, destination)
            except (OSError, shutil.Error) as exc:
                self.append_log(f"[WARN] {resolved_source.name} のコピーに失敗しました: {exc}")
                continue

            self._record_dropped_video(destination)
            added_files.append(destination.name)

        if reused_files:
            summary = ", ".join(reused_files)
            self.append_log(f"[GUI] 既存の動画をキューに追加しました: {summary}")
        if added_files:
            summary = ", ".join(added_files)
            self.append_log(f"[GUI] {len(added_files)} 件の動画を保存しました: {summary}")
        if skipped_files:
            summary = ", ".join(skipped_files)
            self.append_log(f"[WARN] 対応外のファイルをスキップしました: {summary}")
        if skipped_dirs:
            summary = ", ".join(skipped_dirs)
            self.append_log(f"[WARN] 対応する動画が見つからないフォルダをスキップしました: {summary}")

        if self.state.queue_entries:
            self.append_log(f"[GUI] 現在の処理対象: {len(self.state.queue_entries)} 件")

        self._refresh_queue_view()

    def _resolve_unique_destination(self, destination: Path) -> Path:
        """同名ファイルがある場合は連番付き名称に退避する."""
    
        if not destination.exists():
            return destination
    
        stem = destination.stem
        suffix = destination.suffix
        parent = destination.parent
        counter = 1
    
        while True:
            candidate = parent / f"{stem}_{counter}{suffix}"
            if not candidate.exists():
                return candidate
            counter += 1
    


    def _record_dropped_video(self, path: Path) -> None:
        try:
            resolved = str(path.resolve())
        except OSError:
            resolved = str(path)
        if resolved in self._dropped_video_set:
            return
        self._dropped_video_set.add(resolved)
        base_name = Path(resolved).stem
        detected = detect_item_color(base_name) or "none"
        relic_type = detect_relic_type(base_name)
        self.state.queue_entries.append(
            {
                "path": resolved,
                "color": detected,
                "relic_type": normalize_relic_type(relic_type),
            }
        )

    def _refresh_queue_view(self) -> None:
        if self.queue_tree is None:
            return
        self._hide_inline_color_editor()
        self._hide_inline_relic_type_editor()
        self.queue_tree.delete(*self.queue_tree.get_children())
        self._queue_item_paths.clear()
        for entry in self.state.queue_entries:
            path = entry.get("path", "")
            name = Path(path).name if path else ""
            color = entry.get("color", self.color_options[0]) or self.color_options[0]
            relic_value = normalize_relic_type(entry.get("relic_type"))
            display_type = self._relic_type_display_map.get(
                relic_value, self.relic_type_options[0]
            )
            item_id = self.queue_tree.insert(
                "",
                "end",
                values=(name, color, display_type, path),
            )
            if path:
                self._queue_item_paths[item_id] = path
        self._update_queue_controls()

    def _schedule_results_refresh(self) -> None:
        if self._results_refresh_pending:
            return
        self._results_refresh_pending = True
        self.root.after(200, lambda: self._refresh_results_list())

    def _collect_results_entries(self, results_dir: Path) -> list[dict[str, object]]:
        entries: list[dict[str, object]] = []
        if not results_dir.exists():
            return entries

        for folder in sorted(results_dir.iterdir()):
            if folder.name.startswith(".") or not folder.is_dir():
                continue
            if folder.name.lower() == "gallery":
                continue

            csv_path: Optional[Path] = None
            for path in sorted(folder.glob("*.csv")):
                if path.name.lower() == "corrections.csv":
                    continue
                csv_path = path
                break

            try:
                modified = datetime.fromtimestamp(csv_path.stat().st_mtime) if csv_path else None
            except OSError:
                modified = None

            if csv_path:
                status_text = _summarize_review_state(csv_path)
            else:
                status_text = "未レビュー含む"

            entries.append(
                {
                    "folder": folder.name,
                    "csv": csv_path.name if csv_path else "",
                    "csv_path": str(csv_path) if csv_path else "",
                    "status": status_text,
                    "updated": modified.strftime("%Y-%m-%d %H:%M") if modified else "",
                }
            )

        return entries

    def _refresh_results_list(self, log: bool = False) -> None:
        self._results_refresh_pending = False
        tree = self.results_tree
        if tree is None:
            return

        results_dir = self._resolve_input_path(self.results_dir_var.get())
        results_path_text = str(results_dir)

        if not results_dir.exists():
            tree.delete(*tree.get_children())
            self._results_entries = []
            message = f"結果フォルダが見つかりません: {results_path_text}"
            self.results_status_var.set(message)
            if log:
                self.append_log(f"[WARN] {message}")
            return

        try:
            entries = self._collect_results_entries(results_dir)
        except Exception as exc:  # noqa: BLE001 - 例外内容をGUIに表示するため
            tree.delete(*tree.get_children())
            self._results_entries = []
            message = f"結果フォルダの読み込みに失敗しました: {exc}"
            self.results_status_var.set("結果フォルダの読み込みに失敗しました")
            self.append_log(f"[ERROR] {message}")
            return

        self._results_entries = entries
        tree.delete(*tree.get_children())
        for entry in entries:
            tree.insert(
                "",
                "end",
                values=(
                    entry.get("folder", ""),
                    entry.get("status", ""),
                    entry.get("csv", ""),
                    entry.get("updated", ""),
                ),
            )

        if not entries:
            message = "処理済みデータが見つかりません"
        else:
            reviewed_count = sum(1 for entry in entries if entry.get("status") == "全レビュー済")
            message = f"{len(entries)} 件 (全レビュー済 {reviewed_count} 件)"

        self.results_status_var.set(message)
        if log:
            self.append_log(f"[GUI] 結果フォルダを読み込みました: {results_path_text} ({len(entries)} 件)")

    def _update_log_visibility(self) -> None:
        if self.log_frame is None:
            return
        if self.log_visible_var.get():
            self.log_frame.grid()
        else:
            self.log_frame.grid_remove()

    def _update_queue_controls(self) -> None:
        if self.queue_tree is None:
            return
        selected = self.queue_tree.selection()
        if not selected:
            message = (
                "ドラッグ＆ドロップで動画を追加してください"
                if not self.state.queue_entries
                else "動画を選択してください"
            )
            self.queue_selection_var.set(message)
            return
        first_path = self.queue_tree.set(selected[0], "fullpath")
        self.queue_selection_var.set(first_path)

    def _on_queue_selection(self, _event=None) -> None:
        self._update_queue_controls()

    def _on_queue_click(self, event) -> None:
        if self.queue_tree is None:
            return
        region = self.queue_tree.identify("region", event.x, event.y)
        if region != "cell":
            self._hide_inline_color_editor()
            self._hide_inline_relic_type_editor()
            return
        column = self.queue_tree.identify_column(event.x)
        item = self.queue_tree.identify_row(event.y)
        if column == "#2" and item:
            self._hide_inline_relic_type_editor()
            self.root.after_idle(lambda: self._show_inline_color_editor(item))
        elif column == "#3" and item:
            self._hide_inline_color_editor()
            self.root.after_idle(lambda: self._show_inline_relic_type_editor(item))
        else:
            self._hide_inline_color_editor()
            self._hide_inline_relic_type_editor()

    def _create_inline_color_editor(self) -> None:
        if self.queue_tree is None:
            return
        self.inline_color_combo = ttk.Combobox(
            self.queue_tree,
            values=self.color_options,
            state="readonly",
            width=8,
        )
        self.inline_color_combo.bind("<<ComboboxSelected>>", self._on_inline_color_selected)
        self.inline_color_combo.bind("<FocusOut>", self._on_inline_color_focus_out)
        self.inline_color_combo.bind("<Escape>", lambda _event: self._hide_inline_color_editor())
        self.inline_color_combo.place_forget()

    def _create_inline_relic_type_editor(self) -> None:
        if self.queue_tree is None:
            return
        self.inline_type_combo = ttk.Combobox(
            self.queue_tree,
            values=self.relic_type_options,
            state="readonly",
            width=12,
        )
        self.inline_type_combo.bind("<<ComboboxSelected>>", self._on_inline_type_selected)
        self.inline_type_combo.bind("<FocusOut>", self._on_inline_type_focus_out)
        self.inline_type_combo.bind(
            "<Escape>", lambda _event: self._hide_inline_relic_type_editor()
        )
        self.inline_type_combo.place_forget()

    def _show_inline_color_editor(self, item: str) -> None:
        if self.queue_tree is None or self.inline_color_combo is None:
            return
        current = self.queue_tree.set(item, "color") or self.color_options[0]
        if current not in self.color_options:
            current = self.color_options[0]
        self.inline_color_combo.configure(values=self.color_options)
        self.inline_color_combo.set(current)
        self._inline_color_item = item
        self._inline_last_item = item
        if self._inline_hide_after is not None:
            try:
                self.root.after_cancel(self._inline_hide_after)
            except tk.TclError:
                pass
            self._inline_hide_after = None

        bbox = self.queue_tree.bbox(item, "color")
        if bbox:
            x, y, width, height = bbox
            self.inline_color_combo.place(x=x, y=y, width=width, height=height)
            self.inline_color_combo.lift()
            try:
                self.inline_color_combo.focus_set()
            except tk.TclError:
                pass

        def _open_dropdown() -> None:
            try:
                self.inline_color_combo.event_generate("<Alt-Down>")
            except tk.TclError:
                pass

        if bbox:
            self.root.after_idle(_open_dropdown)
        else:
            self.inline_color_combo.place_forget()

    def _show_inline_relic_type_editor(self, item: str) -> None:
        if self.queue_tree is None or self.inline_type_combo is None:
            return
        current_display = self.queue_tree.set(item, "relic_type") or self.relic_type_options[0]
        current_value = self._relic_type_value_map.get(current_display, current_display)
        normalized = normalize_relic_type(current_value)
        display_label = self._relic_type_display_map.get(normalized, self.relic_type_options[0])
        self.inline_type_combo.configure(values=self.relic_type_options)
        self.inline_type_combo.set(display_label)
        self._inline_type_item = item
        self._inline_type_last_item = item
        if self._inline_type_hide_after is not None:
            try:
                self.root.after_cancel(self._inline_type_hide_after)
            except tk.TclError:
                pass
            self._inline_type_hide_after = None

        bbox = self.queue_tree.bbox(item, "relic_type")
        if bbox:
            x, y, width, height = bbox
            self.inline_type_combo.place(x=x, y=y, width=width, height=height)
            self.inline_type_combo.lift()
            try:
                self.inline_type_combo.focus_set()
            except tk.TclError:
                pass

        def _open_dropdown() -> None:
            try:
                self.inline_type_combo.event_generate("<Alt-Down>")
            except tk.TclError:
                pass

        if bbox:
            self.root.after_idle(_open_dropdown)
        else:
            self.inline_type_combo.place_forget()

    def _on_inline_color_focus_out(self, _event=None) -> None:
        if self.inline_color_combo is None:
            return
        if self._inline_hide_after is not None:
            try:
                self.root.after_cancel(self._inline_hide_after)
            except tk.TclError:
                pass
        try:
            self._inline_hide_after = self.root.after(80, self._hide_inline_color_editor)
        except tk.TclError:
            self._inline_hide_after = None

    def _on_inline_type_focus_out(self, _event=None) -> None:
        if self.inline_type_combo is None:
            return
        if self._inline_type_hide_after is not None:
            try:
                self.root.after_cancel(self._inline_type_hide_after)
            except tk.TclError:
                pass
        try:
            self._inline_type_hide_after = self.root.after(
                80, self._hide_inline_relic_type_editor
            )
        except tk.TclError:
            self._inline_type_hide_after = None

    def _hide_inline_color_editor(self) -> None:
        if self.inline_color_combo is None:
            return
        if self._inline_hide_after is not None:
            try:
                self.root.after_cancel(self._inline_hide_after)
            except tk.TclError:
                pass
            self._inline_hide_after = None
        self.inline_color_combo.place_forget()
        self._inline_color_item = None
        # フォーカスが移動した後でも直前の行を参照できるように保持
        if self._inline_last_item is None and self.queue_tree is not None:
            current_focus = self.queue_tree.focus()
            if current_focus:
                self._inline_last_item = current_focus

    def _hide_inline_relic_type_editor(self) -> None:
        if self.inline_type_combo is None:
            return
        if self._inline_type_hide_after is not None:
            try:
                self.root.after_cancel(self._inline_type_hide_after)
            except tk.TclError:
                pass
            self._inline_type_hide_after = None
        self.inline_type_combo.place_forget()
        self._inline_type_item = None
        if self._inline_type_last_item is None and self.queue_tree is not None:
            current_focus = self.queue_tree.focus()
            if current_focus:
                self._inline_type_last_item = current_focus

    def _on_inline_color_selected(self, _event=None) -> None:
        if self.queue_tree is None or self.inline_color_combo is None:
            return
        target = self._inline_color_item or self._inline_last_item
        if not target:
            # フォーカスされた行を最終手段として利用
            target = self.queue_tree.focus() or (
                self.queue_tree.selection()[0] if self.queue_tree.selection() else ""
            )
        if not target:
            return
        chosen = self.inline_color_combo.get() or self.color_options[0]
        if chosen not in self.color_options:
            chosen = self.color_options[0]
        self._update_video_color(target, chosen)
        if self.queue_tree.exists(target):
            self.queue_tree.set(target, "color", chosen)
        self._hide_inline_color_editor()
        self._update_queue_controls()

    def _on_inline_type_selected(self, _event=None) -> None:
        if self.queue_tree is None or self.inline_type_combo is None:
            return
        target = self._inline_type_item or self._inline_type_last_item
        if not target:
            target = self.queue_tree.focus() or (
                self.queue_tree.selection()[0] if self.queue_tree.selection() else ""
            )
        if not target:
            return
        chosen_label = self.inline_type_combo.get() or self.relic_type_options[0]
        chosen_value = self._relic_type_value_map.get(chosen_label, chosen_label)
        normalized = normalize_relic_type(chosen_value)
        display_label = self._relic_type_display_map.get(normalized, self.relic_type_options[0])
        self._update_video_relic_type(target, normalized)
        if self.queue_tree.exists(target):
            self.queue_tree.set(target, "relic_type", display_label)
        self._hide_inline_relic_type_editor()
        self._update_queue_controls()

    def _on_queue_scroll_event(self, _event=None) -> None:
        self._hide_inline_color_editor()
        self._hide_inline_relic_type_editor()


    def _remove_selected_videos(self) -> None:
        if self.queue_tree is None:
            return
        self._hide_inline_color_editor()
        self._hide_inline_relic_type_editor()
        selected = self.queue_tree.selection()
        if not selected:
            return
        remove_paths = {self.queue_tree.set(item, "fullpath") for item in selected}
        if remove_paths:
            self.state.queue_entries = [
                entry for entry in self.state.queue_entries if entry.get("path") not in remove_paths
            ]
            for path_value in remove_paths:
                self._dropped_video_set.discard(path_value)
            removed_names = [Path(path_value).name for path_value in remove_paths]
            if removed_names:
                summary = ", ".join(removed_names)
                self.append_log(f"[GUI] {len(removed_names)} 件の動画をキューから削除しました: {summary}")
        self._refresh_queue_view()

    def _update_video_color(self, item_id: str, color: str) -> None:
        if self.queue_tree is None:
            return

        resolved_path = self._queue_item_paths.get(item_id, "")

        if not resolved_path and item_id and self.queue_tree.exists(item_id):
            resolved_path = self.queue_tree.set(item_id, "fullpath")
            if resolved_path:
                self._queue_item_paths[item_id] = resolved_path

        if not resolved_path:
            resolved_path = item_id

        for entry in self.state.queue_entries:
            if entry.get("path") == resolved_path:
                entry["color"] = color
                break

    def _update_video_relic_type(self, item_id: str, relic_type: str) -> None:
        if self.queue_tree is None:
            return

        resolved_path = self._queue_item_paths.get(item_id, "")

        if not resolved_path and item_id and self.queue_tree.exists(item_id):
            resolved_path = self.queue_tree.set(item_id, "fullpath")
            if resolved_path:
                self._queue_item_paths[item_id] = resolved_path

        if not resolved_path:
            resolved_path = item_id

        normalized = normalize_relic_type(relic_type)

        for entry in self.state.queue_entries:
            if entry.get("path") == resolved_path:
                entry["relic_type"] = normalized
                break

    def _resolve_input_path(self, value: str) -> Path:
        raw = Path(value.strip()) if value else Path()
        if raw.is_absolute():
            return raw.resolve()
        return (self.base_dir / raw).resolve()

    def _update_state_from_form(self, *, include_port: bool = False) -> None:
        """エントリ値からアプリ状態を更新する."""

        self.state.video_dir = self._resolve_input_path(self.video_dir_var.get())
        self.state.results_dir = self._resolve_input_path(self.results_dir_var.get())
        self.state.save_full_frames = self.save_frames_var.get()
        self.state.column_visibility = {key: var.get() for key, var in self.csv_column_vars.items()}
        self.state.merge_only_reviewed = self.merge_only_reviewed_var.get()
        self.state.server_host = self.server_host_var.get().strip() or "127.0.0.1"
        engine_value = (self.ocr_engine_var.get() or "").strip().lower() or DEFAULT_OCR_ENGINE
        if engine_value not in {"tesseract", "vision"}:
            engine_value = DEFAULT_OCR_ENGINE
        self.state.ocr_engine = engine_value
        try:
            self.state.ocr_upsample = float(self.ocr_upsample_var.get())
        except ValueError as exc:
            raise ValueError("ocr") from exc

        if include_port:
            port_text = self.server_port_var.get().strip()
            if port_text:
                try:
                    self.state.server_port = int(port_text)
                except ValueError as exc:
                    raise ValueError("port") from exc
            else:
                self.state.server_port = 0

    def _snapshot_state(self) -> GuiState:
        """現在の状態を独立したコピーとして取得する."""

        return GuiState(
            base_dir=self.state.base_dir,
            video_dir=self.state.video_dir,
            results_dir=self.state.results_dir,
            queue_entries=[dict(entry) for entry in self.state.queue_entries],
            ocr_upsample=self.state.ocr_upsample,
            ocr_engine=self.state.ocr_engine,
            gcp_credentials=self.state.gcp_credentials,
            save_full_frames=self.state.save_full_frames,
            column_visibility=dict(self.state.column_visibility),
            merge_only_reviewed=self.state.merge_only_reviewed,
            server_host=self.state.server_host,
            server_port=self.state.server_port,
        )

    def _to_user_value(self, path: Path) -> str:
        resolved = path.resolve()
        try:
            return str(resolved.relative_to(self.base_dir))
        except ValueError:
            return str(resolved)

    def _open_viewer_in_browser(self, context: ServerContext, *, force: bool = False) -> None:
        if not force and not self.open_browser_var.get():
            return
        target = context.initial_viewer if context.initial_viewer else None
        fallback = context.results_dir / "viewer.html"
        if target is None or not target.exists():
            target = fallback if fallback.exists() else None
        try:
            _open_browser(context.results_dir, target, context.host, context.port)
        except Exception as exc:  # noqa: BLE001
            self.append_log(f"[ERROR] ビューワをブラウザで開けませんでした: {exc}")
            self.root.after(
                0,
                lambda: messagebox.showerror(
                    "ビューワを開けません",
                    f"ブラウザでビューワを開けませんでした: {exc}",
                ),
            )

    def _start_progress(self, message: str, *, total_steps: Optional[int] = None) -> int:
        self._progress_counter += 1
        token = self._progress_counter
        task = {"token": token, "message": message, "total": total_steps, "value": 0}
        self._progress_tasks.append(task)
        self._refresh_progress_display()
        return token

    def _update_progress(
        self,
        token: int,
        *,
        value: Optional[int] = None,
        total: Optional[int] = None,
        message: Optional[str] = None,
    ) -> None:
        for task in self._progress_tasks:
            if task.get("token") == token:
                if total is not None:
                    task["total"] = total
                if value is not None:
                    task["value"] = value
                if message is not None:
                    task["message"] = message
                break
        self._refresh_progress_display()

    def _stop_progress(self, token: int, final_message: str = "待機中") -> None:
        self._progress_tasks = [task for task in self._progress_tasks if task.get("token") != token]
        if not self._progress_tasks:
            if self.progress_bar is not None:
                if self._progress_active:
                    self.progress_bar.stop()
                    self._progress_active = False
                self.progress_bar.configure(mode="determinate", maximum=1, value=0)
            self._progress_mode = "idle"
            self.progress_var.set(final_message)
        else:
            self._refresh_progress_display()

    def _refresh_progress_display(self) -> None:
        if not self._progress_tasks:
            if self.progress_bar is not None:
                if self._progress_active:
                    self.progress_bar.stop()
                    self._progress_active = False
                self.progress_bar.configure(mode="determinate", maximum=1, value=0)
            self._progress_mode = "idle"
            self.progress_var.set("待機中")
            return

        task = self._progress_tasks[-1]
        message = str(task.get("message") or "")
        total = task.get("total")
        value = int(task.get("value") or 0)
        self.progress_var.set(message)

        if self.progress_bar is None:
            return

        if isinstance(total, int) and total > 0:
            if self._progress_active:
                self.progress_bar.stop()
                self._progress_active = False
            if self._progress_mode != "determinate":
                self.progress_bar.configure(mode="determinate")
                self._progress_mode = "determinate"
            maximum = max(total, 1)
            clamped = max(0, min(value, maximum))
            self.progress_bar.configure(maximum=maximum, value=clamped)
        else:
            if self._progress_mode != "indeterminate":
                self.progress_bar.configure(mode="indeterminate")
                self._progress_mode = "indeterminate"
            if not self._progress_active:
                self.progress_bar.start(10)
                self._progress_active = True

    def _select_video_dir(self) -> None:
        selected = filedialog.askdirectory(title="動画フォルダを選択")
        if selected:
            self.video_dir_var.set(self._to_user_value(Path(selected)))

    def _select_results_dir(self) -> None:
        selected = filedialog.askdirectory(title="結果フォルダを選択")
        if selected:
            self.results_dir_var.set(self._to_user_value(Path(selected)))

    def append_log(self, message: str) -> None:
        text = message if message.endswith("\n") else message + "\n"
        self.log_queue.put(text)

    def _process_log_queue(self) -> None:
        try:
            while True:
                message = self.log_queue.get_nowait()
                self.log_text.configure(state="normal")
                self.log_text.insert("end", message)
                self.log_text.see("end")
                self.log_text.configure(state="disabled")
        except queue.Empty:
            pass
        finally:
            self.root.after(self.POLL_INTERVAL_MS, self._process_log_queue)

    def on_run_pipeline(self) -> None:
        if self.background_tasks.is_running("pipeline"):
            messagebox.showinfo("処理中", "現在、動画処理が実行中です。完了をお待ちください。")
            return

        try:
            self._update_state_from_form()
        except ValueError as exc:
            if exc.args and exc.args[0] == "ocr":
                messagebox.showerror("入力エラー", "OCRアップサンプルは数値で指定してください。")
            else:
                messagebox.showerror("入力エラー", "設定値の解析に失敗しました。")
            return

        if not self.state.queue_entries:
            messagebox.showinfo("動画未選択", "先に動画をドラッグ＆ドロップしてください。")
            return

        state_snapshot = self._snapshot_state()
        video_dir = str(state_snapshot.video_dir)
        results_dir = str(state_snapshot.results_dir)

        self.run_button.configure(state="disabled")
        self.append_log(
            f"[GUI] 動画処理を開始します: {video_dir} -> {results_dir} ({len(state_snapshot.queue_entries)} 件)"
        )
        token = self._start_progress("動画処理を準備中...")
        self._pipeline_progress_token = token

        def progress_callback(current: int, total: int, message: str) -> None:
            self.root.after(
                0,
                lambda c=current, t=total, msg=message: self._update_progress(
                    token,
                    value=c,
                    total=t,
                    message=msg,
                ),
            )

        def worker() -> None:
            try:
                with redirect_streams(self.log_queue):
                    self.executor.execute_pipeline(state_snapshot, progress_callback=progress_callback)
                self.append_log("[GUI] 動画処理が完了しました")
            except Exception as exc:  # noqa: BLE001 - GUIログに表示するため広く捕捉
                self.append_log("[ERROR] 動画処理中にエラーが発生しました")
                self.append_log(traceback.format_exc())
                self.root.after(
                    0,
                    lambda: messagebox.showerror("処理失敗", f"動画処理でエラーが発生しました: {exc}"),
                )
            finally:
                self.background_tasks.mark_finished("pipeline")
                self.root.after(0, self._on_pipeline_finished)

        try:
            self.background_tasks.start("pipeline", worker)
        except RuntimeError:
            self.run_button.configure(state="normal")
            messagebox.showinfo("処理中", "現在、動画処理が実行中です。完了をお待ちください。")

    def _on_pipeline_finished(self) -> None:
        self.run_button.configure(state="normal")
        if self._pipeline_progress_token is not None:
            self._stop_progress(self._pipeline_progress_token)
            self._pipeline_progress_token = None
        if self.state.queue_entries:
            self.append_log('[GUI] キューをクリアしました')
        self.state.queue_entries.clear()
        self._dropped_video_set.clear()
        self._refresh_queue_view()
        self._schedule_results_refresh()

    def on_merge_results(self) -> None:
        if self.background_tasks.is_running("merge"):
            messagebox.showinfo("統合処理中", "現在、統合処理が実行中です。完了をお待ちください。")
            return

        try:
            self._update_state_from_form()
        except ValueError:
            messagebox.showerror("入力エラー", "設定値の解析に失敗しました。")
            return

        state_snapshot = self._snapshot_state()
        results_dir = str(state_snapshot.results_dir)
        self.merge_button.configure(state="disabled")
        self.append_log(
            "[GUI] 統合処理を開始します: "
            f"{results_dir} (レビュー済みのみ={state_snapshot.merge_only_reviewed})"
        )
        self._merge_progress_token = self._start_progress("統合処理実行中...")

        def worker() -> None:
            try:
                merged_path = self.executor.merge_results(state_snapshot)
                self.append_log(f"[GUI] 統合処理が完了しました: {merged_path}")
            except MergeResultsError as err:
                self.append_log("[ERROR] 統合処理に失敗しました")
                self.append_log(str(err))
                self.root.after(
                    0,
                    lambda: messagebox.showerror("統合処理失敗", f"統合処理に失敗しました: {err}"),
                )
            except Exception as exc:  # noqa: BLE001 - GUIログに出すため
                self.append_log("[ERROR] 統合処理中に予期しないエラーが発生しました")
                self.append_log(traceback.format_exc())
                self.root.after(
                    0,
                    lambda: messagebox.showerror("統合処理失敗", f"統合処理でエラーが発生しました: {exc}"),
                )
            finally:
                self.background_tasks.mark_finished("merge")
                self.root.after(0, self._on_merge_finished)

        try:
            self.background_tasks.start("merge", worker)
        except RuntimeError:
            self.merge_button.configure(state="normal")
            messagebox.showinfo("統合処理中", "現在、統合処理が実行中です。完了をお待ちください。")

    def _on_merge_finished(self) -> None:
        self.merge_button.configure(state="normal")
        if self._merge_progress_token is not None:
            self._stop_progress(self._merge_progress_token)
            self._merge_progress_token = None
        self._schedule_results_refresh()

    def on_start_server(self) -> None:
        if self.server_context is not None:
            self._open_viewer_in_browser(self.server_context, force=True)
            return

        try:
            self._update_state_from_form(include_port=True)
        except ValueError as exc:
            if exc.args and exc.args[0] == "port":
                messagebox.showerror("入力エラー", "ポート番号は整数で指定してください。")
            else:
                messagebox.showerror("入力エラー", "設定値の解析に失敗しました。")
            return

        state_snapshot = self._snapshot_state()

        try:
            context = self.executor.start_server(state_snapshot)
        except Exception as exc:  # noqa: BLE001 - 詳細をGUIに表示するため
            self.append_log("[ERROR] サーバーの起動に失敗しました")
            self.append_log(traceback.format_exc())
            messagebox.showerror("サーバー起動エラー", f"サーバー起動に失敗しました: {exc}")
            return

        server_thread = context.start_in_thread()
        self.server_context = context
        self.server_thread = server_thread
        self.server_start_button.configure(state="disabled")

        url = f"http://{context.host}:{context.port}/"
        self.server_start_button.configure(state="normal")

        self.server_start_button.configure(text="ビューワを再度開く")
        self.append_log(f"[GUI] ビューワサーバーを起動しました: {url}")
        self.append_log(f"[GUI] ビューワルート: {context.results_dir}")
        self._open_viewer_in_browser(context)

    def on_stop_server(self) -> None:
        if self.server_context is None:
            return

        self.append_log("[GUI] ビューワサーバーを停止します")
        try:
            self.server_context.stop()
            if self.server_thread and self.server_thread.is_alive():
                self.server_thread.join(timeout=1)
        except Exception as exc:  # noqa: BLE001
            self.append_log(f"[ERROR] サーバー停止中に問題が発生しました: {exc}")
        finally:
            self.server_context = None
            self.server_thread = None
            self.server_start_button.configure(state="normal")
        self.server_start_button.configure(text="ビューワを開く")
        self.server_start_button.configure(state="normal")

    def on_close(self) -> None:
        if self.background_tasks.is_running("pipeline"):
            if not messagebox.askokcancel("終了確認", "動画処理が実行中です。アプリを終了しますか？"):
                return

        if self.server_context is not None:
            try:
                self.server_context.stop()
            except Exception as exc:  # noqa: BLE001 - 終了処理ではログのみ残す
                self.append_log(f"[WARN] サーバー停止時に問題が発生しました: {exc}")
            finally:
                self.server_context = None
                self.server_thread = None
                self.server_start_button.configure(text="ビューワを開く")
                self.server_start_button.configure(state="normal")

        try:
            self.background_tasks.join("pipeline", timeout=1)
            self.background_tasks.join("merge", timeout=1)
        except Exception:
            pass

        self._close_settings_dialog()
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


def main(argv: Optional[Sequence[str]] = None) -> None:
    _parse_cli_args(argv)
    if TkinterDnD is not None:
        root = TkinterDnD.Tk()
    else:
        root = tk.Tk()
    app = RelicGuiApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()

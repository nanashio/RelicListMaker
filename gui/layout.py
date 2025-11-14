from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import contextlib
import tkinter as tk
from tkinter import font, ttk

from .widgets import InlineCombo, place_menu_buttonbar


@dataclass
class LayoutComponents:
    main_frame: ttk.Frame
    queue_tree: ttk.Treeview
    progress_bar: ttk.Progressbar
    run_button: ttk.Button
    remove_button: ttk.Button
    merge_button: ttk.Button
    server_start_button: ttk.Button
    results_tree: ttk.Treeview
    log_frame: ttk.LabelFrame
    log_text: tk.Text
    fallback_menu: ttk.Frame | None
    menubar: tk.Menu | None


class LayoutManager:
    """Tkinterウィジェットの組み立てとスタイル設定を担うクラス."""

    def __init__(self, app: "RelicGuiApp", handlers: "AppEventHandlers") -> None:
        self.app = app
        self.handlers = handlers
        self._settings_window: tk.Toplevel | None = None
        self._menubar_attached = False
        self._fallback_menu_frame: ttk.Frame | None = None
        self.menubar: tk.Menu | None = None

    # ------------------------------------------------------------------
    # Public API

    def apply_japanese_fonts(self) -> None:
        try:
            self.app.root.update_idletasks()
            families = list(font.families(self.app.root))
        except tk.TclError:
            return
        if not families:
            return

        def match_font_name(candidate: str) -> Optional[str]:
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
        if self.app.root.tk.call("tk", "windowingsystem") == "win32":
            key = "windows"
        elif self.app.root.tk.call("tk", "windowingsystem") == "aqua":
            key = "darwin"
        elif self.app.root.tk.call("tk", "windowingsystem") == "x11":
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

    def build(self) -> LayoutComponents:
        self.apply_japanese_fonts()
        self._create_menubar()
        root = self.app.root
        root.columnconfigure(0, weight=1)
        base_row = 0
        if not self._menubar_attached:
            self._fallback_menu_frame = place_menu_buttonbar(
                root,
                exit_command=self.app.on_close,
                settings_command=self.handlers.open_settings_dialog,
                help_command=self.handlers.open_project_site,
                about_command=self.handlers.show_about_dialog,
                project_url=self.app.github_url,
                version_text=self.app.app_version,
            )
            self._fallback_menu_frame.grid(row=base_row, column=0, sticky="ew")
            base_row += 1

        main_frame = ttk.Frame(root, padding=12)
        main_frame.grid(row=base_row, column=0, sticky="nsew")
        root.rowconfigure(base_row, weight=1)
        main_frame.columnconfigure(0, weight=1)

        queue_tree, progress_bar, run_button, remove_button = self._build_queue_section(
            main_frame
        )
        results_tree, merge_button, server_start_button = self._build_results_section(
            main_frame
        )
        log_frame, log_text = self._build_log_section(main_frame)

        components = LayoutComponents(
            main_frame=main_frame,
            queue_tree=queue_tree,
            progress_bar=progress_bar,
            run_button=run_button,
            remove_button=remove_button,
            merge_button=merge_button,
            server_start_button=server_start_button,
            results_tree=results_tree,
            log_frame=log_frame,
            log_text=log_text,
            fallback_menu=self._fallback_menu_frame,
            menubar=self.menubar,
        )
        return components

    def open_settings_dialog(self) -> None:
        if self._settings_window is not None and tk.Toplevel.winfo_exists(self._settings_window):
            self._settings_window.deiconify()
            self._settings_window.lift()
            self._settings_window.focus_set()
            return
        window = tk.Toplevel(self.app.root)
        window.title("設定")
        window.transient(self.app.root)
        window.resizable(False, False)
        window.protocol("WM_DELETE_WINDOW", self.close_settings_dialog)
        window.grab_set()

        content = ttk.Frame(window, padding=12)
        content.grid(row=0, column=0, sticky="nsew")
        window.columnconfigure(0, weight=1)
        window.rowconfigure(0, weight=1)

        self._build_settings_content(content)

        self._settings_window = window
        window.focus_set()

    def close_settings_dialog(self) -> None:
        if self._settings_window is None:
            return
        window = self._settings_window
        self._settings_window = None
        with contextlib.suppress(tk.TclError):
            window.grab_release()
        with contextlib.suppress(tk.TclError):
            window.destroy()

    # ------------------------------------------------------------------
    # Internal builders

    def _build_queue_section(
        self, parent: ttk.Frame
    ) -> tuple[ttk.Treeview, ttk.Progressbar, ttk.Button, ttk.Button]:
        queue_frame = ttk.LabelFrame(parent, text="動画処理", padding=12)
        queue_frame.grid(row=0, column=0, sticky="nsew")
        parent.rowconfigure(0, weight=1)
        for col_index in range(3):
            queue_frame.columnconfigure(col_index, weight=1)
        queue_frame.rowconfigure(0, weight=1)

        tree = ttk.Treeview(
            queue_frame,
            columns=("name", "color", "relic_type", "fullpath"),
            displaycolumns=("name", "color", "relic_type"),
            show="headings",
            selectmode="extended",
            height=6,
        )
        tree.heading("name", text="動画")
        tree.heading("color", text="item_color")
        tree.heading("relic_type", text="遺物タイプ")
        tree.column("name", anchor="w", width=260)
        tree.column("color", anchor="center", width=100)
        tree.column("relic_type", anchor="center", width=120)
        tree.column("fullpath", width=0, stretch=False)
        queue_scroll = ttk.Scrollbar(queue_frame, orient="vertical", command=tree.yview)
        tree.configure(yscrollcommand=queue_scroll.set)
        tree.grid(row=0, column=0, columnspan=3, sticky="nsew")
        queue_scroll.grid(row=0, column=3, sticky="ns")
        tree.bind("<<TreeviewSelect>>", self.handlers.on_queue_selection)
        tree.bind("<Button-1>", self.handlers.on_queue_click, add="+")
        tree.bind("<MouseWheel>", self.handlers.on_queue_scroll, add="+")
        tree.bind("<Button-4>", self.handlers.on_queue_scroll, add="+")
        tree.bind("<Button-5>", self.handlers.on_queue_scroll, add="+")
        tree.bind("<Configure>", self.handlers.on_queue_scroll, add="+")

        color_editor = InlineCombo(
            self.app.root,
            tree,
            values=self.handlers.color_options,
            width=8,
            on_selected=self.handlers.on_color_selected,
            on_focus_out=self.handlers.on_color_focus_out,
            on_cancel=self.handlers.cancel_color_editor,
        )
        type_editor = InlineCombo(
            self.app.root,
            tree,
            values=self.handlers.relic_type_options,
            width=12,
            on_selected=self.handlers.on_relic_type_selected,
            on_focus_out=self.handlers.on_relic_type_focus_out,
            on_cancel=self.handlers.cancel_relic_type_editor,
        )
        self.handlers.attach_inline_editors(color_editor, type_editor)

        run_button = ttk.Button(
            queue_frame, text="動画処理を実行", command=self.handlers.run_pipeline
        )
        run_button.grid(row=1, column=0, columnspan=2, sticky="ew", padx=(0, 8), pady=(8, 0))
        remove_button = ttk.Button(
            queue_frame,
            text="選択動画を削除",
            command=self.handlers.remove_selected_videos,
        )
        remove_button.grid(row=1, column=2, sticky="ew", pady=(8, 0))

        progress_frame = ttk.Frame(queue_frame, padding=8)
        progress_frame.grid(row=2, column=0, columnspan=3, sticky="ew", pady=(12, 0))
        progress_frame.columnconfigure(0, weight=1)
        progress_bar = ttk.Progressbar(progress_frame, orient="horizontal", mode="indeterminate")
        progress_bar.grid(row=0, column=0, sticky="ew")
        ttk.Label(progress_frame, textvariable=self.app.progress_var).grid(
            row=1, column=0, sticky="w", pady=(8, 0)
        )

        return tree, progress_bar, run_button, remove_button

    def _build_results_section(
        self, parent: ttk.Frame
    ) -> tuple[ttk.Treeview, ttk.Button, ttk.Button]:
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

        server_button = ttk.Button(
            buttons_frame,
            text="ビューワを開く",
            command=self.handlers.start_server,
        )
        server_button.grid(row=0, column=0, sticky="ew", padx=(4, 2), pady=4)
        merge_button = ttk.Button(
            buttons_frame,
            text="統合結果を生成",
            command=self.handlers.start_merge,
        )
        merge_button.grid(row=0, column=1, sticky="ew", padx=(2, 4), pady=4)

        ttk.Checkbutton(
            buttons_frame,
            text="効果が全てレビュー済みの項目のみ統合",
            variable=self.app.merge_only_reviewed_var,
        ).grid(row=1, column=0, columnspan=2, sticky="w", padx=(4, 4), pady=(0, 4))

        toolbar = ttk.Frame(actions_frame)
        toolbar.grid(row=1, column=0, columnspan=2, sticky="ew", pady=(8, 0))
        ttk.Button(toolbar, text="再読み込み", command=self.handlers.refresh_results).pack(
            side="left"
        )
        ttk.Label(toolbar, textvariable=self.app.results_status_var).pack(
            side="left", padx=8
        )
        ttk.Checkbutton(
            toolbar,
            text="ログを表示",
            variable=self.app.log_visible_var,
            command=self.handlers.update_log_visibility,
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
        actions_frame.rowconfigure(2, weight=1)
        tree_scroll = ttk.Scrollbar(actions_frame, orient="vertical", command=tree.yview)
        tree.configure(yscrollcommand=tree_scroll.set)
        tree_scroll.grid(row=2, column=1, sticky="ns")

        return tree, merge_button, server_button

    def _build_log_section(self, parent: ttk.Frame) -> tuple[ttk.LabelFrame, tk.Text]:
        log_frame = ttk.LabelFrame(parent, text="ログ", padding=12)
        log_frame.grid(row=2, column=0, sticky="nsew", pady=(12, 0))
        parent.rowconfigure(2, weight=1)

        log_text = tk.Text(log_frame, height=20, state="disabled", wrap="word")
        log_text.grid(row=0, column=0, sticky="nsew")
        log_scroll = ttk.Scrollbar(log_frame, orient="vertical", command=log_text.yview)
        log_scroll.grid(row=0, column=1, sticky="ns")
        log_text.configure(yscrollcommand=log_scroll.set)
        log_frame.columnconfigure(0, weight=1)
        log_frame.rowconfigure(0, weight=1)

        return log_frame, log_text

    def _create_menubar(self) -> None:
        self.app.root.option_add("*tearOff", False)
        menubar = tk.Menu(self.app.root)

        file_menu = tk.Menu(menubar, tearoff=False)
        file_menu.add_command(label="終了", command=self.app.on_close)
        menubar.add_cascade(label="ファイル", menu=file_menu)

        settings_menu = tk.Menu(menubar, tearoff=False)
        settings_menu.add_command(label="設定を開く", command=self.handlers.open_settings_dialog)
        menubar.add_cascade(label="設定", menu=settings_menu)

        help_menu = tk.Menu(menubar, tearoff=False)
        help_menu.add_command(label=f"バージョン: {self.app.app_version}", state="disabled")
        help_menu.add_command(label=self.app.github_url, command=self.handlers.open_project_site)
        help_menu.add_separator()
        help_menu.add_command(label="このアプリについて", command=self.handlers.show_about_dialog)
        menubar.add_cascade(label="ヘルプ", menu=help_menu)

        attached = False
        for setter in (
            lambda menu: self.app.root.configure(menu=menu),
            lambda menu: self.app.root.__setitem__("menu", menu),
        ):
            try:
                setter(menubar)
                attached = bool(self.app.root.cget("menu"))
            except tk.TclError:
                continue
            if attached:
                break
        self._menubar_attached = attached
        self.menubar = menubar

    def _build_settings_content(self, parent: tk.Widget) -> None:
        for index in range(3):
            weight = 1 if index == 1 else 0
            parent.columnconfigure(index, weight=weight)
        ttk.Label(parent, text="動画フォルダ").grid(
            row=0, column=0, sticky="w", padx=(0, 8), pady=2
        )
        ttk.Entry(parent, textvariable=self.app.video_dir_var).grid(
            row=0, column=1, sticky="ew", pady=2
        )
        ttk.Button(parent, text="選択", command=self.handlers.select_video_dir).grid(
            row=0, column=2, padx=(8, 0), pady=2
        )
        ttk.Label(parent, text="結果フォルダ").grid(
            row=1, column=0, sticky="w", padx=(0, 8), pady=2
        )
        ttk.Entry(parent, textvariable=self.app.results_dir_var).grid(
            row=1, column=1, sticky="ew", pady=2
        )
        ttk.Button(parent, text="選択", command=self.handlers.select_results_dir).grid(
            row=1, column=2, padx=(8, 0), pady=2
        )
        ttk.Label(parent, text="OCRアップサンプル").grid(
            row=2, column=0, sticky="w", padx=(0, 8), pady=2
        )
        ttk.Entry(parent, textvariable=self.app.ocr_upsample_var, width=10).grid(
            row=2, column=1, sticky="w", pady=2
        )
        ttk.Label(parent, text="OCRエンジン").grid(
            row=3, column=0, sticky="w", padx=(0, 8), pady=2
        )
        engine_frame = ttk.Frame(parent)
        engine_frame.grid(row=3, column=1, columnspan=2, sticky="w", pady=2)
        ttk.Radiobutton(
            engine_frame,
            text="Tesseract",
            value="tesseract",
            variable=self.app.ocr_engine_var,
        ).pack(side="left", padx=(0, 8))
        ttk.Radiobutton(
            engine_frame,
            text="Google Cloud Vision",
            value="vision",
            variable=self.app.ocr_engine_var,
        ).pack(side="left")
        ttk.Label(parent, text="Vision認証ファイル名").grid(
            row=4, column=0, sticky="w", padx=(0, 8), pady=2
        )
        ttk.Entry(parent, textvariable=self.app.gcp_credentials_filename_var).grid(
            row=4, column=1, columnspan=2, sticky="ew", pady=2
        )
        ttk.Label(parent, text="サーバーホスト").grid(
            row=5, column=0, sticky="w", padx=(0, 8), pady=2
        )
        ttk.Entry(parent, textvariable=self.app.server_host_var, width=16).grid(
            row=5, column=1, sticky="w", pady=2
        )
        ttk.Label(parent, text="サーバーポート").grid(
            row=6, column=0, sticky="w", padx=(0, 8), pady=2
        )
        ttk.Entry(parent, textvariable=self.app.server_port_var, width=10).grid(
            row=6, column=1, sticky="w", pady=2
        )
        ttk.Checkbutton(
            parent,
            text="サーバー起動時にブラウザを開く",
            variable=self.app.open_browser_var,
        ).grid(row=7, column=0, columnspan=3, sticky="w", pady=4)
        ttk.Checkbutton(
            parent,
            text="全体画像を出力する",
            variable=self.app.save_frames_var,
        ).grid(row=8, column=0, columnspan=3, sticky="w", pady=(0, 4))

        csv_frame = ttk.LabelFrame(parent, text="CSV出力列", padding=12)
        csv_frame.grid(row=9, column=0, columnspan=3, sticky="ew", pady=(8, 0))
        for col_index in range(2):
            csv_frame.columnconfigure(col_index, weight=1)
        required_specs = [
            ("RawText[n]", "RawText"),
            ("Effect[n]Score", "Score"),
            ("Effect[n]LevelOptions", "LevelOptions"),
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
                variable=self.app.csv_column_vars[key],
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
                variable=self.app.csv_column_vars[key],
            ).grid(row=row_index, column=col_index, sticky="w", padx=(0, 8), pady=2)

        button_frame = ttk.Frame(parent)
        button_frame.grid(row=10, column=0, columnspan=3, sticky="ew", pady=(12, 0))
        button_frame.columnconfigure(0, weight=1)
        ttk.Button(button_frame, text="閉じる", command=self.close_settings_dialog).grid(
            row=0, column=0, sticky="e"
        )


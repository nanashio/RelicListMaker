"""解析処理とビューワサーバーを統合するGUIランチャー."""
from __future__ import annotations

import contextlib
import io
import queue
import shutil
import sys
import types
import threading
import traceback
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk
from typing import Optional

import main as pipeline_main
from merge_results import MergeResultsError, merge_results
from viewer_server import ServerContext, create_server, _open_browser


try:
    from tkinterdnd2 import DND_FILES, TkinterDnD  # type: ignore

    _HAS_DND = True
except Exception:  # noqa: BLE001 - optional dependency
    TkinterDnD = None
    DND_FILES = "DND_Files"
    _HAS_DND = False

VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".avi", ".wmv", ".m4v"}

def _default_base_dir() -> Path:
    """実行形態に応じて videos/results の既定配置場所を返す."""

    if getattr(sys, "frozen", False):
        # PyInstaller 実行体は exe の配置ディレクトリをベースにする
        try:
            return Path(sys.executable).resolve().parent
        except OSError:
            return Path.cwd()
    return Path(__file__).resolve().parent


class QueueWriter(io.TextIOBase):
    """標準出力をGUIログに流すための擬似ファイル."""

    def __init__(self, target_queue: "queue.Queue[str]") -> None:
        super().__init__()
        self._queue = target_queue

    def write(self, data: str) -> int:
        if not data:
            return 0
        self._queue.put(data)
        return len(data)

    def flush(self) -> None:
        # queue.Queue はスレッドセーフなため特別な flush は不要
        return None


@contextlib.contextmanager
def redirect_streams(target_queue: "queue.Queue[str]"):
    """標準出力・標準エラーをGUIログにリダイレクトするコンテキスト."""

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


class RelicGuiApp:
    """NightReign Relic パイプラインのGUIフロントエンド."""

    POLL_INTERVAL_MS = 100

    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("NightReign Relic ツール")

        self.base_dir = _default_base_dir()
        self.video_dir_var = tk.StringVar(value="videos")
        self.results_dir_var = tk.StringVar(value="results")
        self.ocr_upsample_var = tk.StringVar(value=str(pipeline_main.OCR_UPSAMPLE))
        self.server_host_var = tk.StringVar(value="127.0.0.1")
        self.server_port_var = tk.StringVar(value="0")
        self.open_browser_var = tk.BooleanVar(value=True)
        self.server_status_var = tk.StringVar(value="サーバー停止中")
        self.merge_only_reviewed_var = tk.BooleanVar(value=True)

        self.pipeline_thread: Optional[threading.Thread] = None
        self.server_context: Optional[ServerContext] = None
        self.server_thread: Optional[threading.Thread] = None
        self.log_queue: "queue.Queue[str]" = queue.Queue()
        self.merge_thread: Optional[threading.Thread] = None
        self.progress_var = tk.StringVar(value="待機中")
        self.progress_bar: Optional[ttk.Progressbar] = None
        self._progress_tasks: list[dict[str, object]] = []
        self._progress_counter = 0
        self._progress_active = False
        self._progress_mode = "idle"
        self._pipeline_progress_token: Optional[int] = None
        self._merge_progress_token: Optional[int] = None
        self._tkdnd_ready = False

        self._build_layout()
        self._init_drag_and_drop()
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)
        self.root.after(self.POLL_INTERVAL_MS, self._process_log_queue)

    def _build_layout(self) -> None:
        main_frame = ttk.Frame(self.root, padding=12)
        self.main_frame = main_frame
        main_frame.grid(row=0, column=0, sticky="nsew")
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)

        config_frame = ttk.LabelFrame(main_frame, text="設定", padding=12)
        config_frame.grid(row=0, column=0, sticky="nsew")
        config_frame.columnconfigure(1, weight=1)

        ttk.Label(config_frame, text="動画フォルダ").grid(row=0, column=0, sticky="w", padx=(0, 8), pady=2)
        video_entry = ttk.Entry(config_frame, textvariable=self.video_dir_var)
        video_entry.grid(row=0, column=1, sticky="ew", pady=2)
        ttk.Button(config_frame, text="選択", command=self._select_video_dir).grid(row=0, column=2, padx=(8, 0), pady=2)

        ttk.Label(config_frame, text="結果フォルダ").grid(row=1, column=0, sticky="w", padx=(0, 8), pady=2)
        results_entry = ttk.Entry(config_frame, textvariable=self.results_dir_var)
        results_entry.grid(row=1, column=1, sticky="ew", pady=2)
        ttk.Button(config_frame, text="選択", command=self._select_results_dir).grid(row=1, column=2, padx=(8, 0), pady=2)

        ttk.Label(config_frame, text="OCRアップサンプル").grid(row=2, column=0, sticky="w", padx=(0, 8), pady=2)
        ttk.Entry(config_frame, textvariable=self.ocr_upsample_var, width=10).grid(row=2, column=1, sticky="w", pady=2)

        ttk.Label(config_frame, text="サーバーホスト").grid(row=3, column=0, sticky="w", padx=(0, 8), pady=2)
        ttk.Entry(config_frame, textvariable=self.server_host_var, width=16).grid(row=3, column=1, sticky="w", pady=2)

        ttk.Label(config_frame, text="サーバーポート").grid(row=4, column=0, sticky="w", padx=(0, 8), pady=2)
        ttk.Entry(config_frame, textvariable=self.server_port_var, width=10).grid(row=4, column=1, sticky="w", pady=2)

        ttk.Checkbutton(
            config_frame,
            text="サーバー起動時にブラウザを開く",
            variable=self.open_browser_var,
        ).grid(row=5, column=0, columnspan=3, sticky="w", pady=4)

        actions_frame = ttk.LabelFrame(main_frame, text="操作", padding=12)
        actions_frame.grid(row=1, column=0, sticky="ew", pady=(12, 0))
        actions_frame.columnconfigure(0, weight=1)
        actions_frame.columnconfigure(1, weight=1)
        actions_frame.columnconfigure(2, weight=1)

        self.run_button = ttk.Button(actions_frame, text="動画処理を実行", command=self.on_run_pipeline)
        self.run_button.grid(row=0, column=0, sticky="ew", padx=4, pady=4)
        self.server_start_button = ttk.Button(actions_frame, text="ビューワを開く", command=self.on_start_server)
        self.server_start_button.grid(row=0, column=1, sticky="ew", padx=4, pady=4)

        ttk.Label(actions_frame, textvariable=self.server_status_var).grid(row=1, column=0, columnspan=3, sticky="w", padx=4, pady=(4, 0))

        self.merge_button = ttk.Button(actions_frame, text="統合結果を生成", command=self.on_merge_results)
        self.merge_button.grid(row=2, column=0, columnspan=3, sticky="ew", padx=4, pady=(8, 4))
        ttk.Checkbutton(
            actions_frame,
            text="効果が全てレビュー済みの項目のみ統合",
            variable=self.merge_only_reviewed_var,
        ).grid(row=3, column=0, columnspan=3, sticky="w", padx=4, pady=(0, 4))

        progress_frame = ttk.LabelFrame(main_frame, text="進行状況", padding=12)
        progress_frame.grid(row=2, column=0, sticky="ew", pady=(12, 0))
        progress_frame.columnconfigure(0, weight=1)
        self.progress_bar = ttk.Progressbar(progress_frame, orient="horizontal", mode="indeterminate")
        self.progress_bar.grid(row=0, column=0, sticky="ew")
        ttk.Label(progress_frame, textvariable=self.progress_var).grid(row=1, column=0, sticky="w", pady=(8, 0))

        log_frame = ttk.LabelFrame(main_frame, text="ログ", padding=12)
        log_frame.grid(row=3, column=0, sticky="nsew", pady=(12, 0))
        main_frame.rowconfigure(3, weight=1)

        self.log_text = tk.Text(log_frame, height=20, state="disabled", wrap="word")
        self.log_text.grid(row=0, column=0, sticky="nsew")
        log_scroll = ttk.Scrollbar(log_frame, orient="vertical", command=self.log_text.yview)
        log_scroll.grid(row=0, column=1, sticky="ns")
        self.log_text.configure(yscrollcommand=log_scroll.set)
        log_frame.columnconfigure(0, weight=1)
        log_frame.rowconfigure(0, weight=1)


    

    def _init_drag_and_drop(self) -> None:
        """動画ファイルのドラッグ＆ドロップ受付を設定する."""

        self._dnd_enabled = False
        widgets: list[tk.Misc] = []

        if not hasattr(self.root, "drop_target_register"):
            self._attach_tkdnd(self.root)
        if hasattr(self.root, "drop_target_register"):
            widgets.append(self.root)

        main_frame = getattr(self, "main_frame", None)
        if main_frame is not None and not hasattr(main_frame, "drop_target_register"):
            self._attach_tkdnd(main_frame)
        if main_frame is not None and hasattr(main_frame, "drop_target_register"):
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
        elif not widgets:
            self.append_log("[WARN] この環境ではドラッグ＆ドロップを利用できません (tkdnd未検出)")

    def _attach_tkdnd(self, widget: tk.Misc) -> None:
        """tkdnd が利用できる場合に Tk ウィジェットへDnDメソッドを付与する."""

        if not isinstance(widget, tk.Misc):
            return
        if hasattr(widget, "drop_target_register"):
            return
        if not self._ensure_tkdnd_available():
            return

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

    def _ensure_tkdnd_available(self) -> bool:
        if self._tkdnd_ready:
            return True
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
    
        added_files: list[str] = []
        skipped_files: list[str] = []
        updated_dir = False
    
        for entry in dropped:
            if entry.is_dir():
                self.video_dir_var.set(self._to_user_value(entry))
                current_video_dir = self._resolve_input_path(self.video_dir_var.get())
                current_video_dir.mkdir(parents=True, exist_ok=True)
                updated_dir = True
                continue
    
            suffix = entry.suffix.lower()
            if suffix not in VIDEO_EXTENSIONS:
                skipped_files.append(entry.name)
                continue
    
            destination = current_video_dir / entry.name
            try:
                if destination.resolve() == entry.resolve():
                    added_files.append(entry.name)
                    continue
            except OSError:
                pass
    
            destination = self._resolve_unique_destination(destination)
    
            try:
                shutil.copy2(entry, destination)
                added_files.append(destination.name)
            except (OSError, shutil.Error) as exc:
                self.append_log(f"[WARN] {entry.name} のコピーに失敗しました: {exc}")
    
        if added_files:
            summary = ", ".join(added_files)
            self.append_log(f"[GUI] {len(added_files)} 件の動画を追加しました: {summary}")
        if skipped_files:
            summary = ", ".join(skipped_files)
            self.append_log(f"[WARN] 対応外のファイルをスキップしました: {summary}")
        if updated_dir:
            self.append_log("[GUI] 動画フォルダをドラッグされたフォルダに切り替えました")
    
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
    
    def _resolve_input_path(self, value: str) -> Path:
        raw = Path(value.strip()) if value else Path()
        if raw.is_absolute():
            return raw.resolve()
        return (self.base_dir / raw).resolve()

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
        if self.pipeline_thread and self.pipeline_thread.is_alive():
            messagebox.showinfo("処理中", "現在、動画処理が実行中です。完了をお待ちください。")
            return

        try:
            ocr_value = float(self.ocr_upsample_var.get())
        except ValueError:
            messagebox.showerror("入力エラー", "OCRアップサンプルは数値で指定してください。")
            return

        video_dir = str(self._resolve_input_path(self.video_dir_var.get()))
        results_dir = str(self._resolve_input_path(self.results_dir_var.get()))
        self.run_button.configure(state="disabled")
        self.append_log(f"[GUI] 動画処理を開始します: {video_dir} -> {results_dir}")
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
                    pipeline_main.main(
                        video_dir=video_dir,
                        result_dir=results_dir,
                        ocr_upsample=ocr_value,
                        progress_callback=progress_callback,
                    )
                self.append_log("[GUI] 動画処理が完了しました")
            except Exception as exc:  # noqa: BLE001 - GUIログに表示するため広く捕捉
                self.append_log("[ERROR] 動画処理中にエラーが発生しました")
                self.append_log(traceback.format_exc())
                self.root.after(0, lambda: messagebox.showerror("処理失敗", f"動画処理でエラーが発生しました: {exc}"))
            finally:
                self.root.after(0, self._on_pipeline_finished)

        self.pipeline_thread = threading.Thread(target=worker, daemon=True)
        self.pipeline_thread.start()

    def _on_pipeline_finished(self) -> None:
        self.run_button.configure(state="normal")
        self.pipeline_thread = None
        if self._pipeline_progress_token is not None:
            self._stop_progress(self._pipeline_progress_token)
            self._pipeline_progress_token = None

    def on_merge_results(self) -> None:
        if self.merge_thread and self.merge_thread.is_alive():
            messagebox.showinfo("統合処理中", "現在、統合処理が実行中です。完了をお待ちください。")
            return

        results_dir = str(self._resolve_input_path(self.results_dir_var.get()))
        self.merge_button.configure(state="disabled")
        self.append_log(
            "[GUI] 統合処理を開始します: "
            f"{results_dir} (レビュー済みのみ={self.merge_only_reviewed_var.get()})"
        )
        self._merge_progress_token = self._start_progress("統合処理実行中...")

        def worker() -> None:
            try:
                merged_path = merge_results(
                    results_dir,
                    only_reviewed=self.merge_only_reviewed_var.get(),
                )
                self.append_log(f"[GUI] 統合処理が完了しました: {merged_path}")
            except MergeResultsError as err:
                self.append_log("[ERROR] 統合処理に失敗しました")
                self.append_log(str(err))
                self.root.after(0, lambda: messagebox.showerror("統合処理失敗", f"統合処理に失敗しました: {err}"))
            except Exception as exc:  # noqa: BLE001 - GUIログに出すため
                self.append_log("[ERROR] 統合処理中に予期しないエラーが発生しました")
                self.append_log(traceback.format_exc())
                self.root.after(0, lambda: messagebox.showerror("統合処理失敗", f"統合処理でエラーが発生しました: {exc}"))
            finally:
                self.root.after(0, self._on_merge_finished)

        self.merge_thread = threading.Thread(target=worker, daemon=True)
        self.merge_thread.start()

    def _on_merge_finished(self) -> None:
        self.merge_button.configure(state="normal")
        self.merge_thread = None
        if self._merge_progress_token is not None:
            self._stop_progress(self._merge_progress_token)
            self._merge_progress_token = None

    def on_start_server(self) -> None:
        if self.server_context is not None:
            self._open_viewer_in_browser(self.server_context, force=True)
            return

        host = self.server_host_var.get().strip() or "127.0.0.1"
        port_text = self.server_port_var.get().strip()
        try:
            port = int(port_text) if port_text else 0
        except ValueError:
            messagebox.showerror("入力エラー", "ポート番号は整数で指定してください。")
            return

        try:
            context = create_server(
                results_dir=str(self._resolve_input_path(self.results_dir_var.get())),
                host=host,
                port=port,
                video=None,
            )
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

        self.server_status_var.set(f"サーバー稼働中: {url}")
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
            self.server_status_var.set("サーバー停止中")
        self.server_start_button.configure(text="ビューワを開く")
        self.server_start_button.configure(state="normal")

    def on_close(self) -> None:
        if self.pipeline_thread and self.pipeline_thread.is_alive():
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
                self.server_status_var.set("サーバー停止中")

        if self.merge_thread and self.merge_thread.is_alive():
            try:
                self.merge_thread.join(timeout=1)
            except Exception:
                pass

        self.root.destroy()


def main() -> None:
    if TkinterDnD is not None:
        root = TkinterDnD.Tk()
    else:
        root = tk.Tk()
    app = RelicGuiApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()

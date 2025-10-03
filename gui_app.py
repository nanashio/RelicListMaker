"""解析処理とビューワサーバーを統合するGUIランチャー."""
from __future__ import annotations

import contextlib
import io
import queue
import sys
import threading
import traceback
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk
from typing import Optional

import main as pipeline_main
from viewer_server import ServerContext, create_server, _open_browser


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
        self.server_video_var = tk.StringVar(value="")
        self.open_browser_var = tk.BooleanVar(value=True)
        self.server_status_var = tk.StringVar(value="サーバー停止中")

        self.pipeline_thread: Optional[threading.Thread] = None
        self.server_context: Optional[ServerContext] = None
        self.server_thread: Optional[threading.Thread] = None
        self.log_queue: "queue.Queue[str]" = queue.Queue()
        self.viewer_choice_var = tk.StringVar()
        self.viewer_entries: list[tuple[str, Path, Optional[str]]] = []

        self._build_layout()
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)
        self.root.after(self.POLL_INTERVAL_MS, self._process_log_queue)
        self._refresh_viewer_list()

    def _build_layout(self) -> None:
        main_frame = ttk.Frame(self.root, padding=12)
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

        ttk.Label(config_frame, text="初期表示動画名").grid(row=5, column=0, sticky="w", padx=(0, 8), pady=2)
        ttk.Entry(config_frame, textvariable=self.server_video_var).grid(row=5, column=1, sticky="ew", pady=2)

        ttk.Checkbutton(
            config_frame,
            text="サーバー起動時にブラウザを開く",
            variable=self.open_browser_var,
        ).grid(row=6, column=0, columnspan=3, sticky="w", pady=4)

        actions_frame = ttk.LabelFrame(main_frame, text="操作", padding=12)
        actions_frame.grid(row=1, column=0, sticky="ew", pady=(12, 0))
        actions_frame.columnconfigure(0, weight=1)
        actions_frame.columnconfigure(1, weight=1)
        actions_frame.columnconfigure(2, weight=1)

        self.run_button = ttk.Button(actions_frame, text="動画処理を実行", command=self.on_run_pipeline)
        self.run_button.grid(row=0, column=0, sticky="ew", padx=4, pady=4)

        self.server_start_button = ttk.Button(actions_frame, text="サーバー起動", command=self.on_start_server)
        self.server_start_button.grid(row=0, column=1, sticky="ew", padx=4, pady=4)

        self.server_stop_button = ttk.Button(actions_frame, text="サーバー停止", command=self.on_stop_server, state="disabled")
        self.server_stop_button.grid(row=0, column=2, sticky="ew", padx=4, pady=4)

        ttk.Label(actions_frame, textvariable=self.server_status_var).grid(row=1, column=0, columnspan=3, sticky="w", padx=4, pady=(4, 0))

        viewer_frame = ttk.LabelFrame(main_frame, text="結果ビューワ一覧", padding=12)
        viewer_frame.grid(row=2, column=0, sticky="ew", pady=(12, 0))
        viewer_frame.columnconfigure(0, weight=1)
        ttk.Label(viewer_frame, text="*_viewer.html").grid(row=0, column=0, sticky="w", padx=(0, 8))
        self.viewer_combo = ttk.Combobox(
            viewer_frame,
            textvariable=self.viewer_choice_var,
            state="readonly",
            values=[],
        )
        self.viewer_combo.grid(row=0, column=1, sticky="ew")
        self.viewer_combo.bind("<<ComboboxSelected>>", self._on_viewer_selected)
        ttk.Button(viewer_frame, text="一覧更新", command=self._refresh_viewer_list).grid(row=0, column=2, padx=(8, 0))
        ttk.Button(viewer_frame, text="ブラウザで開く", command=self.on_open_selected_viewer).grid(row=0, column=3, padx=(8, 0))

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

    def _refresh_viewer_list(self) -> None:
        results_dir = self._resolve_input_path(self.results_dir_var.get())
        entries: list[tuple[str, Path, Optional[str]]] = []
        if results_dir.exists():
            for candidate in sorted(results_dir.rglob("*_viewer.html")):
                try:
                    display = candidate.relative_to(results_dir).as_posix()
                except ValueError:
                    display = candidate.name
                video_name: Optional[str] = None
                stem = candidate.stem
                if stem.endswith("_viewer"):
                    video_name = stem[:-len("_viewer")]
                if not video_name:
                    parent = candidate.parent
                    if parent != results_dir:
                        video_name = parent.name
                entries.append((display, candidate, video_name))

        self.viewer_entries = entries
        values = [item[0] for item in entries]
        self.viewer_combo.configure(values=values)

        if entries:
            current = self.viewer_choice_var.get()
            if current not in values:
                self.viewer_choice_var.set(values[0])
                self._on_viewer_selected()
        else:
            self.viewer_choice_var.set("")
            self.server_video_var.set("")

    def _find_viewer_entry(self) -> Optional[tuple[str, Path, Optional[str]]]:
        selection = self.viewer_choice_var.get()
        for entry in self.viewer_entries:
            if entry[0] == selection:
                return entry
        return None

    def _on_viewer_selected(self, event: Optional[tk.Event] = None) -> None:  # type: ignore[override]
        entry = self._find_viewer_entry()
        if entry is None:
            return
        _, _, video_name = entry
        if video_name:
            self.server_video_var.set(video_name)

    def on_open_selected_viewer(self) -> None:
        entry = self._find_viewer_entry()
        if entry is None:
            messagebox.showinfo("ビューワ未選択", "対象のビューワを選択してください。")
            return
        _, path, _ = entry
        if self.server_context is None:
            should_start = messagebox.askyesno(
                "サーバー未起動",
                "ビューワを開くにはサーバーを起動する必要があります。\n現在の設定で起動しますか？",
            )
            if not should_start:
                return
            self.on_start_server()
            if self.server_context is None:
                messagebox.showerror("サーバー起動失敗", "サーバーを起動できませんでした。設定を確認してください。")
                return

        context = self.server_context
        try:
            _open_browser(context.results_dir, path, context.host, context.port)
        except Exception as exc:  # noqa: BLE001
            messagebox.showerror(
                "ビューワを開けません",
                f"サーバー経由で {path} を開けませんでした: {exc}",
            )

    def _select_video_dir(self) -> None:
        selected = filedialog.askdirectory(title="動画フォルダを選択")
        if selected:
            self.video_dir_var.set(self._to_user_value(Path(selected)))

    def _select_results_dir(self) -> None:
        selected = filedialog.askdirectory(title="結果フォルダを選択")
        if selected:
            self.results_dir_var.set(self._to_user_value(Path(selected)))
            self._refresh_viewer_list()

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

        def worker() -> None:
            try:
                with redirect_streams(self.log_queue):
                    pipeline_main.main(video_dir=video_dir, result_dir=results_dir, ocr_upsample=ocr_value)
                self.append_log("[GUI] 動画処理が完了しました")
            except Exception as exc:  # noqa: BLE001 - GUIログに表示するため広く捕捉
                self.append_log("[ERROR] 動画処理中にエラーが発生しました")
                self.append_log(traceback.format_exc())
                self.root.after(0, lambda: messagebox.showerror("処理失敗", f"動画処理でエラーが発生しました: {exc}"))
            finally:
                self.root.after(0, self._on_pipeline_finished)
                self.root.after(0, self._refresh_viewer_list)

        self.pipeline_thread = threading.Thread(target=worker, daemon=True)
        self.pipeline_thread.start()

    def _on_pipeline_finished(self) -> None:
        self.run_button.configure(state="normal")
        self.pipeline_thread = None

    def on_start_server(self) -> None:
        if self.server_context is not None:
            messagebox.showinfo("サーバー稼働中", "サーバーは既に起動しています。")
            return

        host = self.server_host_var.get().strip() or "127.0.0.1"
        port_text = self.server_port_var.get().strip()
        try:
            port = int(port_text) if port_text else 0
        except ValueError:
            messagebox.showerror("入力エラー", "ポート番号は整数で指定してください。")
            return

        video_name = self.server_video_var.get().strip() or None

        try:
            context = create_server(
                results_dir=str(self._resolve_input_path(self.results_dir_var.get())),
                host=host,
                port=port,
                video=video_name,
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
        self.server_stop_button.configure(state="normal")

        url = f"http://{context.host}:{context.port}/"
        self.server_status_var.set(f"サーバー稼働中: {url}")
        self.append_log(f"[GUI] ビューワサーバーを起動しました: {url}")
        self.append_log(f"[GUI] ビューワルート: {context.results_dir}")
        if video_name and not context.matched_initial:
            self.append_log(f"[WARN] 指定動画 {video_name} のビューワは見つかりませんでした")

        if self.open_browser_var.get():
            target = context.initial_viewer if context.initial_viewer else None
            _open_browser(context.results_dir, target, context.host, context.port)

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
            self.server_stop_button.configure(state="disabled")
            self.server_status_var.set("サーバー停止中")

    def on_close(self) -> None:
        if self.pipeline_thread and self.pipeline_thread.is_alive():
            if not messagebox.askokcancel("終了確認", "動画処理が実行中です。アプリを終了しますか？"):
                return

        if self.server_context is not None:
            try:
                self.server_context.stop()
            except Exception:
                pass

        self.root.destroy()


def main() -> None:
    root = tk.Tk()
    app = RelicGuiApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()

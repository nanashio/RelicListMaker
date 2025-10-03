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

        project_root = _default_base_dir()
        default_videos = (project_root / "videos").resolve()
        default_results = (project_root / "results").resolve()
        self.video_dir_var = tk.StringVar(value=str(default_videos))
        self.results_dir_var = tk.StringVar(value=str(default_results))
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

        self._build_layout()
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)
        self.root.after(self.POLL_INTERVAL_MS, self._process_log_queue)

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

        log_frame = ttk.LabelFrame(main_frame, text="ログ", padding=12)
        log_frame.grid(row=2, column=0, sticky="nsew", pady=(12, 0))
        main_frame.rowconfigure(2, weight=1)

        self.log_text = tk.Text(log_frame, height=20, state="disabled", wrap="word")
        self.log_text.grid(row=0, column=0, sticky="nsew")
        log_scroll = ttk.Scrollbar(log_frame, orient="vertical", command=self.log_text.yview)
        log_scroll.grid(row=0, column=1, sticky="ns")
        self.log_text.configure(yscrollcommand=log_scroll.set)
        log_frame.columnconfigure(0, weight=1)
        log_frame.rowconfigure(0, weight=1)

    def _select_video_dir(self) -> None:
        selected = filedialog.askdirectory(title="動画フォルダを選択")
        if selected:
            self.video_dir_var.set(selected)

    def _select_results_dir(self) -> None:
        selected = filedialog.askdirectory(title="結果フォルダを選択")
        if selected:
            self.results_dir_var.set(selected)

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

        video_dir = self.video_dir_var.get()
        results_dir = self.results_dir_var.get()
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
                results_dir=self.results_dir_var.get(),
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

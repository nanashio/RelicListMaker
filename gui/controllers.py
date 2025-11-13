from __future__ import annotations

import traceback
from tkinter import messagebox

from .adapters import redirect_streams
from .services import GuiState
from merge_results import MergeResultsError


class PipelineController:
    """パイプライン実行とログ解析を担うコントローラ."""

    def __init__(self, app: "RelicGuiApp") -> None:
        self.app = app
        self._progress_token: int | None = None
        self._last_pipeline_error: str | None = None
        self._pipeline_error_messages: list[str] = []

    def run(self) -> None:
        if self.app.background_tasks.is_running("pipeline"):
            messagebox.showinfo("処理中", "現在、動画処理が実行中です。完了をお待ちください。")
            return

        try:
            update_app_state_from_form(self.app)
        except ValueError as exc:
            self._handle_form_error(exc)
            return

        if not self.app.state.queue_entries:
            messagebox.showinfo("動画未選択", "先に動画をドラッグ＆ドロップしてください。")
            return

        state_snapshot = snapshot_state(self.app)
        video_dir = str(state_snapshot.video_dir)
        results_dir = str(state_snapshot.results_dir)

        self.app.ui.run_button.configure(state="disabled")
        self.app.append_log(
            f"[GUI] 動画処理を開始します: {video_dir} -> {results_dir} ({len(state_snapshot.queue_entries)} 件)"
        )
        self._last_pipeline_error = None
        self._pipeline_error_messages.clear()
        token = self.app.start_progress("動画処理を準備中...")
        self._progress_token = token

        def progress_callback(current: int, total: int, message: str) -> None:
            self.app.root.after(
                0,
                lambda c=current, t=total, msg=message: self.app.update_progress(
                    token,
                    value=c,
                    total=t,
                    message=msg,
                ),
            )

        def worker() -> None:
            try:
                with redirect_streams(self.app.log_queue):
                    self.app.executor.execute_pipeline(
                        state_snapshot, progress_callback=progress_callback
                    )
                self.app.append_log("[GUI] 動画処理が完了しました")
            except Exception as exc:  # noqa: BLE001 - GUIログに表示するため広く捕捉
                error_detail = str(exc)
                self._last_pipeline_error = self._format_error_message(error_detail)
                error_message = f"OCR処理に失敗しました: {error_detail}"
                self.app.append_log("[ERROR] 動画処理中にエラーが発生しました")
                self.app.append_log(traceback.format_exc())
                self.app.root.after(
                    0,
                    lambda: messagebox.showerror("処理失敗", error_message),
                )
            finally:
                self.app.background_tasks.mark_finished("pipeline")
                self.app.root.after(0, self.on_finished)

        try:
            self.app.background_tasks.start("pipeline", worker)
        except RuntimeError:
            self.app.ui.run_button.configure(state="normal")
            messagebox.showinfo("処理中", "現在、動画処理が実行中です。完了をお待ちください。")

    def on_finished(self) -> None:
        self.app.ui.run_button.configure(state="normal")
        if self._progress_token is not None:
            final_message = self._last_pipeline_error or "ドラッグ&ドロップで動画を追加してください"
            self.app.stop_progress(self._progress_token, final_message=final_message)
            self._progress_token = None
        self._last_pipeline_error = None
        self.app.handlers.reset_queue_after_pipeline()

    def handle_log_message(self, message: str) -> None:
        stripped = message.strip()
        if stripped.startswith("OCR error:"):
            self._register_pipeline_error(stripped[len("OCR error:") :])

    def _handle_form_error(self, exc: ValueError) -> None:
        if exc.args and exc.args[0] == "ocr":
            messagebox.showerror("入力エラー", "OCRアップサンプルは数値で指定してください。")
        else:
            messagebox.showerror("入力エラー", "設定値の解析に失敗しました。")

    def _register_pipeline_error(self, detail: str) -> None:
        message = detail.strip() or "原因不明のエラーが発生しました"
        if message not in self._pipeline_error_messages:
            self._pipeline_error_messages.append(message)
        combined = " / ".join(self._pipeline_error_messages)
        self._last_pipeline_error = self._format_error_message(combined)

    def _format_error_message(self, detail: str) -> str:
        normalized = " ".join(detail.split())
        if not normalized:
            return "OCR処理に失敗しました"
        if len(normalized) > self.app.ERROR_DISPLAY_MAX_CHARS:
            normalized = normalized[: self.app.ERROR_DISPLAY_MAX_CHARS - 1] + "…"
        return f"OCR処理に失敗しました: {normalized}"


class MergeController:
    """結果統合処理を制御するコントローラ."""

    def __init__(self, app: "RelicGuiApp") -> None:
        self.app = app
        self._progress_token: int | None = None

    def start(self) -> None:
        if self.app.background_tasks.is_running("merge"):
            messagebox.showinfo("統合処理中", "現在、統合処理が実行中です。完了をお待ちください。")
            return

        try:
            update_app_state_from_form(self.app)
        except ValueError:
            messagebox.showerror("入力エラー", "設定値の解析に失敗しました。")
            return

        state_snapshot = snapshot_state(self.app)
        self.app.ui.merge_button.configure(state="disabled")
        results_dir = str(state_snapshot.results_dir)
        self.app.append_log(f"[GUI] 統合処理を開始します: {results_dir}")
        self._progress_token = self.app.start_progress("統合処理を準備中...")

        def worker() -> None:
            try:
                merged_path = self.app.executor.merge_results(state_snapshot)
                self.app.append_log(f"[GUI] 統合処理が完了しました: {merged_path}")
            except MergeResultsError as err:
                self.app.append_log("[ERROR] 統合処理に失敗しました")
                self.app.append_log(str(err))
                self.app.root.after(
                    0,
                    lambda: messagebox.showerror(
                        "統合処理失敗", f"統合処理に失敗しました: {err}"
                    ),
                )
            except Exception as exc:  # noqa: BLE001 - 予期しない例外もログへ残す
                self.app.append_log("[ERROR] 統合処理中に予期しないエラーが発生しました")
                self.app.append_log(traceback.format_exc())
                self.app.root.after(
                    0,
                    lambda: messagebox.showerror(
                        "統合処理失敗", f"統合処理でエラーが発生しました: {exc}"
                    ),
                )
            finally:
                self.app.background_tasks.mark_finished("merge")
                self.app.root.after(0, self.on_finished)

        try:
            self.app.background_tasks.start("merge", worker)
        except RuntimeError:
            self.app.ui.merge_button.configure(state="normal")
            messagebox.showinfo("統合処理中", "現在、統合処理が実行中です。完了をお待ちください。")

    def on_finished(self) -> None:
        self.app.ui.merge_button.configure(state="normal")
        if self._progress_token is not None:
            self.app.stop_progress(self._progress_token)
            self._progress_token = None
        self.app.handlers.schedule_results_refresh()


class ServerController:
    """ビューワサーバーの起動・停止を管理するコントローラ."""

    def __init__(self, app: "RelicGuiApp") -> None:
        self.app = app

    def start(self) -> None:
        if self.app.server_context is not None:
            self._open_viewer(self.app.server_context, force=True)
            return

        try:
            update_app_state_from_form(self.app, include_port=True)
        except ValueError as exc:
            if exc.args and exc.args[0] == "port":
                messagebox.showerror("入力エラー", "ポート番号は整数で指定してください。")
            else:
                messagebox.showerror("入力エラー", "設定値の解析に失敗しました。")
            return

        state_snapshot = snapshot_state(self.app)

        try:
            context = self.app.executor.start_server(state_snapshot)
        except Exception as exc:  # noqa: BLE001 - 詳細をGUIに表示するため
            self.app.append_log("[ERROR] サーバーの起動に失敗しました")
            self.app.append_log(traceback.format_exc())
            messagebox.showerror("サーバー起動エラー", f"サーバー起動に失敗しました: {exc}")
            return

        server_thread = context.start_in_thread()
        self.app.server_context = context
        self.app.server_thread = server_thread
        self.app.ui.server_start_button.configure(state="disabled")

        url = f"http://{context.host}:{context.port}/"
        self.app.ui.server_start_button.configure(state="normal")
        self.app.ui.server_start_button.configure(text="ビューワを再度開く")
        self.app.append_log(f"[GUI] ビューワサーバーを起動しました: {url}")
        self.app.append_log(f"[GUI] ビューワルート: {context.results_dir}")
        self._open_viewer(context)

    def stop(self) -> None:
        if self.app.server_context is None:
            return

        self.app.append_log("[GUI] ビューワサーバーを停止します")
        try:
            self.app.server_context.stop()
            if self.app.server_thread and self.app.server_thread.is_alive():
                self.app.server_thread.join(timeout=1)
        except Exception as exc:  # noqa: BLE001 - 停止処理の警告を残す
            self.app.append_log(f"[ERROR] サーバー停止中に問題が発生しました: {exc}")
        finally:
            self.app.server_context = None
            self.app.server_thread = None
            self.app.ui.server_start_button.configure(text="ビューワを開く")
            self.app.ui.server_start_button.configure(state="normal")

    def _open_viewer(self, context, *, force: bool = False) -> None:
        if not force and not self.app.open_browser_var.get():
            return
        target = context.initial_viewer if context.initial_viewer else None
        fallback = context.results_dir / "viewer.html"
        if target is None or not target.exists():
            target = fallback if fallback.exists() else None
        try:
            self.app.open_browser(context.results_dir, target, context.host, context.port)
        except Exception as exc:  # noqa: BLE001
            self.app.append_log(f"[ERROR] ビューワをブラウザで開けませんでした: {exc}")
            self.app.root.after(
                0,
                lambda: messagebox.showerror(
                    "ビューワを開けません", f"ブラウザでビューワを開けませんでした: {exc}"
                ),
            )


def update_app_state_from_form(app: "RelicGuiApp", *, include_port: bool = False) -> None:
    """GUI上の入力値から :class:`GuiState` を更新する."""

    app.state.video_dir = app.handlers.resolve_input_path(app.video_dir_var.get())
    app.state.results_dir = app.handlers.resolve_input_path(app.results_dir_var.get())
    app.state.save_full_frames = app.save_frames_var.get()
    app.state.column_visibility = {
        key: var.get() for key, var in app.csv_column_vars.items()
    }
    app.state.merge_only_reviewed = app.merge_only_reviewed_var.get()
    app.state.server_host = app.server_host_var.get().strip() or "127.0.0.1"
    engine_value = (app.ocr_engine_var.get() or "").strip().lower() or app.state.ocr_engine
    if engine_value not in {"tesseract", "vision"}:
        engine_value = app.state.ocr_engine
    app.state.ocr_engine = engine_value
    filename_value = app.gcp_credentials_filename_var.get().strip()
    app.state.gcp_credentials_filename = filename_value or None
    try:
        app.state.ocr_upsample = float(app.ocr_upsample_var.get())
    except ValueError as exc:
        raise ValueError("ocr") from exc

    if include_port:
        port_text = app.server_port_var.get().strip()
        if port_text:
            try:
                app.state.server_port = int(port_text)
            except ValueError as exc:
                raise ValueError("port") from exc
        else:
            app.state.server_port = 0


def snapshot_state(app: "RelicGuiApp") -> GuiState:
    """現在の :class:`GuiState` を独立したコピーとして返す."""

    return GuiState(
        base_dir=app.state.base_dir,
        video_dir=app.state.video_dir,
        results_dir=app.state.results_dir,
        queue_entries=[dict(entry) for entry in app.state.queue_entries],
        ocr_upsample=app.state.ocr_upsample,
        ocr_engine=app.state.ocr_engine,
        gcp_credentials=app.state.gcp_credentials,
        gcp_credentials_filename=app.state.gcp_credentials_filename,
        save_full_frames=app.state.save_full_frames,
        column_visibility=dict(app.state.column_visibility),
        merge_only_reviewed=app.state.merge_only_reviewed,
        server_host=app.state.server_host,
        server_port=app.state.server_port,
    )

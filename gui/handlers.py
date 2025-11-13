from __future__ import annotations

import csv
import queue
import shutil
import types
import webbrowser
from datetime import datetime
from pathlib import Path
from typing import Optional, Sequence

import tkinter as tk
from tkinter import filedialog, messagebox

from gui_adapters import (
    DND_FILES,
    HAS_TKDND,
    get_windows_drop_support,
)
from pipeline import detect_item_color, detect_relic_type, normalize_relic_type

from .widgets import InlineCombo


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
        status = str(row.get(key, "")).strip().lower()
        if status not in {"pass", "corrected"}:
            return False
    return has_slots


def summarize_review_state(csv_path: Path) -> str:
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
    except Exception:
        return "未レビュー含む"
    return "全レビュー済" if any_effect_rows else "未レビュー含む"


class AppEventHandlers:
    """GUI上のイベント処理をまとめた調停クラス."""

    def __init__(self, app: "RelicGuiApp") -> None:
        self.app = app
        self.pipeline_controller: "PipelineController" | None = None
        self.merge_controller: "MergeController" | None = None
        self.server_controller: "ServerController" | None = None
        self._dnd_enabled = False
        self._tkdnd_ready = False
        self._dropped_video_set: set[str] = set()
        self._queue_item_paths: dict[str, str] = {}
        self._results_entries: list[dict[str, object]] = []
        self._results_refresh_pending = False
        self.inline_color_editor: InlineCombo | None = None
        self.inline_type_editor: InlineCombo | None = None
        self._inline_last_item: str | None = None
        self._inline_type_last_item: str | None = None
        self.color_options = ["none", "red", "green", "blue", "yellow"]
        self.relic_type_options = ["通常", "深層遺物"]
        self._relic_type_value_map = {"通常": "normal", "深層遺物": "deep"}
        self._relic_type_display_map = {
            value: label for label, value in self._relic_type_value_map.items()
        }

    # --- Controller wiring -------------------------------------------------

    def attach_controllers(
        self,
        *,
        pipeline: "PipelineController",
        merge: "MergeController",
        server: "ServerController",
    ) -> None:
        self.pipeline_controller = pipeline
        self.merge_controller = merge
        self.server_controller = server

    def attach_inline_editors(
        self,
        color_editor: InlineCombo,
        type_editor: InlineCombo,
    ) -> None:
        self.inline_color_editor = color_editor
        self.inline_type_editor = type_editor

    # --- Menu / simple handlers -------------------------------------------

    def show_about_dialog(self) -> None:
        message = f"RelicListMaker\nバージョン: {self.app.app_version}\n{self.app.github_url}"
        messagebox.showinfo("このアプリについて", message)

    def open_project_site(self) -> None:
        try:
            opened = webbrowser.open(self.app.github_url, new=0, autoraise=True)
        except Exception as exc:  # noqa: BLE001 - GUIで通知
            messagebox.showerror("ブラウザ起動エラー", f"GitHub ページを開けませんでした: {exc}")
            return
        if not opened:
            messagebox.showerror(
                "ブラウザ起動エラー",
                "GitHub ページを開けませんでした。既定のブラウザ設定を確認してください。",
            )

    # --- Button delegates --------------------------------------------------

    def run_pipeline(self) -> None:
        if self.pipeline_controller is None:
            return
        self.pipeline_controller.run()

    def start_merge(self) -> None:
        if self.merge_controller is None:
            return
        self.merge_controller.start()

    def start_server(self) -> None:
        if self.server_controller is None:
            return
        self.server_controller.start()

    def stop_server(self) -> None:
        if self.server_controller is None:
            return
        self.server_controller.stop()

    def open_settings_dialog(self) -> None:
        self.app.layout_manager.open_settings_dialog()

    def close_settings_dialog(self) -> None:
        self.app.layout_manager.close_settings_dialog()

    def select_video_dir(self) -> None:
        selected = filedialog.askdirectory(title="動画フォルダを選択")
        if selected:
            self.app.video_dir_var.set(self.to_user_value(Path(selected)))

    def select_results_dir(self) -> None:
        selected = filedialog.askdirectory(title="結果フォルダを選択")
        if selected:
            self.app.results_dir_var.set(self.to_user_value(Path(selected)))

    def refresh_results(self) -> None:
        self.refresh_results_list(log=True)

    # --- Drag & drop ------------------------------------------------------

    def init_drag_and_drop(self, widgets: Sequence[tk.Misc]) -> None:
        self._dnd_enabled = False
        for widget in widgets:
            if not self._attach_tkdnd(widget):
                continue
            try:
                widget.drop_target_register(DND_FILES)
                widget.dnd_bind("<<Drop>>", self.handle_file_drop)
                self._dnd_enabled = True
            except Exception as exc:  # noqa: BLE001 - 環境依存
                self.app.append_log(
                    f"[WARN] ドラッグ＆ドロップの初期化に失敗しました: {exc}"
                )
        if self._dnd_enabled:
            self.app.append_log(
                "[GUI] 動画ファイルをウィンドウへドラッグ＆ドロップできます"
            )
        else:
            self.app.append_log(
                "[WARN] この環境ではドラッグ＆ドロップを利用できません (tkinterdnd2 / tkdnd の導入をご検討ください)"
            )

    def _attach_tkdnd(self, widget: tk.Misc) -> bool:
        if not isinstance(widget, tk.Misc):
            return False
        if hasattr(widget, "drop_target_register"):
            return True
        if self._ensure_tkdnd_available():
            tk_app = widget.tk

            def drop_target_register(self_widget: tk.Misc, *dnd_types: str) -> None:
                types_tuple = dnd_types or (DND_FILES,)
                tk_app.call("tkdnd::drop_target", "register", self_widget._w, *types_tuple)

            def drop_target_unregister(self_widget: tk.Misc, *dnd_types: str) -> None:
                types_tuple = dnd_types or (DND_FILES,)
                tk_app.call("tkdnd::drop_target", "unregister", self_widget._w, *types_tuple)

            def dnd_bind(self_widget: tk.Misc, sequence: str, func, add: str = ""):
                return self_widget.bind(sequence, func, add=add)

            widget.drop_target_register = types.MethodType(drop_target_register, widget)
            widget.drop_target_unregister = types.MethodType(drop_target_unregister, widget)
            widget.dnd_bind = types.MethodType(dnd_bind, widget)
            return True
        if self._install_windows_drop(widget):
            return True
        return False

    def _ensure_tkdnd_available(self) -> bool:
        if self._tkdnd_ready:
            return True
        if not HAS_TKDND:
            return False
        try:
            self.app.root.tk.call("package", "require", "tkdnd")
        except tk.TclError:
            return False
        self._tkdnd_ready = True
        return True

    def _install_windows_drop(self, widget: tk.Misc) -> bool:
        support = get_windows_drop_support()
        if support is None:
            return False

        def drop_target_register(self_widget: tk.Misc, *dnd_types: str) -> None:
            support.register(
                self_widget,
                lambda paths, target=self_widget: self._on_windows_drop(target, paths),
            )

        def drop_target_unregister(self_widget: tk.Misc, *dnd_types: str) -> None:
            support.unregister(self_widget)

        def dnd_bind(self_widget: tk.Misc, sequence: str, func, add: str = ""):
            return self_widget.bind(sequence, func, add=add)

        widget.drop_target_register = types.MethodType(drop_target_register, widget)
        widget.drop_target_unregister = types.MethodType(drop_target_unregister, widget)
        widget.dnd_bind = types.MethodType(dnd_bind, widget)
        return True

    def _on_windows_drop(self, widget: tk.Misc, paths: list[str]) -> None:
        if not paths:
            return
        try:
            data = widget.tk.call("list", *paths)
        except Exception:
            data = " ".join(paths)
        event = types.SimpleNamespace(data=data)
        self.handle_file_drop(event)

    def handle_file_drop(self, event) -> None:
        data = getattr(event, "data", "")
        if not data:
            return
        try:
            dropped = [Path(path) for path in self.app.root.tk.splitlist(data)]
        except Exception:
            dropped = [Path(data)]
        if not dropped:
            return
        current_video_dir = self.resolve_input_path(self.app.video_dir_var.get())
        current_video_dir.mkdir(parents=True, exist_ok=True)

        video_sources: list[Path] = []
        skipped_files: list[str] = []
        skipped_dirs: list[str] = []

        for entry in dropped:
            if entry.is_dir():
                found = False
                for file_path in sorted(entry.rglob("*")):
                    if not file_path.is_file():
                        continue
                    if file_path.suffix.lower() not in self.app.video_extensions:
                        continue
                    video_sources.append(file_path)
                    found = True
                if not found:
                    skipped_dirs.append(entry.name)
                continue
            if entry.suffix.lower() not in self.app.video_extensions:
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
                self.record_dropped_video(destination)
                reused_files.append(destination.name)
                continue

            destination = self._resolve_unique_destination(destination)
            try:
                shutil.copy2(resolved_source, destination)
            except (OSError, shutil.Error) as exc:
                self.app.append_log(
                    f"[WARN] {resolved_source.name} のコピーに失敗しました: {exc}"
                )
                continue
            self.record_dropped_video(destination)
            added_files.append(destination.name)

        if reused_files:
            summary = ", ".join(reused_files)
            self.app.append_log(f"[GUI] 既存の動画をキューに追加しました: {summary}")
        if added_files:
            summary = ", ".join(added_files)
            self.app.append_log(
                f"[GUI] {len(added_files)} 件の動画を保存しました: {summary}"
            )
        if skipped_files:
            summary = ", ".join(skipped_files)
            self.app.append_log(
                f"[WARN] 対応外のファイルをスキップしました: {summary}"
            )
        if skipped_dirs:
            summary = ", ".join(skipped_dirs)
            self.app.append_log(
                f"[WARN] 対応する動画が見つからないフォルダをスキップしました: {summary}"
            )
        if self.app.state.queue_entries:
            self.app.append_log(
                f"[GUI] 現在の処理対象: {len(self.app.state.queue_entries)} 件"
            )
        self.refresh_queue_view()

    def _resolve_unique_destination(self, destination: Path) -> Path:
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

    def record_dropped_video(self, path: Path) -> None:
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
        self.app.state.queue_entries.append(
            {
                "path": resolved,
                "color": detected,
                "relic_type": normalize_relic_type(relic_type),
            }
        )

    # --- Queue tree -------------------------------------------------------

    def refresh_queue_view(self) -> None:
        tree = self.app.ui.queue_tree
        if tree is None:
            return
        self.hide_inline_color_editor()
        self.hide_inline_relic_type_editor()
        tree.delete(*tree.get_children())
        self._queue_item_paths.clear()
        for entry in self.app.state.queue_entries:
            path = entry.get("path", "")
            name = Path(path).name if path else ""
            color = entry.get("color", self.color_options[0]) or self.color_options[0]
            relic_value = normalize_relic_type(entry.get("relic_type"))
            display_type = self._relic_type_display_map.get(
                relic_value, self.relic_type_options[0]
            )
            item_id = tree.insert(
                "",
                "end",
                values=(name, color, display_type, path),
            )
            if path:
                self._queue_item_paths[item_id] = path
        self.update_queue_controls()

    def update_queue_controls(self) -> None:
        tree = self.app.ui.queue_tree
        if tree is None:
            return
        selected = tree.selection()
        if not selected:
            message = (
                "ドラッグ＆ドロップで動画を追加してください"
                if not self.app.state.queue_entries
                else "動画を選択してください"
            )
            self.app.queue_selection_var.set(message)
            return
        first_path = tree.set(selected[0], "fullpath")
        self.app.queue_selection_var.set(first_path)

    def on_queue_selection(self, _event=None) -> None:
        self.update_queue_controls()

    def on_queue_click(self, event) -> None:
        tree = self.app.ui.queue_tree
        if tree is None:
            return
        region = tree.identify("region", event.x, event.y)
        if region != "cell":
            self.hide_inline_color_editor()
            self.hide_inline_relic_type_editor()
            return
        column = tree.identify_column(event.x)
        item = tree.identify_row(event.y)
        if column == "#2" and item:
            self.hide_inline_relic_type_editor()
            self.app.root.after_idle(lambda: self.show_inline_color_editor(item))
        elif column == "#3" and item:
            self.hide_inline_color_editor()
            self.app.root.after_idle(lambda: self.show_inline_relic_type_editor(item))
        else:
            self.hide_inline_color_editor()
            self.hide_inline_relic_type_editor()

    def on_queue_scroll(self, _event=None) -> None:
        self.hide_inline_color_editor()
        self.hide_inline_relic_type_editor()

    # --- Inline editors ---------------------------------------------------

    def show_inline_color_editor(self, item: str) -> None:
        tree = self.app.ui.queue_tree
        editor = self.inline_color_editor
        if tree is None or editor is None:
            return
        bbox = tree.bbox(item, "#2")
        if not bbox:
            return
        current = tree.set(item, "color") or self.color_options[0]
        if current not in self.color_options:
            current = self.color_options[0]
        editor.configure_values(self.color_options)
        editor.show(item, bbox, current)
        self._inline_last_item = item

    def show_inline_relic_type_editor(self, item: str) -> None:
        tree = self.app.ui.queue_tree
        editor = self.inline_type_editor
        if tree is None or editor is None:
            return
        bbox = tree.bbox(item, "#3")
        if not bbox:
            return
        current = tree.set(item, "relic_type") or self.relic_type_options[0]
        editor.configure_values(self.relic_type_options)
        editor.show(item, bbox, current)
        self._inline_type_last_item = item

    def hide_inline_color_editor(self) -> None:
        editor = self.inline_color_editor
        if editor is None:
            return
        editor.cancel_hide()
        editor.hide()

    def hide_inline_relic_type_editor(self) -> None:
        editor = self.inline_type_editor
        if editor is None:
            return
        editor.cancel_hide()
        editor.hide()

    def on_color_selected(self, item: str, value: str) -> None:
        if value not in self.color_options:
            value = self.color_options[0]
        self.update_video_color(item, value)
        tree = self.app.ui.queue_tree
        if tree is not None and tree.exists(item):
            tree.set(item, "color", value)
        self.hide_inline_color_editor()
        self.update_queue_controls()

    def on_color_focus_out(self, item: str) -> None:
        editor = self.inline_color_editor
        if editor is None:
            return
        editor.schedule_hide()

    def cancel_color_editor(self) -> None:
        self.hide_inline_color_editor()

    def on_relic_type_selected(self, item: str, label: str) -> None:
        value = self._relic_type_value_map.get(label, label)
        normalized = normalize_relic_type(value)
        display_label = self._relic_type_display_map.get(normalized, self.relic_type_options[0])
        self.update_video_relic_type(item, normalized)
        tree = self.app.ui.queue_tree
        if tree is not None and tree.exists(item):
            tree.set(item, "relic_type", display_label)
        self.hide_inline_relic_type_editor()
        self.update_queue_controls()

    def on_relic_type_focus_out(self, item: str) -> None:
        editor = self.inline_type_editor
        if editor is None:
            return
        editor.schedule_hide()

    def cancel_relic_type_editor(self) -> None:
        self.hide_inline_relic_type_editor()

    # --- Queue manipulation -----------------------------------------------

    def remove_selected_videos(self) -> None:
        tree = self.app.ui.queue_tree
        if tree is None:
            return
        self.hide_inline_color_editor()
        self.hide_inline_relic_type_editor()
        selected = tree.selection()
        if not selected:
            return
        remove_paths = {tree.set(item, "fullpath") for item in selected}
        if remove_paths:
            self.app.state.queue_entries = [
                entry
                for entry in self.app.state.queue_entries
                if entry.get("path") not in remove_paths
            ]
            for path_value in remove_paths:
                self._dropped_video_set.discard(path_value)
            removed_names = [Path(path_value).name for path_value in remove_paths]
            if removed_names:
                summary = ", ".join(removed_names)
                self.app.append_log(
                    f"[GUI] {len(removed_names)} 件の動画をキューから削除しました: {summary}"
                )
        self.refresh_queue_view()

    def update_video_color(self, item_id: str, color: str) -> None:
        tree = self.app.ui.queue_tree
        if tree is None:
            return
        resolved_path = self._queue_item_paths.get(item_id, "")
        if not resolved_path and item_id and tree.exists(item_id):
            resolved_path = tree.set(item_id, "fullpath")
            if resolved_path:
                self._queue_item_paths[item_id] = resolved_path
        if not resolved_path:
            resolved_path = item_id
        for entry in self.app.state.queue_entries:
            if entry.get("path") == resolved_path:
                entry["color"] = color
                break

    def update_video_relic_type(self, item_id: str, relic_type: str) -> None:
        tree = self.app.ui.queue_tree
        if tree is None:
            return
        resolved_path = self._queue_item_paths.get(item_id, "")
        if not resolved_path and item_id and tree.exists(item_id):
            resolved_path = tree.set(item_id, "fullpath")
            if resolved_path:
                self._queue_item_paths[item_id] = resolved_path
        if not resolved_path:
            resolved_path = item_id
        normalized = normalize_relic_type(relic_type)
        for entry in self.app.state.queue_entries:
            if entry.get("path") == resolved_path:
                entry["relic_type"] = normalized
                break

    def reset_queue_after_pipeline(self) -> None:
        if self.app.state.queue_entries:
            self.app.append_log("[GUI] キューをクリアしました")
        self.app.state.queue_entries.clear()
        self._dropped_video_set.clear()
        self.refresh_queue_view()
        self.schedule_results_refresh()

    # --- Results tree -----------------------------------------------------

    def schedule_results_refresh(self) -> None:
        if self._results_refresh_pending:
            return
        self._results_refresh_pending = True
        self.app.root.after(200, self.refresh_results_list)

    def refresh_results_list(self, log: bool = False) -> None:
        self._results_refresh_pending = False
        tree = self.app.ui.results_tree
        if tree is None:
            return
        results_dir = self.resolve_input_path(self.app.results_dir_var.get())
        results_path_text = str(results_dir)
        if not results_dir.exists():
            tree.delete(*tree.get_children())
            self._results_entries = []
            message = f"結果フォルダが見つかりません: {results_path_text}"
            self.app.results_status_var.set(message)
            if log:
                self.app.append_log(f"[WARN] {message}")
            return
        try:
            entries = self._collect_results_entries(results_dir)
        except Exception as exc:  # noqa: BLE001 - GUIにエラー表示
            tree.delete(*tree.get_children())
            self._results_entries = []
            message = f"結果フォルダの読み込みに失敗しました: {exc}"
            self.app.results_status_var.set("結果フォルダの読み込みに失敗しました")
            self.app.append_log(f"[ERROR] {message}")
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
            reviewed_count = sum(
                1 for entry in entries if entry.get("status") == "全レビュー済"
            )
            message = f"{len(entries)} 件 (全レビュー済 {reviewed_count} 件)"
        self.app.results_status_var.set(message)
        if log:
            self.app.append_log(
                f"[GUI] 結果フォルダを読み込みました: {results_path_text} ({len(entries)} 件)"
            )

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
                modified = (
                    datetime.fromtimestamp(csv_path.stat().st_mtime)
                    if csv_path
                    else None
                )
            except OSError:
                modified = None
            status_text = summarize_review_state(csv_path) if csv_path else "未レビュー含む"
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

    def update_log_visibility(self) -> None:
        log_frame = self.app.ui.log_frame
        if log_frame is None:
            return
        if self.app.log_visible_var.get():
            log_frame.grid()
        else:
            log_frame.grid_remove()

    # --- Helpers ----------------------------------------------------------

    def resolve_input_path(self, value: str) -> Path:
        raw = Path(value.strip()) if value else Path()
        if raw.is_absolute():
            return raw.resolve()
        return (self.app.base_dir / raw).resolve()

    def to_user_value(self, path: Path) -> str:
        resolved = path.resolve()
        try:
            return str(resolved.relative_to(self.app.base_dir))
        except ValueError:
            return str(resolved)

    def process_log_queue(self) -> None:
        try:
            while True:
                message = self.app.log_queue.get_nowait()
                if self.pipeline_controller is not None:
                    self.pipeline_controller.handle_log_message(message)
                self.app.ui.log_text.configure(state="normal")
                self.app.ui.log_text.insert("end", message)
                self.app.ui.log_text.see("end")
                self.app.ui.log_text.configure(state="disabled")
        except queue.Empty:
            pass
        finally:
            self.app.root.after(self.app.POLL_INTERVAL_MS, self.process_log_queue)


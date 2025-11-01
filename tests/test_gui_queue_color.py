"""GUIの動画キューにおける色選択の挙動を検証するテスト."""
from __future__ import annotations

import tkinter as tk

import pytest

from gui_app import RelicGuiApp


def test_inline_color_selection_updates_queue_entry_color() -> None:
    """Windows風パスを含む行でも色が更新されるべきことを検証する."""
    try:
        root = tk.Tk()
    except tk.TclError as exc:  # pragma: no cover - 実行環境依存
        pytest.skip(f"Tkが利用できません: {exc}")

    root.withdraw()
    app = RelicGuiApp(root)

    try:
        sample_path = r"C:\\temp\\video.mp4"
        app._dropped_videos = [{"path": sample_path, "color": "none"}]
        app._dropped_video_set = {sample_path}
        app._refresh_queue_view()
        root.update_idletasks()

        queue_tree = app.queue_tree
        inline_combo = app.inline_color_combo
        assert queue_tree is not None
        assert inline_combo is not None

        item_id = queue_tree.get_children()[0]
        assert app._queue_item_paths[item_id] == sample_path
        app._show_inline_color_editor(item_id)
        root.update_idletasks()

        inline_combo.set("red")
        app._on_inline_color_selected()

        assert app._dropped_videos[0]["color"] == "red"
    finally:
        root.destroy()


def test_inline_color_update_survives_focus_out() -> None:
    """コンボボックスのフォーカス喪失が発生しても色変更が適用される."""
    try:
        root = tk.Tk()
    except tk.TclError as exc:  # pragma: no cover - 実行環境依存
        pytest.skip(f"Tkが利用できません: {exc}")

    root.withdraw()
    app = RelicGuiApp(root)

    try:
        sample_path = "/tmp/sample.mp4"
        app._dropped_videos = [{"path": sample_path, "color": "none"}]
        app._dropped_video_set = {sample_path}
        app._refresh_queue_view()
        root.update_idletasks()

        queue_tree = app.queue_tree
        inline_combo = app.inline_color_combo
        assert queue_tree is not None
        assert inline_combo is not None

        item_id = queue_tree.get_children()[0]
        app._show_inline_color_editor(item_id)
        root.update_idletasks()

        # フォーカス喪失が先に発生しても選択イベントで更新される想定
        app._on_inline_color_focus_out()
        inline_combo.set("green")
        app._on_inline_color_selected()

        assert app._dropped_videos[0]["color"] == "green"
    finally:
        root.destroy()


def test_inline_color_selection_after_editor_hidden() -> None:
    """エディタが閉じた後に選択イベントが発生しても色が更新される."""
    try:
        root = tk.Tk()
    except tk.TclError as exc:  # pragma: no cover - 実行環境依存
        pytest.skip(f"Tkが利用できません: {exc}")

    root.withdraw()
    app = RelicGuiApp(root)

    try:
        sample_path = "/tmp/sample2.mp4"
        app._dropped_videos = [{"path": sample_path, "color": "none"}]
        app._dropped_video_set = {sample_path}
        app._refresh_queue_view()
        root.update_idletasks()

        queue_tree = app.queue_tree
        inline_combo = app.inline_color_combo
        assert queue_tree is not None
        assert inline_combo is not None

        item_id = queue_tree.get_children()[0]
        app._show_inline_color_editor(item_id)
        root.update_idletasks()

        # エディタが自動的に閉じたケースを模倣
        app._hide_inline_color_editor()
        inline_combo.set("blue")
        app._on_inline_color_selected()

        assert app._dropped_videos[0]["color"] == "blue"
    finally:
        root.destroy()


def test_inline_relic_type_selection_updates_entry() -> None:
    """遺物タイプ列の変更が内部データへ反映される."""
    try:
        root = tk.Tk()
    except tk.TclError as exc:  # pragma: no cover - 実行環境依存
        pytest.skip(f"Tkが利用できません: {exc}")

    root.withdraw()
    app = RelicGuiApp(root)

    try:
        sample_path = "/tmp/deep_run.mp4"
        app._dropped_videos = [
            {"path": sample_path, "color": "none", "relic_type": "normal"}
        ]
        app._dropped_video_set = {sample_path}
        app._refresh_queue_view()
        root.update_idletasks()

        queue_tree = app.queue_tree
        inline_type = app.inline_type_combo
        assert queue_tree is not None
        assert inline_type is not None

        item_id = queue_tree.get_children()[0]
        app._show_inline_relic_type_editor(item_id)
        root.update_idletasks()

        inline_type.set("深層遺物")
        app._on_inline_type_selected()

        assert app._dropped_videos[0]["relic_type"] == "deep"
    finally:
        root.destroy()

"""GUIの動画キューにおける色選択の挙動を検証するテスト."""
from __future__ import annotations

import tkinter as tk

import pytest

from gui.app import RelicGuiApp


def test_inline_color_selection_updates_queue_entry_color() -> None:
    """Windows風パスを含む行でも色が更新されるべきことを検証する."""
    try:
        root = tk.Tk()
    except tk.TclError as exc:  # pragma: no cover - 実行環境依存
        pytest.skip(f"Tkが利用できません: {exc}")

    root.update()
    app = RelicGuiApp(root)

    try:
        sample_path = r"C:\\temp\\video.mp4"
        app.handlers.set_queue_entries([{"path": sample_path, "color": "none"}])
        root.update()

        queue_tree = app.ui.queue_tree
        inline_combo = app.handlers.inline_color_editor.widget
        assert queue_tree is not None
        assert inline_combo is not None

        item_id = queue_tree.get_children()[0]
        assert queue_tree.set(item_id, "fullpath") == sample_path
        app.handlers.show_inline_color_editor(item_id)
        root.update()

        inline_combo.set("red")
        inline_combo.event_generate("<<ComboboxSelected>>")
        root.update()

        assert app.state.queue_entries[0]["color"] == "red"
    finally:
        root.destroy()


def test_inline_color_update_survives_focus_out() -> None:
    """コンボボックスのフォーカス喪失が発生しても色変更が適用される."""
    try:
        root = tk.Tk()
    except tk.TclError as exc:  # pragma: no cover - 実行環境依存
        pytest.skip(f"Tkが利用できません: {exc}")

    root.update()
    app = RelicGuiApp(root)

    try:
        sample_path = "/tmp/sample.mp4"
        app.handlers.set_queue_entries([{"path": sample_path, "color": "none"}])
        root.update()

        queue_tree = app.ui.queue_tree
        inline_combo = app.handlers.inline_color_editor.widget
        assert queue_tree is not None
        assert inline_combo is not None

        item_id = queue_tree.get_children()[0]
        app.handlers.show_inline_color_editor(item_id)
        root.update_idletasks()

        # フォーカス喪失が先に発生しても選択イベントで更新される想定
        inline_combo.event_generate("<FocusOut>")
        inline_combo.set("green")
        inline_combo.event_generate("<<ComboboxSelected>>")
        root.update()

        assert app.state.queue_entries[0]["color"] == "green"
    finally:
        root.destroy()


def test_inline_color_selection_after_editor_hidden() -> None:
    """エディタが閉じた後に選択イベントが発生しても色が更新される."""
    try:
        root = tk.Tk()
    except tk.TclError as exc:  # pragma: no cover - 実行環境依存
        pytest.skip(f"Tkが利用できません: {exc}")

    root.update()
    app = RelicGuiApp(root)

    try:
        sample_path = "/tmp/sample2.mp4"
        app.handlers.set_queue_entries([{"path": sample_path, "color": "none"}])
        root.update_idletasks()

        queue_tree = app.ui.queue_tree
        inline_combo = app.handlers.inline_color_editor.widget
        assert queue_tree is not None
        assert inline_combo is not None

        item_id = queue_tree.get_children()[0]
        app.handlers.show_inline_color_editor(item_id)
        root.update_idletasks()

        # エディタが自動的に閉じたケースを模倣
        app.handlers.hide_inline_color_editor()
        inline_combo.set("blue")
        inline_combo.event_generate("<<ComboboxSelected>>")
        root.update()

        assert app.state.queue_entries[0]["color"] == "blue"
    finally:
        root.destroy()


def test_inline_relic_type_selection_updates_entry() -> None:
    """遺物タイプ列の変更が内部データへ反映される."""
    try:
        root = tk.Tk()
    except tk.TclError as exc:  # pragma: no cover - 実行環境依存
        pytest.skip(f"Tkが利用できません: {exc}")

    root.update()
    app = RelicGuiApp(root)

    try:
        sample_path = "/tmp/deep_run.mp4"
        app.handlers.set_queue_entries(
            [{"path": sample_path, "color": "none", "relic_type": "normal"}]
        )
        root.update_idletasks()

        queue_tree = app.ui.queue_tree
        inline_type = app.handlers.inline_type_editor.widget
        assert queue_tree is not None
        assert inline_type is not None

        item_id = queue_tree.get_children()[0]
        app.handlers.show_inline_relic_type_editor(item_id)
        root.update_idletasks()

        inline_type.set("深層遺物")
        inline_type.event_generate("<<ComboboxSelected>>")
        root.update()

        assert app.state.queue_entries[0]["relic_type"] == "deep"
    finally:
        root.destroy()

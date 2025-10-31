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
        app._show_inline_color_editor(item_id)
        root.update_idletasks()

        inline_combo.set("red")
        app._on_inline_color_selected()

        assert app._dropped_videos[0]["color"] == "red"
    finally:
        root.destroy()

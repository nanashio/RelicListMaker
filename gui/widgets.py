from __future__ import annotations

import tkinter as tk
from tkinter import ttk
from typing import Callable, Iterable, Sequence


class InlineCombo:
    """Treeviewのセル上に表示する簡易インラインコンボボックス."""

    def __init__(
        self,
        root: tk.Misc,
        tree: ttk.Treeview,
        *,
        values: Sequence[str],
        width: int,
        on_selected: Callable[[str, str], None],
        on_focus_out: Callable[[str], None],
        on_cancel: Callable[[], None],
    ) -> None:
        self._root = root
        self._tree = tree
        self._on_selected = on_selected
        self._on_focus_out = on_focus_out
        self._on_cancel = on_cancel
        self._combo = ttk.Combobox(tree, state="readonly", values=list(values), width=width)
        self._combo.bind("<<ComboboxSelected>>", self._handle_selected)
        self._combo.bind("<FocusOut>", self._handle_focus_out)
        self._combo.bind("<Escape>", self._handle_escape)
        self._combo.place_forget()
        self._item: str | None = None
        self._last_item: str | None = None
        self._hide_after: str | None = None

    @property
    def widget(self) -> ttk.Combobox:
        return self._combo

    @property
    def item(self) -> str | None:
        return self._item

    def configure_values(self, values: Iterable[str]) -> None:
        self._combo.configure(values=list(values))

    def show(self, item: str, bbox: tuple[int, int, int, int], value: str) -> None:
        self.cancel_hide()
        self._item = item
        self._last_item = item
        self._combo.set(value)
        x, y, width, height = bbox
        self._combo.place(x=x, y=y, width=width, height=height)
        self._combo.focus_set()

    def hide(self) -> None:
        self._item = None
        self._combo.place_forget()

    def schedule_hide(self, delay_ms: int = 150) -> None:
        self.cancel_hide()
        self._hide_after = self._root.after(delay_ms, self.hide)

    def cancel_hide(self) -> None:
        if self._hide_after is not None:
            try:
                self._root.after_cancel(self._hide_after)
            finally:
                self._hide_after = None

    def _handle_selected(self, _event: tk.Event[tk.Misc]) -> None:
        target = self._item or self._last_item
        if not target:
            return
        value = self._combo.get()
        self._on_selected(target, value)

    def _handle_focus_out(self, _event: tk.Event[tk.Misc]) -> None:
        if not self._item:
            self.hide()
            return
        self._on_focus_out(self._item)

    def _handle_escape(self, _event: tk.Event[tk.Misc]) -> None:
        self._on_cancel()
        self.hide()


def place_menu_buttonbar(
    parent: tk.Widget,
    *,
    exit_command: Callable[[], None],
    settings_command: Callable[[], None],
    help_command: Callable[[], None],
    about_command: Callable[[], None],
    project_url: str,
    version_text: str,
) -> ttk.Frame:
    """メニューバーが利用できない環境向けの代替ボタン列を生成する."""

    frame = ttk.Frame(parent, padding=4)
    for column in range(3):
        frame.columnconfigure(column, weight=1)

    file_button = ttk.Menubutton(frame, text="ファイル")
    file_menu = tk.Menu(file_button, tearoff=False)
    file_menu.add_command(label="終了", command=exit_command)
    file_button["menu"] = file_menu
    file_button.grid(row=0, column=0, padx=4)

    ttk.Button(frame, text="設定...", command=settings_command).grid(row=0, column=1, padx=4)

    help_button = ttk.Menubutton(frame, text="ヘルプ")
    help_menu = tk.Menu(help_button, tearoff=False)
    help_menu.add_command(label=f"バージョン: {version_text}", state="disabled")
    help_menu.add_command(label=project_url, command=help_command)
    help_menu.add_separator()
    help_menu.add_command(label="このアプリについて", command=about_command)
    help_button["menu"] = help_menu
    help_button.grid(row=0, column=2, padx=4)

    ttk.Label(
        frame,
        text="メニューバーが表示されない場合はこちらをご利用ください",
        foreground="gray",
    ).grid(row=1, column=0, columnspan=3, sticky="w", pady=(6, 0))

    return frame

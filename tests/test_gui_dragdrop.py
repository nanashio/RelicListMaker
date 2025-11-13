"""ドラッグ＆ドロップの初期化経路を検証するテスト."""
from __future__ import annotations

import types

import gui.app as gui_app


def test_main_prefers_tkinterdnd_when_available(monkeypatch) -> None:
    """TkinterDnDが存在する場合は専用のTkクラスを利用する."""

    created: dict[str, object] = {}

    def fail_fallback() -> None:
        raise AssertionError("TkinterDnDが利用可能ならtk.Tkは呼び出されない")

    monkeypatch.setattr(gui_app.tk, "Tk", fail_fallback)

    class DummyRoot:
        def __init__(self) -> None:
            created["root"] = self

        def mainloop(self) -> None:
            created["mainloop"] = True

    monkeypatch.setattr(
        gui_app,
        "TkinterDnD",
        types.SimpleNamespace(Tk=lambda: DummyRoot()),
    )

    class DummyApp:
        def __init__(self, root) -> None:  # noqa: ANN001 - テスト用の簡易スタブ
            created["app_root"] = root

    monkeypatch.setattr(gui_app, "RelicGuiApp", DummyApp)
    monkeypatch.setattr(gui_app, "_parse_cli_args", lambda argv=None: None)

    gui_app.main([])

    assert created.get("app_root") is created.get("root")
    assert created.get("mainloop") is True

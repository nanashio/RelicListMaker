"""GUIパッケージへの互換エントリーポイント."""
from __future__ import annotations

from gui import RelicGuiApp, main

__all__ = ["RelicGuiApp", "main"]

if __name__ == "__main__":
    main()

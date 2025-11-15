"""GUI パッケージの正式エントリーポイント."""
from __future__ import annotations

from .app import RelicGuiApp, main

__all__ = ["RelicGuiApp", "main"]

if __name__ == "__main__":
    main()

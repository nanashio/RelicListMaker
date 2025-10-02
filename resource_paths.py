"""PyInstaller対応のリソースパス解決ヘルパー."""
from __future__ import annotations

import sys
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def project_root() -> Path:
    """
    実行形態に関わらずテンプレートなどの静的アセットを格納するルートパスを返す。

    PyInstaller 実行体では `_MEIPASS` に一時展開されるため、優先して参照する。
    開発時はリポジトリ直下のパスを返す。
    """
    base_dir = getattr(sys, "_MEIPASS", None)
    if base_dir:
        return Path(base_dir)
    return Path(__file__).resolve().parent


def resource_path(*parts: str) -> Path:
    """リソースの相対パスを解決する。"""
    return project_root().joinpath(*parts)


def templates_path(*parts: str) -> Path:
    """templatesディレクトリ配下のパスを返す。"""
    return resource_path("templates", *parts)

"""CLIサブコマンド向けの共通ヘルパー。"""
from __future__ import annotations

from pathlib import Path
from typing import Iterable


def ensure_directory(path: str | Path) -> Path:
    """出力ディレクトリを作成してPathを返す。"""
    resolved = Path(path)
    resolved.mkdir(parents=True, exist_ok=True)
    return resolved


def as_path(value: str | Path) -> Path:
    """Path型への簡易変換。"""
    return value if isinstance(value, Path) else Path(value)


def extend_argv(base: Iterable[str], extra: Iterable[str]) -> list[str]:
    """旧スクリプトからCLIを委譲するときの引数連結ヘルパー。"""
    return [*base, *extra]

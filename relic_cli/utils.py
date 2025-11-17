"""CLIサブコマンド向けの共通ヘルパー."""
from __future__ import annotations

import argparse
from pathlib import Path
from typing import Iterable, Tuple


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


def parse_bool(value: str) -> bool:
    """文字列を真偽値に変換する."""
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "y", "on", "show"}:
        return True
    if normalized in {"0", "false", "no", "n", "off", "hide"}:
        return False
    raise argparse.ArgumentTypeError(f"真偽値として解釈できません: {value}")


def key_value_pair(value: str) -> Tuple[str, str]:
    """`key=value` 形式の文字列をパースする."""
    if "=" not in value:
        raise argparse.ArgumentTypeError("KEY=VALUE 形式で指定してください")
    key, raw = value.split("=", 1)
    key = key.strip()
    raw = raw.strip()
    if not key or not raw:
        raise argparse.ArgumentTypeError("KEY=VALUE 形式で指定してください")
    return key, raw


def key_bool_pair(value: str) -> Tuple[str, bool]:
    """真偽値を伴う `key=value` 形式をパースする."""
    key, raw = key_value_pair(value)
    return key, parse_bool(raw)


__all__ = [
    "ensure_directory",
    "as_path",
    "extend_argv",
    "parse_bool",
    "key_value_pair",
    "key_bool_pair",
]

"""テンプレートなどテキストアセットの読み込み."""
from __future__ import annotations

from pathlib import Path
from typing import Optional


def load_text_asset(default_path: Path, override: Optional[Path] = None) -> str:
    """テキストアセットを読み込む.

    override が指定された場合はそちらを優先し、存在しない場合は default_path を利用する。
    """

    candidate = override if override is not None else default_path
    if not candidate.exists():
        raise FileNotFoundError(candidate)
    return candidate.read_text(encoding="utf-8")

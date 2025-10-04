"""Tesseract バンドル検出と設定ヘルパー."""
from __future__ import annotations

import os
import platform
from functools import lru_cache
from pathlib import Path
from typing import List, NamedTuple, Optional

from resource_paths import resource_path


class TesseractInfo(NamedTuple):
    cmd: Path
    tessdata_prefix: Optional[Path]


def _iter_candidate_roots(base: Path) -> List[Path]:
    """プラットフォーム別に優先しながら探索対象ディレクトリを列挙する."""
    system = platform.system().lower()
    preferred: List[Path] = []
    if base.exists():
        for child in base.iterdir():
            if not child.is_dir():
                continue
            name = child.name.lower()
            if system.startswith("win") and any(tag in name for tag in ("win", "windows")):
                preferred.append(child)
            elif system.startswith("darwin") and any(tag in name for tag in ("mac", "osx", "darwin")):
                preferred.append(child)
            elif system.startswith("linux") and any(tag in name for tag in ("linux", "gnu", "x86", "arm")):
                preferred.append(child)
    seen = {path.resolve() for path in preferred}
    remainder = []
    if base.exists():
        for child in base.iterdir():
            if child.is_dir() and child.resolve() not in seen:
                remainder.append(child)
    return preferred + remainder + [base]


def _candidate_binaries(root: Path) -> List[Path]:
    names = ["tesseract.exe", "tesseract"]
    candidates: List[Path] = []
    for name in names:
        direct = root / name
        if direct.is_file():
            candidates.append(direct)
        bin_dir = root / "bin"
        if bin_dir.is_dir():
            nested = bin_dir / name
            if nested.is_file():
                candidates.append(nested)
    return candidates


def _guess_tessdata(binary: Path, base: Path) -> Optional[Path]:
    probe = [
        binary.parent / "tessdata",
        binary.parent.parent / "tessdata",
        base / "tessdata",
    ]
    for candidate in probe:
        if candidate.is_dir():
            return candidate
    return None


@lru_cache(maxsize=1)
def find_bundled_tesseract() -> Optional[TesseractInfo]:
    base = resource_path("tesseract")
    if not base.exists():
        return None

    system = platform.system().lower()
    for root in _iter_candidate_roots(base):
        for binary in _candidate_binaries(root):
            suffix = binary.suffix.lower()
            if system.startswith("win"):
                if suffix != ".exe":
                    continue
            else:
                # Linux / macOS では .exe をスキップ
                if suffix == ".exe":
                    continue
            if not os.access(binary, os.X_OK):
                continue
            tessdata = _guess_tessdata(binary, base)
            return TesseractInfo(cmd=binary, tessdata_prefix=tessdata)
    return None


def configure_pytesseract() -> Optional[TesseractInfo]:
    """バンドル済み Tesseract があれば pytesseract をそのパスに向ける."""
    info = find_bundled_tesseract()
    if not info:
        return None

    import pytesseract  # 遅延インポートで循環依存を避ける

    pytesseract.pytesseract.tesseract_cmd = str(info.cmd)
    if info.tessdata_prefix:
        os.environ.setdefault("TESSDATA_PREFIX", str(info.tessdata_prefix))
        os.environ.setdefault("PYTESSERACT_TESSDATA_PREFIX", str(info.tessdata_prefix))
    return info

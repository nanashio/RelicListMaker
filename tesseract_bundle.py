"""Tesseract バンドル検出と設定ヘルパー."""
from __future__ import annotations

import os
import platform
import shutil
from functools import lru_cache
from pathlib import Path
from typing import List, NamedTuple, Optional

from resource_paths import resource_path


class TesseractInfo(NamedTuple):
    cmd: Path
    tessdata_prefix: Optional[Path]


_SYSTEM_TESSERACT_REASON: Optional[str] = None


def _is_wsl() -> bool:
    if platform.system().lower() != "linux":
        return False
    try:
        with open("/proc/sys/kernel/osrelease", "r", encoding="utf-8") as fp:
            return "microsoft" in fp.read().lower()
    except OSError:
        return False


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


def _activate_bundled(info: TesseractInfo) -> TesseractInfo:
    import pytesseract  # 遅延インポートで循環依存を避ける

    pytesseract.pytesseract.tesseract_cmd = str(info.cmd)
    binary_dir = info.cmd.parent
    if platform.system().lower().startswith("win"):
        try:
            os.add_dll_directory(str(binary_dir))  # type: ignore[attr-defined]
        except (AttributeError, FileNotFoundError, OSError):
            pass
    existing_path = os.environ.get("PATH", "")
    current_paths = [segment for segment in existing_path.split(os.pathsep) if segment]
    binary_str = str(binary_dir)
    if binary_str not in current_paths:
        current_paths.insert(0, binary_str)
    os.environ["PATH"] = os.pathsep.join(current_paths)
    if info.tessdata_prefix:
        os.environ.setdefault("TESSDATA_PREFIX", str(info.tessdata_prefix))
        os.environ.setdefault("PYTESSERACT_TESSDATA_PREFIX", str(info.tessdata_prefix))
    print(f"[INFO] バンドル済みTesseractを使用します: {info.cmd}")
    if info.tessdata_prefix:
        print(f"[INFO] tessdata パス: {info.tessdata_prefix}")
    return info


def configure_pytesseract() -> Optional[TesseractInfo]:
    """バンドル済み Tesseract があれば pytesseract をそのパスに向ける."""
    global _SYSTEM_TESSERACT_REASON

    system = platform.system().lower()
    info = find_bundled_tesseract()

    if system.startswith("win"):
        if not info:
            raise RuntimeError(
                "Windows 環境ではバンドル済み Tesseract が必須です。"
                " `tesseract/windows-x64/` の配置を確認してください。"
            )
        _SYSTEM_TESSERACT_REASON = None
        return _activate_bundled(info)

    if _is_wsl():
        if shutil.which("tesseract"):
            _SYSTEM_TESSERACT_REASON = "wsl"
            print("[INFO] WSL 環境ではローカルインストールされた Tesseract を優先します")
            return None
        if info:
            print(
                "[WARN] WSL 環境でシステムの Tesseract が見つからなかったため、同梱版を使用します"
            )
            _SYSTEM_TESSERACT_REASON = None
            return _activate_bundled(info)
        _SYSTEM_TESSERACT_REASON = "missing"
        print(
            "[ERROR] WSL 環境で利用可能な Tesseract が見つかりません。"
            " `sudo apt install tesseract-ocr` などでインストールしてください。"
        )
        return None

    if info:
        _SYSTEM_TESSERACT_REASON = None
        return _activate_bundled(info)

    _SYSTEM_TESSERACT_REASON = "not_found"
    return None


def is_system_tesseract_preferred() -> bool:
    return _SYSTEM_TESSERACT_REASON is not None


def system_tesseract_reason() -> Optional[str]:
    return _SYSTEM_TESSERACT_REASON

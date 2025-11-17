"""画像の解決とコピー処理."""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Optional

from .datasets import DatasetRecord


def _safe_filename(base: str) -> str:
    sanitized = [char if char.isalnum() or char in {"_", "-"} else "_" for char in base]
    text = "".join(sanitized)
    return text or "image"


def _copy_image(source: Path, destination_dir: Path, dataset_prefix: str, counter: int) -> str:
    prefix = _safe_filename(dataset_prefix)
    dest_name = f"{prefix}_{counter:05d}{source.suffix.lower()}"
    dest_path = destination_dir / dest_name
    shutil.copy2(source, dest_path)
    return dest_name


def _resolve_image_path(record: dict[str, object], dataset: DatasetRecord) -> Optional[Path]:
    raw_value = record.get("Image")
    if not raw_value:
        return None
    path_str = str(raw_value).strip()
    if not path_str:
        return None

    candidate = Path(path_str)
    if candidate.is_absolute() and candidate.exists():
        return candidate

    relative_path = dataset.folder / candidate
    if relative_path.exists():
        return relative_path

    crops_path = dataset.images_dir / candidate.name
    if crops_path.exists():
        return crops_path

    print(f"[WARN] 画像ファイルが見つかりません: {path_str} ({dataset.folder})")
    return None


__all__ = ["_copy_image", "_resolve_image_path", "_safe_filename"]

"""ビューワ更新周りのヘルパー."""

from __future__ import annotations

import os
from pathlib import Path

from .constants import DEFAULT_IMAGE_DIR_NAME, MERGED_CSV_NAME
from .datasets import _is_merged_dir_name, _iter_dataset_dirs


def _collect_existing_merged_entries(root: Path, base_name: str) -> list[dict[str, str]]:
    """ビューワに掲載する既存統合結果のメタデータを収集する."""

    collected: list[tuple[int, dict[str, str]]] = []
    gallery_dir = root / "gallery"
    for folder in _iter_dataset_dirs(root):
        if not _is_merged_dir_name(folder.name, base_name):
            continue
        csv_path = folder / MERGED_CSV_NAME
        images_dir = folder / DEFAULT_IMAGE_DIR_NAME
        if not csv_path.exists() or not images_dir.exists():
            continue
        if folder.name == base_name:
            order = 0
        else:
            suffix_text = folder.name[len(base_name) + 1 :]
            order = int(suffix_text) + 1 if suffix_text.isdigit() else 1
        label = "統合結果" if folder.name == base_name else f"統合結果 ({folder.name})"
        csv_rel = os.path.relpath(csv_path, gallery_dir)
        img_rel = os.path.relpath(images_dir, gallery_dir)
        collected.append(
            (
                order,
                {
                    "label": label,
                    "csv": Path(csv_rel).as_posix(),
                    "img_dir": Path(img_rel).as_posix(),
                    "folder": folder.name,
                    "kind": "merged_csv",
                },
            )
        )
    collected.sort(key=lambda item: item[0])
    return [entry for _, entry in collected]


__all__ = ["_collect_existing_merged_entries"]

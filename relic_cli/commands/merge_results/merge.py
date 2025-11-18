"""merge-results コマンドのメインロジック."""

from __future__ import annotations

import csv
import os
from pathlib import Path
from typing import Optional

from gallery import generate_html
from relic_data import load_master_csv

from .constants import (
    DEFAULT_IMAGE_DIR_NAME,
    EXTRA_FIELD_PREFIXES,
    MERGED_CSV_NAME,
    MERGED_DIR_NAME,
)
from .datasets import DatasetRecord, _select_output_dir, collect_datasets
from .errors import MergeResultsError
from .images import _copy_image, _resolve_image_path
from .rows import (
    _collect_field_order,
    _ensure_no_correction_columns,
    _has_all_effects_reviewed,
    _is_duplicate,
)
from .viewer import _collect_existing_merged_entries


def merge_results(
    results_dir: str | Path,
    target_name: str = MERGED_DIR_NAME,
    *,
    only_reviewed: bool = True,
    item_image_view_box: Optional[str] = None,
) -> Path:
    """results/ 配下のデータセットを統合し、新しいディレクトリに出力する."""

    root = Path(results_dir).resolve()
    if not root.exists():
        raise MergeResultsError(f"結果ディレクトリが見つかりません: {root}")

    datasets = collect_datasets(root, target_name)
    if not datasets:
        raise MergeResultsError("統合対象のデータセットが見つかりませんでした")

    gallery_dir = root / "gallery"

    merged_dir = _select_output_dir(root, target_name)
    if merged_dir.name != target_name:
        print(f"[INFO] 既存の統合結果を保持するため {merged_dir.name} に書き出します")
    merged_dir.mkdir(parents=True, exist_ok=False)
    crops_dir = merged_dir / DEFAULT_IMAGE_DIR_NAME
    crops_dir.mkdir(parents=True, exist_ok=False)

    merged_rows: list[dict[str, object]] = []
    source_entries: list[dict[str, str]] = []

    for dataset in datasets:
        print(f"[INFO] データセット統合中: {dataset.folder}")
        try:
            with dataset.csv_path.open("r", encoding="utf-8") as handle:
                reader = csv.DictReader(handle)
                if not reader.fieldnames or "Image" not in reader.fieldnames:
                    print(f"[WARN] Image列が存在しません: {dataset.csv_path}")
                    continue

                for row_index, row in enumerate(reader, start=1):
                    _ensure_no_correction_columns(
                        row,
                        source=dataset.csv_path,
                        row_index=row_index,
                    )
                    normalized_row = dict(row)

                    if _is_duplicate(normalized_row.get("Duplicate")):
                        continue
                    if only_reviewed and not _has_all_effects_reviewed(normalized_row):
                        print(
                            "[INFO] レビュー未完了のためスキップします:",
                            f"{dataset.csv_path} #{row_index}",
                        )
                        continue
                    image_path = _resolve_image_path(normalized_row, dataset)
                    if not image_path:
                        continue

                    dest_name = _copy_image(image_path, crops_dir, dataset.label, row_index)
                    merged_row: dict[str, object] = dict(normalized_row)
                    merged_row["Image"] = dest_name
                    merged_row["BaseImage"] = image_path.name
                    merged_row["Dataset"] = dataset.label
                    merged_row["DatasetFolder"] = dataset.folder.name
                    merged_row["SourceCsv"] = dataset.csv_path.relative_to(merged_dir.parent).as_posix()
                    merged_row["SourceImage"] = image_path.relative_to(dataset.folder).as_posix()
                    merged_row["Duplicate"] = False
                    merged_rows.append(merged_row)
        except OSError as err:
            print(f"[ERROR] CSVの読み込みに失敗しました: {dataset.csv_path} ({err})")
            continue

        source_entries.append(
            {
                "label": dataset.label,
                "csv": Path(os.path.relpath(dataset.csv_path, gallery_dir)).as_posix(),
                "imgDir": Path(os.path.relpath(dataset.images_dir, gallery_dir)).as_posix(),
                "folder": dataset.folder.name,
            }
        )

    if not merged_rows:
        raise MergeResultsError(
            "統合後に出力可能な行がありません。重複指定やレビュー状況を確認してください。"
        )

    field_order = _collect_field_order(merged_rows)
    merged_csv_path = merged_dir / MERGED_CSV_NAME

    with merged_csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=field_order)
        writer.writeheader()
        for row in merged_rows:
            writer.writerow({key: row.get(key, "") for key in field_order})

    print(f"[INFO] 統合CSVを出力しました: {merged_csv_path}")

    merged_entries = _collect_existing_merged_entries(root, target_name)
    active_dataset_index = 0
    for index, entry in enumerate(merged_entries):
        if entry.get("folder") == merged_dir.name:
            active_dataset_index = index
            break

    viewer_path = gallery_dir / "index.html"
    relative_crops = Path(os.path.relpath(crops_dir, gallery_dir)).as_posix()
    generate_html(
        str(merged_csv_path),
        relative_crops,
        str(viewer_path),
        master_csv_path=None,
        master_json_path="",
        master_options=load_master_csv(),
        datasets=merged_entries + source_entries,
        active_dataset_index=active_dataset_index,
        item_image_view_box=item_image_view_box,
    )
    print(f"[INFO] ビューワを更新しました: {viewer_path}")

    return merged_dir


__all__ = [
    "DEFAULT_IMAGE_DIR_NAME",
    "EXTRA_FIELD_PREFIXES",
    "MERGED_CSV_NAME",
    "MERGED_DIR_NAME",
    "DatasetRecord",
    "MergeResultsError",
    "merge_results",
]

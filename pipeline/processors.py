"""動画ごとの処理フロー."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Mapping, Optional

from extract_frames import extract_and_crop
from match_and_export import process_images
from resource_paths import templates_path

from .progress import ProgressReporter
from .tasks import DEFAULT_RELIC_TYPE, RELIC_TYPE_DEEP, VideoTask, decide_item_color


def _resolve_master_csv(relic_type: str) -> str:
    if relic_type == RELIC_TYPE_DEEP:
        return str(templates_path("master_relics_deep.csv"))
    return str(templates_path("master_relics.csv"))


def process_video(
    task: VideoTask,
    *,
    ocr_upsample: float,
    override_colors: Mapping[Path, str],
    save_full_frames: bool,
    csv_column_visibility: Optional[dict[str, object]],
    reporter: ProgressReporter,
) -> dict[str, str]:
    """単一動画の処理を実行し、HTML 生成用のエントリを返す."""
    task.output_dir.mkdir(parents=True, exist_ok=True)
    if save_full_frames:
        task.frames_dir.mkdir(exist_ok=True)
    task.crops_dir.mkdir(exist_ok=True)

    video_name = task.source_path.name
    print(f"[PROCESSING] {video_name} を処理中...")

    reporter.step(f"{video_name} のフレーム抽出中...")
    extract_and_crop(
        str(task.source_path),
        frame_dir=str(task.frames_dir),
        crop_dir=str(task.crops_dir),
        save_full_frames=save_full_frames,
    )
    reporter.advance(f"{video_name} のフレーム抽出完了")

    item_color = decide_item_color(task, override_colors)

    reporter.step(f"{video_name} のOCR/マッチング中...")
    task_relic_type = getattr(task, "relic_type", DEFAULT_RELIC_TYPE)
    master_csv_path = _resolve_master_csv(task_relic_type)

    process_images(
        image_dir=str(task.crops_dir),
        output_path=str(task.csv_path),
        scale=1.0,
        upsample=ocr_upsample,
        preprocess=True,
        corrections_csv=str(task.corrections_csv),
        item_color=item_color,
        column_visibility=csv_column_visibility,
        master_csv_path=master_csv_path,
        relic_type=task_relic_type,
    )
    reporter.advance(f"{video_name} のOCR/マッチング完了")
    print(f"[✓] {task.crops_dir} の結果を {task.csv_path} に出力しました")

    result_dir = task.output_dir.parent
    return {
        "label": task.base_name,
        "csv": os.path.relpath(task.csv_path, result_dir),
        "img_dir": os.path.relpath(task.crops_dir, result_dir),
        "folder": os.path.relpath(task.output_dir, result_dir),
        "relic_type": task_relic_type,
    }

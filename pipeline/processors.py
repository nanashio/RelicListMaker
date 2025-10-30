"""動画ごとの処理フロー."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from extract_frames import extract_and_crop
from match_and_export import process_images

from .progress import ProgressReporter
from .tasks import VideoTask, decide_item_color


def process_video(
    task: VideoTask,
    *,
    ocr_upsample: float,
    override_colors: dict[Path, str],
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
    process_images(
        image_dir=str(task.crops_dir),
        output_path=str(task.csv_path),
        scale=1.0,
        upsample=ocr_upsample,
        preprocess=True,
        corrections_csv=str(task.corrections_csv),
        item_color=item_color,
        column_visibility=csv_column_visibility,
    )
    reporter.advance(f"{video_name} のOCR/マッチング完了")
    print(f"[✓] {task.crops_dir} の結果を {task.csv_path} に出力しました")

    result_dir = task.output_dir.parent
    return {
        "label": task.base_name,
        "csv": os.path.relpath(task.csv_path, result_dir),
        "img_dir": os.path.relpath(task.crops_dir, result_dir),
        "folder": os.path.relpath(task.output_dir, result_dir),
    }

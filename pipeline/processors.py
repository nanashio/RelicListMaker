"""動画ごとの処理フロー."""
from __future__ import annotations

from pathlib import Path
from typing import Mapping, Optional

from pipeline.extraction import extract_and_crop
from relic_pipeline.processing import build_processing_parameters, process_images
from resource_paths import templates_path

from datasets.builder import ProcessedVideoResult

from .progress import ProgressReporter
from .tasks import DEFAULT_RELIC_TYPE, RELIC_TYPE_DEEP, VideoTask, decide_item_color


def _resolve_master_csv(relic_type: str) -> tuple[str, str | None]:
    if relic_type == RELIC_TYPE_DEEP:
        return (
            str(templates_path("master_relics_deep.csv")),
            str(templates_path("master_relics_demerit.csv")),
        )
    return (str(templates_path("master_relics.csv")), None)


def process_video(
    task: VideoTask,
    *,
    ocr_upsample: float,
    ocr_engine: str,
    gcp_credentials: str | None,
    gcp_credentials_filename: str | None,
    override_colors: Mapping[Path, str],
    save_full_frames: bool,
    csv_column_visibility: Optional[dict[str, object]],
    reporter: ProgressReporter,
) -> ProcessedVideoResult:
    """単一動画の処理を実行し、HTML 生成用の結果情報を返す."""
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
    master_csv_path, demerit_master_csv_path = _resolve_master_csv(task_relic_type)

    params = build_processing_parameters(
        scale=1.0,
        upsample=ocr_upsample,
        preprocess=True,
        column_visibility=csv_column_visibility,
        item_color=item_color,
        relic_type=task_relic_type,
        master_csv_path=master_csv_path,
        corrections_csv=str(task.corrections_csv) if task.corrections_csv else None,
        demerit_master_csv_path=demerit_master_csv_path,
        ocr_engine=ocr_engine,
        gcp_credentials=gcp_credentials,
        gcp_credentials_filename=gcp_credentials_filename,
    )

    process_images(
        image_dir=str(task.crops_dir),
        output_path=str(task.csv_path),
        crop_boxes=params.crop_boxes,
        ocr_settings=params.ocr_settings,
        export_options=params.export_options,
        default_matching=params.default_matching,
        slot_settings=params.slot_settings,
        slot_sources=params.slot_sources,
        demerit_matching=params.demerit_matching,
    )
    reporter.advance(f"{video_name} のOCR/マッチング完了")
    print(f"[✓] {task.crops_dir} の結果を {task.csv_path} に出力しました")

    return ProcessedVideoResult(
        label=task.base_name,
        csv_path=task.csv_path,
        crops_dir=task.crops_dir,
        output_dir=task.output_dir,
        relic_type=task_relic_type,
    )

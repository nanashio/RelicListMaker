"""パイプライン実行のエントリーポイント."""
from __future__ import annotations

from typing import Callable, Optional

from pipeline import (
    DEFAULT_OCR_UPSAMPLE as PIPELINE_DEFAULT_OCR_UPSAMPLE,
    DEFAULT_RESULT_DIR as PIPELINE_DEFAULT_RESULT_DIR,
    DEFAULT_VIDEO_DIR as PIPELINE_DEFAULT_VIDEO_DIR,
    CallbackProgressReporter,
    NullProgressReporter,
    PipelineResult,
    PipelineSettings,
    ProgressReporter,
    detect_item_color,
    run_pipeline,
)

VIDEO_DIR = PIPELINE_DEFAULT_VIDEO_DIR
DEFAULT_RESULT_DIR = PIPELINE_DEFAULT_RESULT_DIR
OCR_UPSAMPLE = PIPELINE_DEFAULT_OCR_UPSAMPLE


def _resolve_reporter(progress_callback: Optional[Callable[[int, int, str], None]]) -> ProgressReporter:
    if progress_callback:
        return CallbackProgressReporter(callback=progress_callback)
    return NullProgressReporter()


def main(
    video_dir=VIDEO_DIR,
    result_dir=DEFAULT_RESULT_DIR,
    ocr_upsample=OCR_UPSAMPLE,
    progress_callback: Optional[Callable[[int, int, str], None]] = None,
    video_files: Optional[list[str]] = None,
    item_color_overrides: Optional[dict[str, str]] = None,
    relic_type_overrides: Optional[dict[str, str]] = None,
    save_full_frames: bool = False,
    csv_column_visibility: Optional[dict[str, object]] = None,
    item_image_view_box: Optional[str] = None,
) -> PipelineResult:
    settings = PipelineSettings(
        video_dir=video_dir,
        result_dir=result_dir,
        ocr_upsample=ocr_upsample,
        video_files=video_files,
        item_color_overrides=item_color_overrides,
        relic_type_overrides=relic_type_overrides,
        save_full_frames=save_full_frames,
        csv_column_visibility=csv_column_visibility,
        item_image_view_box=item_image_view_box,
    )
    reporter = _resolve_reporter(progress_callback)
    return run_pipeline(settings=settings, reporter=reporter)


if __name__ == "__main__":
    main()

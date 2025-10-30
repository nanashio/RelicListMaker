"""パイプライン全体の統括ロジック."""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Optional

from generate_gallery import generate_html
from relic_data import load_master_csv
from resource_paths import templates_path

from .inputs import build_override_map, gather_video_files
from .processors import process_video
from .progress import NullProgressReporter, ProgressReporter
from .tasks import VideoTask, create_tasks

DEFAULT_VIDEO_DIR = "videos"
DEFAULT_RESULT_DIR = "results"
DEFAULT_OCR_UPSAMPLE = 1.5


@dataclass
class PipelineSettings:
    video_dir: Path = field(default_factory=lambda: Path(DEFAULT_VIDEO_DIR))
    result_dir: Path = field(default_factory=lambda: Path(DEFAULT_RESULT_DIR))
    ocr_upsample: float = DEFAULT_OCR_UPSAMPLE
    video_files: Optional[list[str]] = None
    item_color_overrides: Optional[dict[str, str]] = None
    save_full_frames: bool = False
    csv_column_visibility: Optional[dict[str, object]] = None
    item_image_view_box: Optional[str] = None

    def __post_init__(self) -> None:
        if not isinstance(self.video_dir, Path):
            self.video_dir = Path(self.video_dir)
        if not isinstance(self.result_dir, Path):
            self.result_dir = Path(self.result_dir)


@dataclass(frozen=True)
class PipelineResult:
    viewer_path: Path
    datasets: list[dict[str, str]]
    default_csv_path: Path
    default_img_dir: str
    elapsed_seconds: float


def run_pipeline(
    settings: PipelineSettings,
    reporter: Optional[ProgressReporter] = None,
    tasks: Optional[Iterable[VideoTask]] = None,
) -> PipelineResult:
    reporter = reporter or NullProgressReporter()
    start_time = time.time()
    print("[INFO] 動画ごとの処理開始...")

    result_dir = settings.result_dir
    result_dir.mkdir(parents=True, exist_ok=True)

    master_src = templates_path("master_relics.csv")
    master_options = load_master_csv(master_src)
    dataset_entries: list[dict[str, str]] = []

    override_map = build_override_map(settings.item_color_overrides)

    if tasks is None:
        video_dir_path = settings.video_dir
        selected_videos = gather_video_files(video_dir_path, settings.video_files)
        tasks_to_run = create_tasks(selected_videos, result_dir)
    else:
        tasks_to_run = list(tasks)

    total_steps = len(tasks_to_run) * 2 + 1 if tasks_to_run else 1
    reporter.prepare(total_steps)
    reporter.step("動画処理を準備中...")

    if not tasks_to_run:
        print("[WARN] 処理対象の動画が見つかりません。")
        reporter.step("処理対象の動画が見つかりませんでした")

    for task in tasks_to_run:
        entry = process_video(
            task,
            ocr_upsample=settings.ocr_upsample,
            override_colors=override_map,
            save_full_frames=settings.save_full_frames,
            csv_column_visibility=settings.csv_column_visibility,
            reporter=reporter,
        )
        dataset_entries.append(entry)

    if dataset_entries:
        default_csv_path = (result_dir / dataset_entries[0]["csv"]).resolve()
        default_img_dir = dataset_entries[0]["img_dir"]
    else:
        default_csv_path = (result_dir / "results.csv").resolve()
        default_img_dir = ""

    viewer_path = result_dir / "viewer.html"
    reporter.step("HTML を生成中...")
    generate_html(
        str(default_csv_path),
        default_img_dir,
        str(viewer_path),
        master_csv_path=None,
        master_json_path="",
        master_options=master_options,
        datasets=dataset_entries,
        active_dataset_index=0,
        item_image_view_box=settings.item_image_view_box,
    )

    reporter.advance("全処理完了")
    elapsed = time.time() - start_time
    print(f"[✓] 全処理完了！処理時間: {elapsed:.2f}秒")

    return PipelineResult(
        viewer_path=viewer_path,
        datasets=dataset_entries,
        default_csv_path=default_csv_path,
        default_img_dir=default_img_dir,
        elapsed_seconds=elapsed,
    )

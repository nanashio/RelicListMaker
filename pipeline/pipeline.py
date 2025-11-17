"""パイプライン全体の統括ロジック."""
from __future__ import annotations

import time
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any, Iterable, Optional

from datasets.builder import DatasetBuildResult, ProcessedVideoResult, build_dataset_entries
from gallery import generate_html
from relic_data import load_master_csv, normalize_master_values
from resource_paths import templates_path
from relic_pipeline.settings import (
    DEFAULT_GCP_CREDENTIALS_FILENAME as SETTINGS_DEFAULT_GCP_CREDENTIALS_FILENAME,
)

from .inputs import build_override_map, build_path_value_map, gather_video_files
from .processors import process_video
from .progress import NullProgressReporter, ProgressReporter
from .tasks import (
    DEFAULT_RELIC_TYPE,
    RELIC_TYPE_DEEP,
    VideoTask,
    create_tasks,
    detect_relic_type,
    normalize_relic_type,
)

DEFAULT_VIDEO_DIR = "videos"
DEFAULT_RESULT_DIR = "results"
DEFAULT_OCR_UPSAMPLE = 1.5
DEFAULT_OCR_ENGINE = "tesseract"
DEFAULT_GCP_CREDENTIALS_FILENAME = SETTINGS_DEFAULT_GCP_CREDENTIALS_FILENAME


@dataclass
class PipelineSettings:
    video_dir: Path | str = field(default_factory=lambda: Path(DEFAULT_VIDEO_DIR))
    result_dir: Path | str = field(default_factory=lambda: Path(DEFAULT_RESULT_DIR))
    ocr_upsample: float = DEFAULT_OCR_UPSAMPLE
    ocr_engine: str = DEFAULT_OCR_ENGINE
    gcp_credentials: str | None = None
    gcp_credentials_filename: str | None = DEFAULT_GCP_CREDENTIALS_FILENAME
    video_files: Optional[Iterable[str | Path]] = None
    item_color_overrides: Optional[dict[str | Path, str]] = None
    relic_type_overrides: Optional[dict[str | Path, str]] = None
    save_full_frames: bool = False
    csv_column_visibility: Optional[dict[str, object]] = None
    item_image_view_box: Optional[str] = None

    def __post_init__(self) -> None:
        if not isinstance(self.video_dir, Path):
            self.video_dir = Path(self.video_dir)
        if not isinstance(self.result_dir, Path):
            self.result_dir = Path(self.result_dir)
        engine = (self.ocr_engine or DEFAULT_OCR_ENGINE).strip().lower()
        if engine not in {"tesseract", "vision"}:
            engine = DEFAULT_OCR_ENGINE
        self.ocr_engine = engine
        if self.gcp_credentials:
            self.gcp_credentials = str(Path(self.gcp_credentials).expanduser())
        if self.gcp_credentials_filename is not None:
            filename = str(self.gcp_credentials_filename).strip()
            self.gcp_credentials_filename = filename or None


@dataclass(frozen=True)
class PipelineResult:
    viewer_path: Path
    datasets: list[dict[str, Any]]
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

    master_paths: dict[str, list[Path]] = {
        DEFAULT_RELIC_TYPE: [templates_path("master_relics.csv")],
        RELIC_TYPE_DEEP: [
            templates_path("master_relics_deep.csv"),
            templates_path("master_relics_demerit.csv"),
        ],
    }
    master_options: list[str] = []
    processed_results: list[ProcessedVideoResult] = []

    override_map = build_override_map(settings.item_color_overrides)
    type_override_map = build_path_value_map(settings.relic_type_overrides)

    if tasks is None:
        video_dir_path = settings.video_dir
        selected_videos = gather_video_files(video_dir_path, settings.video_files)
        tasks_to_run = create_tasks(selected_videos, result_dir)
    else:
        tasks_to_run = list(tasks)

    adjusted_tasks: list[VideoTask] = []
    used_types: set[str] = set()
    for task in tasks_to_run:
        override_type = type_override_map.get(task.source_path)
        normalized_override = (
            normalize_relic_type(override_type) if override_type is not None else None
        )
        inferred_type = detect_relic_type(task.base_name)
        chosen_type = normalized_override if normalized_override is not None else inferred_type
        if chosen_type not in master_paths:
            chosen_type = DEFAULT_RELIC_TYPE
        used_types.add(chosen_type)
        if getattr(task, "relic_type", DEFAULT_RELIC_TYPE) != chosen_type:
            task = replace(task, relic_type=chosen_type)
        adjusted_tasks.append(task)

    if adjusted_tasks:
        tasks_to_run = adjusted_tasks
    else:
        tasks_to_run = []

    if not used_types:
        used_types.add(DEFAULT_RELIC_TYPE)

    for relic_type in used_types:
        path_entries = master_paths.get(relic_type, [])
        for master_path in path_entries:
            master_options.extend(load_master_csv(master_path))

    master_options = normalize_master_values(master_options)

    total_steps = len(tasks_to_run) * 2 + 1 if tasks_to_run else 1
    reporter.prepare(total_steps)
    reporter.step("動画処理を準備中...")

    if not tasks_to_run:
        print("[WARN] 処理対象の動画が見つかりません。")
        reporter.step("処理対象の動画が見つかりませんでした")

    for task in tasks_to_run:
        result = process_video(
            task,
            ocr_upsample=settings.ocr_upsample,
            ocr_engine=settings.ocr_engine,
            gcp_credentials=settings.gcp_credentials,
            gcp_credentials_filename=settings.gcp_credentials_filename,
            override_colors=override_map,
            save_full_frames=settings.save_full_frames,
            csv_column_visibility=settings.csv_column_visibility,
            reporter=reporter,
        )
        processed_results.append(result)

    dataset_build: DatasetBuildResult = build_dataset_entries(
        result_dir,
        processed_results,
        default_csv_name="results.csv",
        active_index=0,
    )

    viewer_path = result_dir / "gallery" / "index.html"
    reporter.step("HTML を生成中...")
    generate_html(
        str(dataset_build.default_csv_path),
        dataset_build.default_img_dir,
        str(viewer_path),
        master_csv_path=None,
        master_json_path="",
        master_options=master_options,
        datasets=dataset_build.datasets,
        active_dataset_index=dataset_build.active_index,
        item_image_view_box=settings.item_image_view_box,
        datasets_base_dir=str(result_dir),
    )

    reporter.advance("全処理完了")
    elapsed = time.time() - start_time
    print(f"[✓] 全処理完了！処理時間: {elapsed:.2f}秒")

    return PipelineResult(
        viewer_path=viewer_path,
        datasets=dataset_build.datasets,
        default_csv_path=dataset_build.default_csv_path,
        default_img_dir=dataset_build.default_img_dir,
        elapsed_seconds=elapsed,
    )

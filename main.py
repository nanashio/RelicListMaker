# main.py
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable, Optional

from extract_frames import extract_and_crop
from generate_gallery import generate_html
from match_and_export import process_images
from relic_data import load_master_csv
from resource_paths import templates_path

VIDEO_DIR = "videos"
DEFAULT_RESULT_DIR = "results"
OCR_UPSAMPLE = 1.5


COLOR_KEYWORDS = {
    'red': 'red',
    'green': 'green',
    'blue': 'blue',
    'yellow': 'yellow',
    '赤': 'red',
    '緑': 'green',
    '青': 'blue',
    '黄': 'yellow',
}


@dataclass(frozen=True)
class VideoTask:
    source_path: Path
    base_name: str
    output_dir: Path
    frames_dir: Path
    crops_dir: Path
    csv_path: Path
    corrections_csv: Path


def detect_item_color(name: str) -> Optional[str]:
    if not name:
        return None

    lowered = name.lower()
    for word, color in COLOR_KEYWORDS.items():
        if word in lowered:
            return color

    # 日本語キーワードは lower() で変換できないので別途チェック
    for word in ('赤', '緑', '青', '黄'):
        if word in name:
            return COLOR_KEYWORDS[word]

    return None


def _gather_video_files(video_dir: Path, candidates: Optional[Iterable[str]]) -> list[Path]:
    resolved: list[Path] = []
    if candidates:
        for candidate in candidates:
            candidate_path = Path(candidate)
            if not candidate_path.is_absolute():
                candidate_path = video_dir / candidate_path
            if not candidate_path.exists() or not candidate_path.is_file():
                print(f"[WARN] 指定された動画ファイルが見つかりません: {candidate_path}")
                continue
            resolved.append(candidate_path.resolve())
    else:
        if not video_dir.exists():
            print(f"[WARN] 動画ディレクトリが存在しません: {video_dir}")
            return resolved
        for entry in sorted(video_dir.iterdir()):
            if entry.is_file() and entry.suffix.lower() in {".mp4", ".avi", ".mov", ".mkv"}:
                resolved.append(entry.resolve())
    return resolved


def _build_override_map(overrides: Optional[dict[str, str]]) -> dict[Path, str]:
    if not overrides:
        return {}
    result: dict[Path, str] = {}
    for raw_path, value in overrides.items():
        path_obj = Path(raw_path).expanduser()
        abs_path = Path(os.path.abspath(str(path_obj)))
        result[abs_path.resolve(strict=False)] = value
    return result


def _create_video_task(video_path: Path, result_dir: Path) -> VideoTask:
    base_name = video_path.stem
    output_dir = result_dir / base_name
    frames_dir = output_dir / "frames"
    crops_dir = output_dir / "crops"
    csv_path = output_dir / f"{base_name}.csv"
    corrections_csv = output_dir / "corrections.csv"
    return VideoTask(
        source_path=video_path,
        base_name=base_name,
        output_dir=output_dir,
        frames_dir=frames_dir,
        crops_dir=crops_dir,
        csv_path=csv_path,
        corrections_csv=corrections_csv,
    )


def _decide_item_color(task: VideoTask, overrides: dict[Path, str]) -> Optional[str]:
    override = overrides.get(task.source_path)
    if override is not None:
        return None if override == "none" else override
    return detect_item_color(task.base_name)


def _process_single_video(
    task: VideoTask,
    *,
    ocr_upsample: float,
    override_colors: dict[Path, str],
    save_full_frames: bool,
    csv_column_visibility: Optional[dict[str, object]],
    report: Callable[[str], None],
    advance_report: Callable[[str], None],
) -> dict[str, str]:
    task.output_dir.mkdir(parents=True, exist_ok=True)
    if save_full_frames:
        task.frames_dir.mkdir(exist_ok=True)
    task.crops_dir.mkdir(exist_ok=True)

    video_name = task.source_path.name
    print(f"[PROCESSING] {video_name} を処理中...")

    report(f"{video_name} のフレーム抽出中...")
    extract_and_crop(
        str(task.source_path),
        frame_dir=str(task.frames_dir),
        crop_dir=str(task.crops_dir),
        save_full_frames=save_full_frames,
    )
    advance_report(f"{video_name} のフレーム抽出完了")

    item_color = _decide_item_color(task, override_colors)

    report(f"{video_name} のOCR/マッチング中...")
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
    advance_report(f"{video_name} のOCR/マッチング完了")
    print(f"[✓] {task.crops_dir} の結果を {task.csv_path} に出力しました")

    result_dir = task.output_dir.parent
    return {
        "label": task.base_name,
        "csv": os.path.relpath(task.csv_path, result_dir),
        "img_dir": os.path.relpath(task.crops_dir, result_dir),
        "folder": os.path.relpath(task.output_dir, result_dir),
    }


def main(
    video_dir=VIDEO_DIR,
    result_dir=DEFAULT_RESULT_DIR,
    ocr_upsample=OCR_UPSAMPLE,
    progress_callback: Optional[Callable[[int, int, str], None]] = None,
    video_files: Optional[list[str]] = None,
    item_color_overrides: Optional[dict[str, str]] = None,
    save_full_frames: bool = False,
    csv_column_visibility: Optional[dict[str, object]] = None,
) -> None:
    start_time = time.time()
    print("[INFO] 動画ごとの処理開始...")

    result_dir_path = Path(result_dir)
    result_dir_path.mkdir(parents=True, exist_ok=True)

    master_src = templates_path("master_relics.csv")
    master_options = load_master_csv(master_src)
    dataset_entries: list[dict[str, str]] = []

    video_dir_path = Path(video_dir)
    selected_videos = _gather_video_files(video_dir_path, video_files)
    override_map = _build_override_map(item_color_overrides)

    total_steps = len(selected_videos) * 2 + 1 if selected_videos else 1
    current_step = 0

    def report(message: str) -> None:
        if progress_callback:
            try:
                progress_callback(current_step, total_steps, message)
            except Exception as callback_err:  # pragma: no cover - 通知失敗は致命的でない
                print(f"[WARN] プログレス更新に失敗しました: {callback_err}")

    def advance(message: str) -> None:
        nonlocal current_step
        current_step = min(current_step + 1, total_steps)
        report(message)

    report("動画処理を準備中...")

    if not selected_videos:
        print("[WARN] 処理対象の動画が見つかりません。")
        report("処理対象の動画が見つかりませんでした")

    for video_path in selected_videos:
        task = _create_video_task(video_path, result_dir_path)
        entry = _process_single_video(
            task,
            ocr_upsample=ocr_upsample,
            override_colors=override_map,
            save_full_frames=save_full_frames,
            csv_column_visibility=csv_column_visibility,
            report=report,
            advance_report=advance,
        )
        dataset_entries.append(entry)

    default_csv_path = (
        (result_dir_path / dataset_entries[0]["csv"]).resolve()
        if dataset_entries
        else (result_dir_path / "results.csv")
    )
    default_img_dir = dataset_entries[0]["img_dir"] if dataset_entries else ""

    viewer_path = result_dir_path / "viewer.html"
    report("HTML を生成中...")
    generate_html(
        str(default_csv_path),
        default_img_dir,
        str(viewer_path),
        master_csv_path=None,
        master_json_path="",
        master_options=master_options,
        datasets=dataset_entries,
        active_dataset_index=0,
    )

    advance("全処理完了")
    elapsed = time.time() - start_time
    print(f"[✓] 全処理完了！処理時間: {elapsed:.2f}秒")


if __name__ == "__main__":
    main()

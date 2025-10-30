"""タスク生成とアイテム色推定ロジック."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional


COLOR_KEYWORDS = {
    "red": "red",
    "green": "green",
    "blue": "blue",
    "yellow": "yellow",
    "赤": "red",
    "緑": "green",
    "青": "blue",
    "黄": "yellow",
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

    for word in ("赤", "緑", "青", "黄"):
        if word in name:
            return COLOR_KEYWORDS[word]

    return None


def create_video_task(video_path: Path, result_dir: Path) -> VideoTask:
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


def create_tasks(video_paths: Iterable[Path], result_dir: Path) -> list[VideoTask]:
    return [create_video_task(path, result_dir) for path in video_paths]


def decide_item_color(task: VideoTask, overrides: dict[Path, str]) -> Optional[str]:
    override = overrides.get(task.source_path)
    if override is not None:
        return None if override == "none" else override
    return detect_item_color(task.base_name)

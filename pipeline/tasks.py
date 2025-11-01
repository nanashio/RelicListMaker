"""タスク生成とアイテム色推定ロジック."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Mapping, Optional


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


DEFAULT_RELIC_TYPE = "normal"
RELIC_TYPE_DEEP = "deep"
_RELIC_TYPE_KEYWORDS = (
    "deep",
    "深層",
    "深淵",
)


@dataclass(frozen=True)
class VideoTask:
    source_path: Path
    base_name: str
    output_dir: Path
    frames_dir: Path
    crops_dir: Path
    csv_path: Path
    corrections_csv: Path
    relic_type: str = DEFAULT_RELIC_TYPE


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


def create_video_task(video_path: Path | str, result_dir: Path | str) -> VideoTask:
    source_path = Path(video_path).expanduser()
    if source_path.is_absolute():
        source_path = source_path.resolve()
    else:
        source_path = (Path.cwd() / source_path).resolve()

    result_root = Path(result_dir).expanduser()
    if result_root.is_absolute():
        result_root = result_root.resolve(strict=False)
    else:
        result_root = (Path.cwd() / result_root).resolve(strict=False)

    base_name = source_path.stem
    output_dir = result_root / base_name
    frames_dir = output_dir / "frames"
    crops_dir = output_dir / "crops"
    csv_path = output_dir / f"{base_name}.csv"
    corrections_csv = output_dir / "corrections.csv"
    return VideoTask(
        source_path=source_path,
        base_name=base_name,
        output_dir=output_dir,
        frames_dir=frames_dir,
        crops_dir=crops_dir,
        csv_path=csv_path,
        corrections_csv=corrections_csv,
        relic_type=detect_relic_type(base_name),
    )


def create_tasks(video_paths: Iterable[Path | str], result_dir: Path | str) -> list[VideoTask]:
    return [create_video_task(path, result_dir) for path in video_paths]


def decide_item_color(task: VideoTask, overrides: Mapping[Path, str]) -> Optional[str]:
    override = overrides.get(task.source_path)
    if override is not None:
        return None if override == "none" else override
    return detect_item_color(task.base_name)


def normalize_relic_type(value: Optional[str]) -> str:
    if value is None:
        return DEFAULT_RELIC_TYPE
    text = str(value).strip()
    if not text:
        return DEFAULT_RELIC_TYPE
    lowered = text.casefold()
    if lowered in {RELIC_TYPE_DEEP, DEFAULT_RELIC_TYPE}:
        return lowered
    if any(keyword in lowered for keyword in _RELIC_TYPE_KEYWORDS):
        return RELIC_TYPE_DEEP
    if any(keyword in text for keyword in ("深層遺物", "深層")):
        return RELIC_TYPE_DEEP
    return DEFAULT_RELIC_TYPE


def detect_relic_type(name: str) -> str:
    if not name:
        return DEFAULT_RELIC_TYPE
    lowered = name.casefold()
    if any(keyword in lowered for keyword in _RELIC_TYPE_KEYWORDS):
        return RELIC_TYPE_DEEP
    if "深層" in name:
        return RELIC_TYPE_DEEP
    return DEFAULT_RELIC_TYPE

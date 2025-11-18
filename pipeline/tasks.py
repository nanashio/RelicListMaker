"""タスク生成とアイテム色推定ロジック."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Mapping, Optional, Set


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


def _normalize_source_path(video_path: Path | str) -> Path:
    source_path = Path(video_path).expanduser()
    if source_path.is_absolute():
        return source_path.resolve()
    return (Path.cwd() / source_path).resolve()


def _normalize_result_root(result_dir: Path | str) -> Path:
    result_root = Path(result_dir).expanduser()
    if result_root.is_absolute():
        return result_root.resolve(strict=False)
    return (Path.cwd() / result_root).resolve(strict=False)


def _ensure_unique_base_name(
    base_name: str, result_root: Path, used_names: Optional[Set[str]] = None
) -> str:
    """結果ディレクトリや同一バッチ内での重複を避けるための名称を決定する."""

    assigned_names: Set[str]
    if used_names is None:
        assigned_names = set()
    else:
        assigned_names = used_names

    candidate = base_name
    suffix = 2
    while True:
        output_dir = result_root / candidate
        if candidate not in assigned_names and not output_dir.exists():
            assigned_names.add(candidate)
            return candidate
        candidate = f"{base_name}_{suffix}"
        suffix += 1


def create_video_task(
    video_path: Path | str,
    result_dir: Path | str,
    *,
    used_names: Optional[Set[str]] = None,
) -> VideoTask:
    source_path = _normalize_source_path(video_path)
    result_root = _normalize_result_root(result_dir)

    original_base_name = source_path.stem
    base_name = _ensure_unique_base_name(original_base_name, result_root, used_names)
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
        relic_type=detect_relic_type(original_base_name),
    )


def create_tasks(video_paths: Iterable[Path | str], result_dir: Path | str) -> list[VideoTask]:
    result_root = _normalize_result_root(result_dir)
    used_names: Set[str] = set()
    tasks: list[VideoTask] = []
    for path in video_paths:
        task = create_video_task(path, result_root, used_names=used_names)
        tasks.append(task)
    return tasks


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

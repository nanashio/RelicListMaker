"""入力収集および設定正規化ロジック."""
from __future__ import annotations

from pathlib import Path
from typing import Iterable, Optional


_VIDEO_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv"}


def _ensure_absolute(path: Path) -> Path:
    if path.is_absolute():
        return path.resolve(strict=False)
    return (Path.cwd() / path).resolve(strict=False)


def gather_video_files(
    video_dir: Path | str,
    candidates: Optional[Iterable[str | Path]],
) -> list[Path]:
    """動画ファイルのリストを解決して返す."""
    video_dir_path = Path(video_dir)
    if not video_dir_path.is_absolute():
        video_dir_path = (Path.cwd() / video_dir_path).resolve(strict=False)
    else:
        video_dir_path = video_dir_path.resolve(strict=False)

    resolved: list[Path] = []
    if candidates:
        for candidate in candidates:
            candidate_path = Path(candidate).expanduser()
            if not candidate_path.is_absolute():
                candidate_path = (video_dir_path / candidate_path).resolve(strict=False)
            else:
                candidate_path = candidate_path.resolve(strict=False)
            if not candidate_path.exists() or not candidate_path.is_file():
                print(f"[WARN] 指定された動画ファイルが見つかりません: {candidate_path}")
                continue
            resolved.append(candidate_path)
    else:
        if not video_dir_path.exists():
            print(f"[WARN] 動画ディレクトリが存在しません: {video_dir_path}")
            return resolved
        for entry in sorted(video_dir_path.iterdir()):
            if entry.is_file() and entry.suffix.lower() in _VIDEO_EXTENSIONS:
                resolved.append(entry.resolve(strict=False))
    return resolved


def build_override_map(overrides: Optional[dict[str | Path, str]]) -> dict[Path, str]:
    """UI などから渡された色上書き設定を絶対パスへ正規化する."""
    if not overrides:
        return {}

    result: dict[Path, str] = {}
    for raw_path, value in overrides.items():
        path_obj = Path(raw_path).expanduser()
        result[_ensure_absolute(path_obj)] = value
    return result

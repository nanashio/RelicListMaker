"""入力収集および設定正規化ロジック."""
from __future__ import annotations

from pathlib import Path
from typing import Iterable, Optional


_VIDEO_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv"}


def gather_video_files(video_dir: Path, candidates: Optional[Iterable[str]]) -> list[Path]:
    """動画ファイルのリストを解決して返す."""
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
            if entry.is_file() and entry.suffix.lower() in _VIDEO_EXTENSIONS:
                resolved.append(entry.resolve())
    return resolved


def build_override_map(overrides: Optional[dict[str, str]]) -> dict[Path, str]:
    """UI などから渡された色上書き設定を絶対パスへ正規化する."""
    if not overrides:
        return {}

    result: dict[Path, str] = {}
    for raw_path, value in overrides.items():
        path_obj = Path(raw_path).expanduser()
        abs_path = path_obj if path_obj.is_absolute() else (Path.cwd() / path_obj)
        result[abs_path.resolve(strict=False)] = value
    return result

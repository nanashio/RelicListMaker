"""結果ディレクトリ内のデータセット検出ヘルパー."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional, Sequence

from .constants import DEFAULT_IMAGE_DIR_NAME


@dataclass(frozen=True)
class DatasetRecord:
    """統合対象となる既存データセットのメタ情報."""

    folder: Path
    csv_path: Path
    images_dir: Path

    @property
    def label(self) -> str:
        return self.folder.name


def _iter_dataset_dirs(results_dir: Path) -> Iterable[Path]:
    for entry in sorted(results_dir.iterdir()):
        if entry.name.startswith("."):
            continue
        if entry.is_dir():
            yield entry


def _prefer_review_csv(csv_files: Sequence[Path], dataset_name: str) -> Optional[Path]:
    if not csv_files:
        return None

    review_candidates = [path for path in csv_files if path.stem.endswith("_review")]
    if review_candidates:
        return sorted(review_candidates)[-1]

    expected = dataset_name + ".csv"
    for path in csv_files:
        if path.name == expected:
            return path

    return sorted(csv_files)[0]


def _resolve_dataset(folder: Path) -> Optional[DatasetRecord]:
    csv_candidates = [
        path
        for path in folder.glob("*.csv")
        if path.name.lower() != "corrections.csv"
    ]
    csv_path = _prefer_review_csv(csv_candidates, folder.name)
    if not csv_path:
        print(f"[WARN] CSVが見つからないためスキップします: {folder}")
        return None

    images_dir = folder / DEFAULT_IMAGE_DIR_NAME
    if not images_dir.exists():
        print(f"[WARN] 画像ディレクトリが存在しません: {images_dir}")
        return None

    return DatasetRecord(folder=folder, csv_path=csv_path, images_dir=images_dir)


def _is_merged_dir_name(name: str, base_name: str) -> bool:
    if name == base_name:
        return True
    if not name.startswith(f"{base_name}_"):
        return False
    suffix = name[len(base_name) + 1 :]
    return suffix.isdigit()


def _select_output_dir(root: Path, base_name: str) -> Path:
    """既存ディレクトリを保持したまま、書き込み先ディレクトリを決定する."""

    candidate = root / base_name
    if not candidate.exists():
        return candidate

    index = 1
    while True:
        candidate = root / f"{base_name}_{index}"
        if not candidate.exists():
            return candidate
        index += 1


def collect_datasets(root: Path, target_name: str) -> list[DatasetRecord]:
    """統合対象となるデータセットを列挙する."""

    datasets: list[DatasetRecord] = []
    for folder in _iter_dataset_dirs(root):
        if _is_merged_dir_name(folder.name, target_name):
            continue
        dataset = _resolve_dataset(folder)
        if dataset:
            datasets.append(dataset)
    return datasets


__all__ = [
    "DatasetRecord",
    "_iter_dataset_dirs",
    "_prefer_review_csv",
    "_resolve_dataset",
    "_is_merged_dir_name",
    "_select_output_dir",
    "collect_datasets",
]

"""Utilities for converting processed video outputs into gallery datasets."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping


def _ensure_path(value: Path | str) -> Path:
    path = Path(value)
    if not path.is_absolute():
        path = (Path.cwd() / path).resolve(strict=False)
    else:
        path = path.resolve(strict=False)
    return path


def _safe_relpath(path: Path, base_dir: Path) -> str:
    try:
        return path.relative_to(base_dir).as_posix()
    except ValueError:
        try:
            return Path(os.path.relpath(path, base_dir)).as_posix()
        except ValueError:
            return path.name


def _normalize_label(label: str | None, csv_path: Path, output_dir: Path) -> str:
    text = (label or "").strip()
    if text:
        return text
    if csv_path.stem:
        return csv_path.stem
    if output_dir.name:
        return output_dir.name
    return "Dataset"


def _merge_metadata(entry: dict[str, Any], metadata: Mapping[str, Any] | None) -> None:
    if not metadata:
        return
    protected_keys = {"csv", "img_dir", "folder"}
    for key, value in metadata.items():
        if key in protected_keys:
            continue
        entry[key] = value


@dataclass(frozen=True)
class ProcessedVideoResult:
    """Represents the output artifacts generated for a single processed video."""

    label: str
    csv_path: Path
    crops_dir: Path
    output_dir: Path
    relic_type: str | None = None
    metadata: Mapping[str, Any] | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "csv_path", _ensure_path(self.csv_path))
        object.__setattr__(self, "crops_dir", _ensure_path(self.crops_dir))
        object.__setattr__(self, "output_dir", _ensure_path(self.output_dir))
        cleaned_label = str(self.label) if self.label is not None else ""
        object.__setattr__(self, "label", cleaned_label)
        if self.metadata is not None and not isinstance(self.metadata, Mapping):
            raise TypeError("metadata must be a mapping if provided")


@dataclass(frozen=True)
class DatasetBuildResult:
    """Result of translating processed videos into gallery dataset descriptors."""

    datasets: list[dict[str, Any]]
    default_csv_path: Path
    default_img_dir: str
    active_index: int


def build_dataset_entries(
    base_dir: Path | str,
    results: Iterable[ProcessedVideoResult],
    *,
    default_csv_name: str = "results.csv",
    active_index: int = 0,
) -> DatasetBuildResult:
    """Create dataset descriptors and defaults for gallery generation."""
    base_path = _ensure_path(base_dir)

    dataset_entries: list[dict[str, Any]] = []
    for result in results:
        csv_path = result.csv_path
        crops_dir = result.crops_dir
        output_dir = result.output_dir

        label = _normalize_label(result.label, csv_path, output_dir)
        csv_rel = _safe_relpath(csv_path, base_path)
        img_rel = _safe_relpath(crops_dir, base_path)
        folder_rel = _safe_relpath(output_dir, base_path)

        entry: dict[str, Any] = {
            "label": label,
            "csv": csv_rel,
            "img_dir": img_rel,
            "folder": folder_rel,
        }

        if result.relic_type:
            entry["relic_type"] = str(result.relic_type).strip().lower()

        _merge_metadata(entry, result.metadata)
        dataset_entries.append(entry)

    if dataset_entries:
        normalized_index = max(0, min(active_index, len(dataset_entries) - 1))
        default_entry = dataset_entries[normalized_index]
        default_csv = _ensure_path(base_path / default_entry["csv"])
        default_img_dir = default_entry.get("img_dir", "") or ""
    else:
        normalized_index = -1
        default_csv = _ensure_path(base_path / default_csv_name)
        default_img_dir = ""

    return DatasetBuildResult(
        datasets=dataset_entries,
        default_csv_path=default_csv,
        default_img_dir=default_img_dir,
        active_index=normalized_index,
    )

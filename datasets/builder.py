"""Utilities for converting processed video outputs into gallery datasets."""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from html import unescape
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


def _parse_int(value: str, default: int = -1) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


_DATASETS_ATTR_RE = re.compile(r"data-datasets=\"([^\"]*)\"")
_ACTIVE_DATASET_RE = re.compile(r"data-active-dataset=\"([^\"]*)\"")
_KNOWN_MERGED_KINDS = {"merged", "merged_csv"}


def _normalize_dataset_entries(
    raw_entries: Any, viewer_dir: Path, base_dir: Path
) -> list[dict[str, Any]]:
    normalized_entries: list[dict[str, Any]] = []
    if not isinstance(raw_entries, list):
        return normalized_entries

    for raw_entry in raw_entries:
        if not isinstance(raw_entry, dict):
            continue

        kind = str(raw_entry.get("kind") or "").strip().lower()
        if kind in _KNOWN_MERGED_KINDS:
            continue

        csv_text = (
            raw_entry.get("csv")
            or raw_entry.get("results")
            or raw_entry.get("results_csv")
            or raw_entry.get("resultsCsv")
            or ""
        )
        csv_str = str(csv_text).strip()
        if not csv_str:
            continue

        csv_abs = _ensure_path((viewer_dir / csv_str).resolve())
        csv_rel = _safe_relpath(csv_abs, base_dir)

        img_text = (
            raw_entry.get("imgDir")
            or raw_entry.get("img_dir")
            or raw_entry.get("images")
            or raw_entry.get("image_dir")
            or ""
        )
        img_str = str(img_text).strip()
        img_rel = ""
        if img_str:
            img_abs = _ensure_path((viewer_dir / img_str).resolve())
            img_rel = _safe_relpath(img_abs, base_dir)

        folder_text = raw_entry.get("folder") or ""
        folder_str = str(folder_text).strip()
        folder_rel = ""
        if folder_str:
            folder_abs = _ensure_path((viewer_dir / folder_str).resolve())
            folder_rel = _safe_relpath(folder_abs, base_dir)

        label_text = raw_entry.get("label") or raw_entry.get("name") or ""
        label = str(label_text).strip()
        if not label:
            label = _normalize_label(None, csv_abs, csv_abs.parent)

        entry: dict[str, Any] = {
            "label": label,
            "csv": csv_rel,
            "img_dir": img_rel,
            "folder": folder_rel,
            "_abs_csv_path": csv_abs,
        }

        relic_type = raw_entry.get("relicType") or raw_entry.get("relic_type")
        if isinstance(relic_type, str) and relic_type.strip():
            entry["relic_type"] = relic_type.strip().lower()

        if kind:
            entry["kind"] = raw_entry.get("kind")

        for key, value in raw_entry.items():
            if key in {
                "label",
                "name",
                "csv",
                "results",
                "results_csv",
                "resultsCsv",
                "imgDir",
                "img_dir",
                "images",
                "image_dir",
                "folder",
                "kind",
                "relicType",
                "relic_type",
            }:
                continue
            entry[key] = value

        normalized_entries.append(entry)

    return normalized_entries


def _load_datasets_from_bootstrap_json(
    viewer_dir: Path, base_dir: Path
) -> tuple[list[dict[str, Any]], int] | None:
    bootstrap_path = viewer_dir / "gallery_data.json"
    if not bootstrap_path.exists():
        return None

    try:
        data = json.loads(bootstrap_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None

    if not isinstance(data, dict):
        return None

    entries = _normalize_dataset_entries(data.get("datasets"), viewer_dir, base_dir)
    active_index = _parse_int(data.get("activeDataset"), -1)
    return entries, active_index


def _load_datasets_from_index_html(
    viewer_dir: Path, base_dir: Path
) -> tuple[list[dict[str, Any]], int]:
    viewer_path = viewer_dir / "index.html"
    if not viewer_path.exists():
        return [], -1

    try:
        html_text = viewer_path.read_text(encoding="utf-8")
    except OSError:
        return [], -1

    datasets_match = _DATASETS_ATTR_RE.search(html_text)
    if not datasets_match:
        return [], -1

    try:
        datasets_json = json.loads(unescape(datasets_match.group(1)))
    except json.JSONDecodeError:
        return [], -1

    normalized_entries = _normalize_dataset_entries(datasets_json, viewer_dir, base_dir)

    active_match = _ACTIVE_DATASET_RE.search(html_text)
    active_index = -1
    if active_match:
        active_index = _parse_int(unescape(active_match.group(1)), -1)

    return normalized_entries, active_index


def _load_existing_gallery_state(base_dir: Path) -> tuple[list[dict[str, Any]], int]:
    """Extract dataset descriptors stored in an existing gallery output."""

    viewer_dir = base_dir / "gallery"

    bootstrap_state = _load_datasets_from_bootstrap_json(viewer_dir, base_dir)
    if bootstrap_state is not None:
        return bootstrap_state

    return _load_datasets_from_index_html(viewer_dir, base_dir)


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
    processed_results = list(results)

    existing_entries, existing_active = _load_existing_gallery_state(base_path)
    combined_entries: list[dict[str, Any]] = list(existing_entries)

    index_by_csv: dict[Path, int] = {}
    for index, entry in enumerate(combined_entries):
        abs_path = entry.get("_abs_csv_path")
        if isinstance(abs_path, Path):
            index_by_csv[abs_path] = index

    new_entries: list[dict[str, Any]] = []
    for result in processed_results:
        csv_path = _ensure_path(result.csv_path)
        crops_dir = _ensure_path(result.crops_dir)
        output_dir = _ensure_path(result.output_dir)

        label = _normalize_label(result.label, csv_path, output_dir)
        csv_rel = _safe_relpath(csv_path, base_path)
        img_rel = _safe_relpath(crops_dir, base_path)
        folder_rel = _safe_relpath(output_dir, base_path)

        entry: dict[str, Any] = {
            "label": label,
            "csv": csv_rel,
            "img_dir": img_rel,
            "folder": folder_rel,
            "_abs_csv_path": csv_path,
        }

        if result.relic_type:
            entry["relic_type"] = str(result.relic_type).strip().lower()

        _merge_metadata(entry, result.metadata)

        if csv_path in index_by_csv:
            target_index = index_by_csv[csv_path]
            combined_entries[target_index] = entry
        else:
            index_by_csv[csv_path] = len(combined_entries)
            combined_entries.append(entry)

        new_entries.append(entry)

    normalized_index = -1
    if new_entries:
        requested_index = max(0, min(active_index, len(new_entries) - 1))
        target_entry = new_entries[requested_index]
        abs_path = target_entry.get("_abs_csv_path")
        if isinstance(abs_path, Path):
            normalized_index = index_by_csv.get(abs_path, -1)

    if normalized_index < 0 and combined_entries:
        normalized_index = existing_active if 0 <= existing_active < len(combined_entries) else 0

    if normalized_index >= 0:
        default_entry = combined_entries[normalized_index]
        default_csv = _ensure_path(base_path / default_entry["csv"])
        default_img_dir = default_entry.get("img_dir", "") or ""
    else:
        default_csv = _ensure_path(base_path / default_csv_name)
        default_img_dir = ""

    for entry in combined_entries:
        entry.pop("_abs_csv_path", None)

    return DatasetBuildResult(
        datasets=combined_entries,
        default_csv_path=default_csv,
        default_img_dir=default_img_dir,
        active_index=normalized_index,
    )

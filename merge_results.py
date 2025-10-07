"""結果ディレクトリ内の複数データセットを統合するユーティリティ."""
from __future__ import annotations

import csv
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional, Sequence

from generate_gallery import generate_html
from resource_paths import templates_path

MERGED_DIR_NAME = "merged"
MERGED_CSV_NAME = "merged.csv"
DEFAULT_IMAGE_DIR_NAME = "crops"
EXTRA_FIELD_PREFIXES: Sequence[str] = ("Effect", "RawText")
_REVIEWED_STATUSES = {"pass", "corrected"}


@dataclass(frozen=True)
class DatasetRecord:
    """統合対象となる既存データセットのメタ情報."""

    folder: Path
    csv_path: Path
    images_dir: Path

    @property
    def label(self) -> str:
        return self.folder.name


class MergeResultsError(RuntimeError):
    """統合処理中のエラー."""


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


def _is_merged_dir_name(name: str, base_name: str) -> bool:
    if name == base_name:
        return True
    if not name.startswith(f"{base_name}_"):
        return False
    suffix = name[len(base_name) + 1 :]
    return suffix.isdigit()


def _collect_existing_merged_entries(root: Path, base_name: str) -> list[dict[str, str]]:
    """ビューワに掲載する既存統合結果のメタデータを収集する."""

    collected: list[tuple[int, dict[str, str]]] = []
    for folder in _iter_dataset_dirs(root):
        if not _is_merged_dir_name(folder.name, base_name):
            continue
        csv_path = folder / MERGED_CSV_NAME
        images_dir = folder / DEFAULT_IMAGE_DIR_NAME
        if not csv_path.exists() or not images_dir.exists():
            continue
        if folder.name == base_name:
            order = 0
        else:
            suffix_text = folder.name[len(base_name) + 1 :]
            order = int(suffix_text) + 1 if suffix_text.isdigit() else 1
        label = "統合結果" if folder.name == base_name else f"統合結果 ({folder.name})"
        collected.append(
            (
                order,
                {
                    "label": label,
                    "csv": csv_path.relative_to(root).as_posix(),
                    "img_dir": images_dir.relative_to(root).as_posix(),
                    "folder": folder.name,
                    "kind": "merged_csv",
                },
            )
        )
    collected.sort(key=lambda item: item[0])
    return [entry for _, entry in collected]


def _is_duplicate(value: object) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(int(value))
    text = str(value).strip().lower()
    if not text:
        return False
    return text in {"true", "1", "yes", "y", "duplicate", "dup", "t"}


def _safe_filename(base: str) -> str:
    sanitized = [char if char.isalnum() or char in {"_", "-"} else "_" for char in base]
    text = "".join(sanitized)
    return text or "image"


def _copy_image(source: Path, destination_dir: Path, dataset_prefix: str, counter: int) -> str:
    prefix = _safe_filename(dataset_prefix)
    dest_name = f"{prefix}_{counter:05d}{source.suffix.lower()}"
    dest_path = destination_dir / dest_name
    shutil.copy2(source, dest_path)
    return dest_name


def _collect_field_order(rows: list[dict[str, object]]) -> list[str]:
    order: list[str] = []
    reserved = [
        "Image",
        "BaseImage",
        "Dataset",
        "DatasetFolder",
        "SourceCsv",
        "SourceImage",
        "Duplicate",
        "ItemColor",
    ]

    def register(name: str) -> None:
        if name and name not in order:
            order.append(name)

    for field in reserved:
        register(field)

    extra_fields: set[str] = set()
    for row in rows:
        for key in row.keys():
            if key in reserved:
                continue
            for prefix in EXTRA_FIELD_PREFIXES:
                if key.startswith(prefix):
                    extra_fields.add(key)
                    break
            else:
                register(key)

    for key in sorted(extra_fields, key=lambda value: (value.rstrip("0123456789"), value)):
        register(key)

    return order


def _resolve_image_path(record: dict[str, object], dataset: DatasetRecord) -> Optional[Path]:
    raw_value = record.get("Image")
    if not raw_value:
        return None
    path_str = str(raw_value).strip()
    if not path_str:
        return None

    candidate = Path(path_str)
    if candidate.is_absolute() and candidate.exists():
        return candidate

    relative_path = dataset.folder / candidate
    if relative_path.exists():
        return relative_path

    crops_path = dataset.images_dir / candidate.name
    if crops_path.exists():
        return crops_path

    print(f"[WARN] 画像ファイルが見つかりません: {path_str} ({dataset.folder})")
    return None


def _normalize_effect_status(value: object) -> str:
    if value is None:
        return "pending"
    text = str(value).strip().lower()
    if not text:
        return "pending"
    if text in _REVIEWED_STATUSES:
        return text
    if text in {"fail", "failed", "ng", "reject", "rejected", "x"}:
        return "pending"
    return text


def _slot_has_content(row: dict[str, object], slot: int) -> bool:
    effect_key = f"Effect{slot}"
    raw_key = f"RawText{slot}"
    score_key = f"Effect{slot}Score"
    correction_key = f"Effect{slot}Correction"
    for key in (effect_key, raw_key, correction_key, score_key):
        if key not in row:
            continue
        value = row.get(key)
        if value is None:
            continue
        if isinstance(value, str):
            if value.strip():
                return True
        else:
            return True
    return False


def _has_all_effects_reviewed(row: dict[str, object]) -> bool:
    slots: list[int] = []
    for key in row.keys():
        if not key.startswith("Effect") or not key.endswith("Status"):
            continue
        slot_text = key[len("Effect") : -len("Status")]
        if not slot_text.isdigit():
            continue
        slot = int(slot_text)
        if not _slot_has_content(row, slot):
            continue
        slots.append(slot)

    if not slots:
        return False

    for slot in slots:
        status = _normalize_effect_status(row.get(f"Effect{slot}Status"))
        if status not in _REVIEWED_STATUSES:
            return False
    return True


def merge_results(
    results_dir: str | Path,
    target_name: str = MERGED_DIR_NAME,
    *,
    only_reviewed: bool = True,
) -> Path:
    """results/ 配下のデータセットを統合し、新しいディレクトリに出力する.

    Args:
        results_dir: 統合元の results ディレクトリ.
        target_name: 統合結果を書き出すサブディレクトリ名.
        only_reviewed: 効果ステータスがすべてレビュー済みの行のみ統合するかどうか.
    """

    root = Path(results_dir).resolve()
    if not root.exists():
        raise MergeResultsError(f"結果ディレクトリが見つかりません: {root}")

    datasets: list[DatasetRecord] = []
    for folder in _iter_dataset_dirs(root):
        if _is_merged_dir_name(folder.name, target_name):
            continue
        dataset = _resolve_dataset(folder)
        if dataset:
            datasets.append(dataset)

    if not datasets:
        raise MergeResultsError("統合対象のデータセットが見つかりませんでした")

    merged_dir = _select_output_dir(root, target_name)
    if merged_dir.name != target_name:
        print(f"[INFO] 既存の統合結果を保持するため {merged_dir.name} に書き出します")
    merged_dir.mkdir(parents=True, exist_ok=False)
    crops_dir = merged_dir / DEFAULT_IMAGE_DIR_NAME
    crops_dir.mkdir(parents=True, exist_ok=False)

    merged_rows: list[dict[str, object]] = []
    source_entries: list[dict[str, str]] = []

    for dataset in datasets:
        print(f"[INFO] データセット統合中: {dataset.folder}")
        try:
            with dataset.csv_path.open("r", encoding="utf-8") as handle:
                reader = csv.DictReader(handle)
                if not reader.fieldnames or "Image" not in reader.fieldnames:
                    print(f"[WARN] Image列が存在しません: {dataset.csv_path}")
                    continue

                for row_index, row in enumerate(reader, start=1):
                    if _is_duplicate(row.get("Duplicate")):
                        continue
                    if only_reviewed and not _has_all_effects_reviewed(row):
                        print(
                            "[INFO] レビュー未完了のためスキップします:",
                            f"{dataset.csv_path} #{row_index}",
                        )
                        continue
                    image_path = _resolve_image_path(row, dataset)
                    if not image_path:
                        continue

                    dest_name = _copy_image(image_path, crops_dir, dataset.label, row_index)
                    merged_row: dict[str, object] = dict(row)
                    merged_row["Image"] = dest_name
                    merged_row["BaseImage"] = image_path.name
                    merged_row["Dataset"] = dataset.label
                    merged_row["DatasetFolder"] = dataset.folder.name
                    merged_row["SourceCsv"] = dataset.csv_path.relative_to(merged_dir.parent).as_posix()
                    merged_row["SourceImage"] = image_path.relative_to(dataset.folder).as_posix()
                    merged_row["Duplicate"] = False
                    merged_rows.append(merged_row)
        except OSError as err:
            print(f"[ERROR] CSVの読み込みに失敗しました: {dataset.csv_path} ({err})")
            continue

        source_entries.append(
            {
                "label": dataset.label,
                "csv": dataset.csv_path.relative_to(root).as_posix(),
                "imgDir": dataset.images_dir.relative_to(root).as_posix(),
                "folder": dataset.folder.name,
            }
        )

    if not merged_rows:
        raise MergeResultsError(
            "統合後に出力可能な行がありません。重複指定やレビュー状況を確認してください。"
        )

    field_order = _collect_field_order(merged_rows)
    merged_csv_path = merged_dir / MERGED_CSV_NAME

    with merged_csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=field_order)
        writer.writeheader()
        for row in merged_rows:
            writer.writerow({key: row.get(key, "") for key in field_order})

    print(f"[INFO] 統合CSVを出力しました: {merged_csv_path}")

    merged_entries = _collect_existing_merged_entries(root, target_name)
    active_dataset_index = 0
    for index, entry in enumerate(merged_entries):
        if entry.get("folder") == merged_dir.name:
            active_dataset_index = index
            break

    viewer_path = root / "viewer.html"
    generate_html(
        str(merged_csv_path),
        str(crops_dir.relative_to(root)),
        str(viewer_path),
        master_csv_path=None,
        master_json_path="",
        master_options=_load_master_options(),
        datasets=merged_entries + source_entries,
        active_dataset_index=active_dataset_index,
    )
    print(f"[INFO] ビューワを更新しました: {viewer_path}")

    return merged_dir

def _load_master_options() -> list[str]:
    master_csv = templates_path("master_relics.csv")
    options: list[str] = []
    seen: set[str] = set()
    if not master_csv.exists():
        print(f"[WARN] master_relics.csv が見つかりません: {master_csv}")
        return options

    try:
        with master_csv.open("r", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                value = (row.get("EffectBase") or "").strip()
                if value and value != "-" and value not in seen:
                    seen.add(value)
                    options.append(value)
    except OSError as err:
        print(f"[WARN] master_relics.csv の読み込みに失敗しました: {err}")
    return options

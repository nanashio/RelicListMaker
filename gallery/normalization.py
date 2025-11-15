"""ギャラリーデータ整形と正規化処理."""
from __future__ import annotations

import os
from typing import TYPE_CHECKING
from typing import Dict, Iterable, List, Optional, Sequence, Tuple, Protocol


if TYPE_CHECKING:
    from .config import GalleryConfig


class EffectLoader(Protocol):
    def __call__(self, path: str) -> Tuple[List[str], Dict[str, List[str]]]:
        ...


class MetadataLoader(Protocol):
    def __call__(self, path: str) -> Dict[str, Dict[str, object]]:
        ...


def sanitize_symbols(symbols: Optional[Sequence[object]]) -> List[str]:
    """ラベル用記号のNone・空文字を除去する."""

    cleaned: List[str] = []
    for symbol in symbols or []:
        if symbol is None:
            continue
        text = str(symbol)
        if text:
            cleaned.append(text)
    return cleaned


def resolve_label_symbols(
    symbols: Optional[Sequence[object]],
    fallback: Sequence[str],
    default: Optional[Sequence[str]] = None,
) -> List[str]:
    """入力記号を整形し、適切なフォールバックを選ぶ."""

    normalized = sanitize_symbols(symbols)
    if normalized:
        return normalized
    normalized = sanitize_symbols(fallback)
    if normalized:
        return normalized
    return list(default or ["①", "②", "③"])


def normalize_item_image_view_box(value: Optional[str], default: str) -> str:
    """CSSの `view-box` 風パラメータを安全な文字列に整える."""

    if value is None:
        return default
    text = str(value).strip()
    if not text:
        return default
    sanitized = text.replace("\r", " ").replace("\n", " ")
    if any(char in sanitized for char in {'"', "'", ';', '<', '>', '{', '}'}):
        return default
    if len(sanitized) > 200:
        sanitized = sanitized[:200]
    return sanitized


def normalize_dataset_entries(
    datasets,
    output_dir: str,
    *,
    base_dir: Optional[str] = None,
) -> List[dict]:
    """ギャラリー入力データセット定義を統一形式へ変換する."""

    if not datasets:
        return []

    output_dir_abs = os.path.abspath(output_dir) if output_dir else os.getcwd()
    candidate_bases: List[str] = []
    if base_dir:
        candidate_bases.append(os.path.abspath(base_dir))
    candidate_bases.append(output_dir_abs)

    seen: set[str] = set()
    ordered_bases: List[str] = []
    for candidate in candidate_bases:
        if candidate in seen:
            continue
        seen.add(candidate)
        ordered_bases.append(candidate)

    if not ordered_bases:
        ordered_bases.append(output_dir_abs)

    def _resolve_relative_path(path_value: str) -> str:
        if os.path.isabs(path_value):
            return path_value
        base = ordered_bases[0]
        return os.path.abspath(os.path.join(base, path_value))

    normalized: List[dict] = []
    for entry in datasets:
        if not entry:
            continue
        label = ""
        csv_path: Optional[str] = None
        img_dir: Optional[str] = None
        folder = ""
        relic_type = None

        if isinstance(entry, dict):
            raw_label = entry.get("label") or entry.get("name")
            if raw_label is not None:
                label = str(raw_label).strip()
            csv_path = entry.get("csv") or entry.get("results_csv") or entry.get("results")
            img_dir = entry.get("imgDir") or entry.get("img_dir") or entry.get("images") or entry.get("image_dir")
            folder = str(entry.get("folder") or "").strip()
            relic_type = entry.get("relicType") or entry.get("relic_type")
        elif isinstance(entry, (list, tuple)):
            if entry:
                csv_path = entry[0]
            if len(entry) > 1:
                img_dir = entry[1]
            if len(entry) > 2:
                label = str(entry[2]).strip()
        else:
            csv_path = entry

        if not csv_path:
            continue

        if os.path.isabs(str(csv_path)):
            csv_abs = str(csv_path)
        else:
            csv_abs = _resolve_relative_path(str(csv_path))
        try:
            csv_rel = os.path.relpath(csv_abs, output_dir_abs)
        except ValueError:
            csv_rel = os.path.basename(csv_abs)

        if not label:
            base_dirname = os.path.dirname(csv_rel)
            if folder:
                label = folder
            elif base_dirname:
                label = os.path.basename(base_dirname)
            else:
                label = os.path.splitext(os.path.basename(csv_rel))[0] or "Dataset"

        if not folder:
            folder = os.path.dirname(csv_rel)

        img_rel = ""
        if img_dir:
            if os.path.isabs(str(img_dir)):
                img_abs = str(img_dir)
            else:
                img_abs = _resolve_relative_path(str(img_dir))
            try:
                img_rel = os.path.relpath(img_abs, output_dir_abs)
            except ValueError:
                img_rel = str(img_dir)

        entry_data: dict[str, object] = {
            "label": label,
            "csv": csv_rel.replace(os.sep, "/"),
            "imgDir": img_rel.replace(os.sep, "/") if img_rel else "",
            "folder": folder.replace(os.sep, "/") if folder else "",
        }

        if isinstance(entry, dict):
            raw_kind = entry.get("kind")
            if isinstance(raw_kind, str) and raw_kind.strip():
                entry_data["kind"] = raw_kind.strip()
            if "sources" in entry:
                entry_data["sources"] = entry["sources"]
            if relic_type is not None:
                normalized_relic_type = normalize_relic_type_key(relic_type)
                if normalized_relic_type:
                    entry_data["relicType"] = normalized_relic_type

        normalized.append(entry_data)

    return normalized


def normalize_relic_type_key(value: Optional[str]) -> str:
    if value is None:
        return ""
    text = str(value).strip().lower()
    if not text:
        return ""
    if text in {"normal", "通常"}:
        return "normal"
    if text in {"deep", "深層", "深層遺物"}:
        return "deep"
    if text in {"merged", "all", "統合"}:
        return "merged"
    return text


def merge_level_maps(
    base: Optional[Dict[str, List[str]]],
    addition: Optional[Dict[str, List[str]]],
) -> Dict[str, List[str]]:
    merged: Dict[str, List[str]] = {}
    if base:
        for key, values in base.items():
            merged[key] = list(values)
    if not addition:
        return merged
    for key, values in addition.items():
        existing = merged.setdefault(key, [])
        for value in values:
            if value not in existing:
                existing.append(value)
    return merged


def merge_demerit_rules(
    base: Optional[Dict[str, Dict[str, object]]],
    addition: Optional[Dict[str, Dict[str, object]]],
) -> Dict[str, Dict[str, object]]:
    merged: Dict[str, Dict[str, object]] = {}
    if base:
        for key, value in base.items():
            if not isinstance(value, dict):
                continue
            has_demerit = bool(value.get("hasDemerit"))
            levels = value.get("levels")
            level_list: List[str] = []
            if isinstance(levels, list):
                level_list = [str(entry) for entry in levels if entry is not None]
            merged[key] = {"hasDemerit": has_demerit, "levels": level_list}
    if not addition:
        return merged
    for key, value in addition.items():
        if not isinstance(value, dict):
            continue
        has_demerit = bool(value.get("hasDemerit"))
        levels = value.get("levels")
        level_list: List[str] = []
        if isinstance(levels, list):
            level_list = [str(entry) for entry in levels if entry is not None]
        merged[key] = {"hasDemerit": has_demerit, "levels": level_list}
    return merged


def collect_master_data_by_type(
    dataset_entries: Sequence[dict],
    output_dir: str,
    *,
    config: "GalleryConfig",
    load_effects_and_levels: EffectLoader,
    load_metadata: MetadataLoader,
) -> Tuple[
    Dict[str, List[str]],
    Dict[str, Dict[str, List[str]]],
    Dict[str, str],
    Dict[str, List[str]],
    Dict[str, str],
    Dict[str, Dict[str, Dict[str, object]]],
]:
    """遺物種別ごとのマスター情報を収集する."""

    output_dir_abs = os.path.abspath(output_dir) if output_dir else os.getcwd()
    relic_types: set[str] = set(config.known_relic_types.keys())
    for entry in dataset_entries or []:
        if not isinstance(entry, dict):
            continue
        normalized = normalize_relic_type_key(entry.get("relicType") or entry.get("relic_type"))
        if normalized and normalized != "merged":
            relic_types.add(normalized)

    options_map: Dict[str, List[str]] = {}
    levels_map: Dict[str, Dict[str, List[str]]] = {}
    csv_map: Dict[str, str] = {}
    demerit_options_map: Dict[str, List[str]] = {}
    demerit_csv_map: Dict[str, str] = {}
    demerit_rules_map: Dict[str, Dict[str, Dict[str, object]]] = {}

    for relic_type in sorted(relic_types):
        candidate_paths: List[str] = []
        csv_path = config.resolve_master_csv_for_type(relic_type)
        if csv_path:
            candidate_paths.append(csv_path)

        demerit_candidates: List[str] = []
        demerit_csv_path = config.resolve_master_demerit_csv_for_type(relic_type)
        if demerit_csv_path:
            demerit_candidates.append(demerit_csv_path)

        merged_effects: List[str] = []
        merged_levels: Dict[str, List[str]] = {}
        merged_rules: Dict[str, Dict[str, object]] = {}
        recorded_path: Optional[str] = None

        for candidate in candidate_paths:
            if not candidate:
                continue
            if recorded_path is None:
                recorded_path = candidate
            effects, levels = load_effects_and_levels(candidate)
            if effects:
                for effect in effects:
                    if effect not in merged_effects:
                        merged_effects.append(effect)
            if levels:
                merged_levels = merge_level_maps(merged_levels, levels)
            metadata = load_metadata(candidate)
            if metadata:
                merged_rules = merge_demerit_rules(merged_rules, metadata)

        if merged_effects:
            options_map[relic_type] = merged_effects
        if merged_levels:
            levels_map[relic_type] = merged_levels
        if merged_rules:
            demerit_rules_map[relic_type] = merged_rules

        if recorded_path:
            try:
                rel_path = os.path.relpath(recorded_path, output_dir_abs)
            except ValueError:
                rel_path = os.path.basename(recorded_path)
            if os.sep != "/":
                rel_path = rel_path.replace(os.sep, "/")
            csv_map[relic_type] = rel_path

        demerit_effects: List[str] = []
        recorded_demerit: Optional[str] = None
        for candidate in demerit_candidates:
            if not candidate:
                continue
            if recorded_demerit is None:
                recorded_demerit = candidate
            effects, _levels = load_effects_and_levels(candidate)
            if effects:
                for effect in effects:
                    if effect not in demerit_effects:
                        demerit_effects.append(effect)

        if demerit_effects:
            demerit_options_map[relic_type] = demerit_effects
        if recorded_demerit:
            try:
                rel_path = os.path.relpath(recorded_demerit, output_dir_abs)
            except ValueError:
                rel_path = os.path.basename(recorded_demerit)
            if os.sep != "/":
                rel_path = rel_path.replace(os.sep, "/")
            demerit_csv_map[relic_type] = rel_path

    levels_serializable: Dict[str, Dict[str, List[str]]] = {}
    for key, mapping in levels_map.items():
        levels_serializable[key] = {effect: list(values) for effect, values in mapping.items()}

    return (
        options_map,
        levels_serializable,
        csv_map,
        demerit_options_map,
        demerit_csv_map,
        demerit_rules_map,
    )


def insert_merged_dataset(
    dataset_entries: Sequence[dict],
    active_dataset_index: int,
) -> Tuple[List[dict], int]:
    """複数データセットを統合ビューとして追加する."""

    entries = list(dataset_entries)
    has_explicit_merged = any(
        isinstance(entry, dict) and (entry.get("kind") or "") in {"merged", "merged_csv"}
        for entry in entries
    )
    if len(entries) <= 1 or has_explicit_merged:
        return entries, active_dataset_index

    merged_sources: List[dict] = []
    for entry in entries:
        csv_rel = (entry.get("csv") or "").strip()
        if not csv_rel:
            continue
        merged_sources.append(
            {
                "label": entry.get("label", ""),
                "csv": csv_rel,
                "imgDir": entry.get("imgDir", ""),
                "folder": entry.get("folder", ""),
            }
        )

    if not merged_sources:
        return entries, active_dataset_index

    merged_entry = {
        "label": "全データセット（統合）",
        "csv": "",
        "imgDir": "",
        "folder": "",
        "kind": "merged",
        "sources": merged_sources,
        "relicType": "merged",
    }
    updated_entries = [merged_entry] + entries
    if active_dataset_index >= 0:
        active_dataset_index += 1
    return updated_entries, active_dataset_index


def clamp_active_dataset_index(entries: Sequence[dict], requested_index: int) -> int:
    """有効なアクティブインデックスへ丸める."""

    if entries:
        return max(0, min(requested_index, len(entries) - 1))
    return -1


def collect_warnings(checks: Iterable[Tuple[bool, str]]) -> List[str]:
    """(条件, メッセージ) ペアから不足メッセージを抽出する."""

    return [message for condition, message in checks if not condition]


__all__ = [
    "sanitize_symbols",
    "resolve_label_symbols",
    "normalize_item_image_view_box",
    "normalize_dataset_entries",
    "normalize_relic_type_key",
    "merge_level_maps",
    "merge_demerit_rules",
    "collect_master_data_by_type",
    "insert_merged_dataset",
    "clamp_active_dataset_index",
    "collect_warnings",
]

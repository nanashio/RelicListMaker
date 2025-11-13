"""ギャラリーHTML生成のオーケストレーションロジック."""
from __future__ import annotations

import html
import json
import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence

import gallery_assets
from relic_data import (
    load_master_csv,
    load_master_json,
    load_master_effect_metadata,
    load_master_effects_and_levels,
    normalize_master_values,
)
from resource_paths import templates_path

RESULTS_CSV_PATH = "results_input_video.csv"
IMG_DIR = "crops/input_video"
OUTPUT_HTML = "viewer.html"
LABEL_SYMBOLS = ["①", "②", "③"]
DEFAULT_ITEM_IMAGE_VIEW_BOX = "inset(0px 180px 0px 0px)"
DEFAULT_MASTER_CSV = str(templates_path("master_relics.csv"))
DEFAULT_MASTER_JSON = "master_relics.json"
DEFAULT_MASTER_DEMERIT_CSV = str(templates_path("master_relics_demerit.csv"))
DEFAULT_MASTER_DEMERIT_JSON = "master_relics_demerit.json"
TEMPLATE_HTML_PATH = str(templates_path("gallery.html"))
TEMPLATE_CSS_PATH = str(templates_path("gallery/gallery.css"))
TEMPLATE_INDEX_JS_PATH = str(templates_path("gallery/index.js"))
TEMPLATE_CORE_JS_PATH = str(templates_path("gallery/gallery.js"))


@dataclass
class GalleryPayload:
    """テンプレートへ埋め込むデータ一式と警告情報."""

    results_csv: str
    image_dir: str
    label_symbols: List[str]
    master_csv: str
    master_json: str
    master_options: List[str]
    master_options_by_type: Dict[str, List[str]]
    master_levels: Dict[str, List[str]]
    master_levels_by_type: Dict[str, Dict[str, List[str]]]
    master_csv_map: Dict[str, str]
    master_demerit_csv: str
    master_demerit_json: str
    master_demerit_options: List[str]
    master_demerit_options_by_type: Dict[str, List[str]]
    master_demerit_csv_map: Dict[str, str]
    master_demerit_rules_by_type: Dict[str, Dict[str, Dict[str, object]]]
    datasets: List[dict]
    active_dataset_index: int
    item_image_view_box: str
    warnings: List[str] = field(default_factory=list)


def _escape_attr(value: str) -> str:
    return html.escape(value or "", quote=True)


def _sanitize_symbols(symbols):
    cleaned = []
    for symbol in symbols or []:
        if symbol is None:
            continue
        text = str(symbol)
        if text:
            cleaned.append(text)
    return cleaned


def _normalize_item_image_view_box(value: Optional[str]) -> str:
    default = DEFAULT_ITEM_IMAGE_VIEW_BOX
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


def _normalize_dataset_entries(datasets, output_dir: str):
    if not datasets:
        return []

    normalized = []
    for entry in datasets:
        if not entry:
            continue
        label = ""
        csv_path = None
        img_dir = None
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

        if os.path.isabs(csv_path):
            csv_abs = csv_path
        else:
            csv_abs = os.path.abspath(os.path.join(output_dir, csv_path))
        try:
            csv_rel = os.path.relpath(csv_abs, output_dir)
        except ValueError:
            csv_rel = os.path.basename(csv_abs)

        if not label:
            base_dir = os.path.dirname(csv_rel)
            if folder:
                label = folder
            elif base_dir:
                label = os.path.basename(base_dir)
            else:
                label = os.path.splitext(os.path.basename(csv_rel))[0] or "Dataset"

        if not folder:
            folder = os.path.dirname(csv_rel)

        img_rel = ""
        if img_dir:
            if os.path.isabs(img_dir):
                img_abs = img_dir
            else:
                img_abs = os.path.abspath(os.path.join(output_dir, img_dir))
            try:
                img_rel = os.path.relpath(img_abs, output_dir)
            except ValueError:
                img_rel = img_dir

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
                normalized_relic_type = str(relic_type).strip()
                if normalized_relic_type:
                    entry_data["relicType"] = normalized_relic_type

        normalized.append(entry_data)

    return normalized


def _normalize_relic_type_key(value: Optional[str]) -> str:
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


def _resolve_master_csv_for_type(relic_type: str) -> Optional[str]:
    if relic_type == "deep":
        return str(templates_path("master_relics_deep.csv"))
    if relic_type == "normal":
        return str(templates_path("master_relics.csv"))
    return None


def _resolve_master_demerit_csv_for_type(relic_type: str) -> Optional[str]:
    if relic_type == "deep":
        return str(templates_path("master_relics_demerit.csv"))
    return None


def _merge_level_maps(
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


def _merge_demerit_rules(
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
            level_list = []
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
        level_list = []
        if isinstance(levels, list):
            level_list = [str(entry) for entry in levels if entry is not None]
        merged[key] = {"hasDemerit": has_demerit, "levels": level_list}
    return merged


KNOWN_RELIC_TYPES: Dict[str, str] = {
    "normal": "master_relics.csv",
    "deep": "master_relics_deep.csv",
}


def _collect_master_data_by_type(
    dataset_entries: Sequence[dict],
    output_dir: str,
) -> tuple[
    Dict[str, List[str]],
    Dict[str, Dict[str, List[str]]],
    Dict[str, str],
    Dict[str, List[str]],
    Dict[str, str],
    Dict[str, Dict[str, Dict[str, object]]],
]:
    relic_types: set[str] = set(KNOWN_RELIC_TYPES.keys())
    for entry in dataset_entries or []:
        if not isinstance(entry, dict):
            continue
        normalized = _normalize_relic_type_key(entry.get("relicType") or entry.get("relic_type"))
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
        demerit_candidates: List[str] = []
        csv_path = _resolve_master_csv_for_type(relic_type)
        if csv_path:
            candidate_paths.append(csv_path)
        elif relic_type in KNOWN_RELIC_TYPES:
            candidate_paths.append(str(templates_path(KNOWN_RELIC_TYPES[relic_type])))

        demerit_csv_path = _resolve_master_demerit_csv_for_type(relic_type)
        if demerit_csv_path:
            demerit_candidates.append(demerit_csv_path)

        merged_effects: List[str] = []
        merged_levels: Dict[str, List[str]] = {}
        merged_rules: Dict[str, Dict[str, object]] = {}
        recorded_path: str | None = None

        for candidate in candidate_paths:
            if not candidate or not os.path.exists(candidate):
                continue
            if recorded_path is None:
                recorded_path = candidate
            effects, levels = load_master_effects_and_levels(candidate)
            if effects:
                for effect in effects:
                    if effect not in merged_effects:
                        merged_effects.append(effect)
            if levels:
                merged_levels = _merge_level_maps(merged_levels, levels)
            metadata = load_master_effect_metadata(candidate)
            if metadata:
                merged_rules = _merge_demerit_rules(merged_rules, metadata)

        if merged_effects:
            options_map[relic_type] = merged_effects
        if merged_levels:
            levels_map[relic_type] = merged_levels
        if merged_rules:
            demerit_rules_map[relic_type] = merged_rules

        if recorded_path:
            try:
                rel_path = os.path.relpath(recorded_path, output_dir)
            except ValueError:
                rel_path = os.path.basename(recorded_path)
            if os.sep != "/":
                rel_path = rel_path.replace(os.sep, "/")
            csv_map[relic_type] = rel_path

        demerit_effects: List[str] = []
        recorded_demerit: str | None = None
        for candidate in demerit_candidates:
            if not candidate or not os.path.exists(candidate):
                continue
            if recorded_demerit is None:
                recorded_demerit = candidate
            effects, _levels = load_master_effects_and_levels(candidate)
            if effects:
                for effect in effects:
                    if effect not in demerit_effects:
                        demerit_effects.append(effect)

        if demerit_effects:
            demerit_options_map[relic_type] = demerit_effects
        if recorded_demerit:
            try:
                rel_path = os.path.relpath(recorded_demerit, output_dir)
            except ValueError:
                rel_path = os.path.basename(recorded_demerit)
            if os.sep != "/":
                rel_path = rel_path.replace(os.sep, "/")
            demerit_csv_map[relic_type] = rel_path

    levels_map_serializable: Dict[str, Dict[str, List[str]]] = {}
    for key, mapping in levels_map.items():
        levels_map_serializable[key] = {effect: list(values) for effect, values in mapping.items()}

    return (
        options_map,
        levels_map_serializable,
        csv_map,
        demerit_options_map,
        demerit_csv_map,
        demerit_rules_map,
    )


def _resolve_asset_path(default_path: str, override: Optional[str]) -> str:
    if not override:
        return default_path
    if os.path.isabs(override):
        return override
    base_dir = os.path.dirname(__file__)
    return os.path.join(base_dir, override)


def _load_text_asset(default_path: str, override: Optional[str] = None) -> str:
    path = _resolve_asset_path(default_path, override)
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return handle.read()
    except FileNotFoundError as exc:
        raise FileNotFoundError(f"HTMLテンプレートが見つかりません: {path}") from exc


def build_gallery_payload(
    *,
    results_path: str,
    img_dir: Optional[str],
    output_dir: str,
    label_symbols: Optional[Sequence[str]],
    master_csv_path: Optional[str],
    master_json_path: Optional[str],
    master_options: Optional[Sequence[str]],
    master_demerit_csv_path: Optional[str],
    master_demerit_json_path: Optional[str],
    master_demerit_options: Optional[Sequence[str]],
    datasets,
    active_dataset_index: int,
    item_image_view_box: Optional[str],
) -> GalleryPayload:
    output_dir_abs = os.path.abspath(output_dir) if output_dir else os.getcwd()
    warnings: List[str] = []

    normalized_symbols = _sanitize_symbols(label_symbols) or _sanitize_symbols(LABEL_SYMBOLS)
    if not normalized_symbols:
        normalized_symbols = ["①", "②", "③"]

    results_abs_path = os.path.abspath(results_path)
    try:
        results_rel_path = os.path.relpath(results_abs_path, output_dir_abs)
    except ValueError:
        results_rel_path = os.path.basename(results_abs_path)
    if not os.path.exists(results_abs_path):
        warnings.append(f"[!] 結果ファイルが見つかりません: {results_path}")

    img_rel_dir = "."
    img_abs_dir: Optional[str] = None
    if img_dir:
        if os.path.isabs(img_dir):
            img_abs_dir = img_dir
            try:
                img_rel_dir = os.path.relpath(img_abs_dir, output_dir_abs)
            except ValueError:
                img_rel_dir = os.path.basename(img_abs_dir)
        else:
            img_rel_dir = img_dir
            img_abs_dir = os.path.abspath(os.path.join(output_dir_abs, img_dir))
        if img_abs_dir and not os.path.exists(img_abs_dir):
            warnings.append(f"[!] 画像ディレクトリが見つかりません: {img_abs_dir}")

    resolved_view_box = _normalize_item_image_view_box(item_image_view_box)

    master_options_list = normalize_master_values(master_options)
    master_csv_rel_path = ""
    master_json_rel_path = ""
    master_levels_map: Dict[str, List[str]] = {}
    master_effects_from_csv: List[str] = []
    master_demerit_options_list = normalize_master_values(master_demerit_options)
    master_demerit_csv_rel_path = ""
    master_demerit_json_rel_path = ""
    master_demerit_effects_from_csv: List[str] = []

    master_csv_abs: Optional[str] = None
    if master_csv_path:
        candidate = master_csv_path if os.path.isabs(master_csv_path) else os.path.abspath(
            os.path.join(output_dir_abs, master_csv_path)
        )
        if os.path.exists(candidate):
            master_csv_abs = candidate
            try:
                master_csv_rel_path = os.path.relpath(candidate, output_dir_abs)
            except ValueError:
                master_csv_rel_path = os.path.basename(candidate)
        else:
            warnings.append(f"[!] マスターデータ(CSV)が見つかりません: {candidate}")
    if master_csv_abs is None:
        fallback_csv = (
            DEFAULT_MASTER_CSV
            if os.path.isabs(DEFAULT_MASTER_CSV)
            else os.path.abspath(os.path.join(output_dir_abs, DEFAULT_MASTER_CSV))
        )
        if os.path.exists(fallback_csv):
            master_csv_abs = fallback_csv
            try:
                master_csv_rel_path = os.path.relpath(fallback_csv, output_dir_abs)
            except ValueError:
                master_csv_rel_path = os.path.basename(fallback_csv)
        else:
            warnings.append(f"[!] 既定のマスターデータ(CSV)が見つかりません: {fallback_csv}")

    if master_csv_abs:
        master_effects_from_csv, master_levels_map = load_master_effects_and_levels(master_csv_abs)

    if not master_options_list and master_json_path:
        if os.path.isabs(master_json_path):
            master_json_abs = master_json_path
        else:
            master_json_abs = os.path.abspath(os.path.join(output_dir_abs, master_json_path))
        if os.path.exists(master_json_abs):
            try:
                master_json_rel_path = os.path.relpath(master_json_abs, output_dir_abs)
            except ValueError:
                master_json_rel_path = os.path.basename(master_json_abs)
            master_options_list = load_master_json(master_json_abs)
        else:
            warnings.append(f"[!] マスターデータ(JSON)が見つかりません: {master_json_abs}")

    if not master_options_list and master_effects_from_csv:
        master_options_list = master_effects_from_csv

    if not master_options_list and master_csv_abs:
        master_options_list = load_master_csv(master_csv_abs)

    master_demerit_csv_abs: Optional[str] = None
    if master_demerit_csv_path:
        candidate = (
            master_demerit_csv_path
            if os.path.isabs(master_demerit_csv_path)
            else os.path.abspath(os.path.join(output_dir_abs, master_demerit_csv_path))
        )
        if os.path.exists(candidate):
            master_demerit_csv_abs = candidate
            try:
                master_demerit_csv_rel_path = os.path.relpath(candidate, output_dir_abs)
            except ValueError:
                master_demerit_csv_rel_path = os.path.basename(candidate)
        else:
            warnings.append(f"[!] デメリットマスターデータ(CSV)が見つかりません: {candidate}")
    if master_demerit_csv_abs is None:
        fallback_csv = (
            DEFAULT_MASTER_DEMERIT_CSV
            if os.path.isabs(DEFAULT_MASTER_DEMERIT_CSV)
            else os.path.abspath(os.path.join(output_dir_abs, DEFAULT_MASTER_DEMERIT_CSV))
        )
        if os.path.exists(fallback_csv):
            master_demerit_csv_abs = fallback_csv
            try:
                master_demerit_csv_rel_path = os.path.relpath(fallback_csv, output_dir_abs)
            except ValueError:
                master_demerit_csv_rel_path = os.path.basename(fallback_csv)
        elif DEFAULT_MASTER_DEMERIT_CSV:
            warnings.append(
                f"[!] 既定のデメリットマスターデータ(CSV)が見つかりません: {fallback_csv}"
            )

    if master_demerit_csv_abs:
        master_demerit_effects_from_csv = load_master_csv(master_demerit_csv_abs)

    if not master_demerit_options_list and master_demerit_json_path:
        if os.path.isabs(master_demerit_json_path):
            master_demerit_json_abs = master_demerit_json_path
        else:
            master_demerit_json_abs = os.path.abspath(
                os.path.join(output_dir_abs, master_demerit_json_path)
            )
        if os.path.exists(master_demerit_json_abs):
            try:
                master_demerit_json_rel_path = os.path.relpath(master_demerit_json_abs, output_dir_abs)
            except ValueError:
                master_demerit_json_rel_path = os.path.basename(master_demerit_json_abs)
            master_demerit_options_list = load_master_json(master_demerit_json_abs)
        else:
            warnings.append(
                f"[!] デメリットマスターデータ(JSON)が見つかりません: {master_demerit_json_abs}"
            )

    if not master_demerit_options_list and master_demerit_effects_from_csv:
        master_demerit_options_list = master_demerit_effects_from_csv

    if not master_demerit_options_list and master_demerit_csv_abs:
        master_demerit_options_list = load_master_csv(master_demerit_csv_abs)

    dataset_entries = _normalize_dataset_entries(datasets, output_dir_abs)

    (
        master_options_by_type,
        master_levels_by_type,
        master_csv_map,
        master_demerit_options_by_type,
        master_demerit_csv_map,
        master_demerit_rules_by_type,
    ) = _collect_master_data_by_type(
        dataset_entries,
        output_dir_abs,
    )

    aggregated_options: List[str] = list(master_options_list or [])
    for options in master_options_by_type.values():
        aggregated_options.extend(options)
    master_options_list = normalize_master_values(aggregated_options)

    aggregated_demerit_options: List[str] = list(master_demerit_options_list or [])
    for options in master_demerit_options_by_type.values():
        aggregated_demerit_options.extend(options)
    master_demerit_options_list = normalize_master_values(aggregated_demerit_options)

    combined_levels = _merge_level_maps(master_levels_map, None)
    for levels in master_levels_by_type.values():
        combined_levels = _merge_level_maps(combined_levels, levels)
    master_levels_map = combined_levels

    merged_entry = None
    has_explicit_merged = any(
        isinstance(entry, dict) and (entry.get("kind") or "") in {"merged", "merged_csv"}
        for entry in dataset_entries
    )
    if len(dataset_entries) > 1 and not has_explicit_merged:
        merged_sources = []
        for entry in dataset_entries:
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

        if merged_sources:
            merged_entry = {
                "label": "全データセット（統合）",
                "csv": "",
                "imgDir": "",
                "folder": "",
                "kind": "merged",
                "sources": merged_sources,
                "relicType": "merged",
            }
            dataset_entries = [merged_entry] + dataset_entries
            if active_dataset_index >= 0:
                active_dataset_index += 1

    if dataset_entries:
        active_dataset_index = max(0, min(active_dataset_index, len(dataset_entries) - 1))
    else:
        active_dataset_index = -1

    if dataset_entries and active_dataset_index >= 0:
        active_dataset = dataset_entries[active_dataset_index]
        csv_entry = active_dataset.get("csv") or ""
        img_entry = active_dataset.get("imgDir") or ""

        if csv_entry:
            active_csv_abs = os.path.abspath(os.path.join(output_dir_abs, csv_entry))
            results_abs_path = active_csv_abs
            results_rel_path = csv_entry
            if not os.path.exists(active_csv_abs):
                warnings.append(f"[!] データセットCSVが見つかりません: {active_csv_abs}")

        if img_entry:
            img_rel_dir = img_entry
            img_abs_dir = os.path.abspath(os.path.join(output_dir_abs, img_entry))
            if not os.path.exists(img_abs_dir):
                warnings.append(f"[!] データセット画像ディレクトリが見つかりません: {img_abs_dir}")

    return GalleryPayload(
        results_csv=results_rel_path,
        image_dir=img_rel_dir,
        label_symbols=list(normalized_symbols),
        master_csv=master_csv_rel_path,
        master_json=master_json_rel_path,
        master_options=list(master_options_list or []),
        master_options_by_type=master_options_by_type,
        master_levels=master_levels_map,
        master_levels_by_type=master_levels_by_type,
        master_csv_map=master_csv_map,
        master_demerit_csv=master_demerit_csv_rel_path,
        master_demerit_json=master_demerit_json_rel_path,
        master_demerit_options=list(master_demerit_options_list or []),
        master_demerit_options_by_type=master_demerit_options_by_type,
        master_demerit_csv_map=master_demerit_csv_map,
        master_demerit_rules_by_type=master_demerit_rules_by_type,
        datasets=dataset_entries,
        active_dataset_index=active_dataset_index,
        item_image_view_box=resolved_view_box,
        warnings=warnings,
    )


def render_gallery_template(template: str, replacements: Dict[str, str]) -> str:
    rendered = template
    for placeholder, value in replacements.items():
        rendered = rendered.replace(placeholder, value)
    return rendered


def generate_html(
    results_path,
    img_dir,
    output_html,
    label_symbols=None,
    master_csv_path: Optional[str] = None,
    master_json_path: Optional[str] = None,
    master_demerit_csv_path: Optional[str] = None,
    master_demerit_json_path: Optional[str] = None,
    template_path: Optional[str] = None,
    css_template_path: Optional[str] = None,
    js_template_path: Optional[str] = None,
    css_output_name: Optional[str] = None,
    js_output_name: Optional[str] = None,
    master_options: Optional[Sequence[str]] = None,
    master_demerit_options: Optional[Sequence[str]] = None,
    datasets=None,
    active_dataset_index: int = 0,
    item_image_view_box: Optional[str] = None,
    css_relative_override: Optional[str] = None,
    js_relative_override: Optional[str] = None,
):
    output_dir = os.path.dirname(os.path.abspath(output_html)) or "."
    os.makedirs(output_dir, exist_ok=True)

    payload = build_gallery_payload(
        results_path=results_path,
        img_dir=img_dir,
        output_dir=output_dir,
        label_symbols=label_symbols,
        master_csv_path=master_csv_path,
        master_json_path=master_json_path,
        master_options=master_options,
        master_demerit_csv_path=master_demerit_csv_path,
        master_demerit_json_path=master_demerit_json_path,
        master_demerit_options=master_demerit_options,
        datasets=datasets,
        active_dataset_index=active_dataset_index,
        item_image_view_box=item_image_view_box,
    )

    for message in payload.warnings:
        print(message)

    html_template = _load_text_asset(TEMPLATE_HTML_PATH, template_path)

    assets = gallery_assets.prepare_gallery_assets(
        output_dir,
        css_template_path=TEMPLATE_CSS_PATH,
        css_override_template=css_template_path,
        css_output_name=css_output_name or "gallery/gallery.css",
        css_relative_override=css_relative_override,
        index_template_path=TEMPLATE_INDEX_JS_PATH,
        index_relative_path="gallery/index.js",
        core_template_path=TEMPLATE_CORE_JS_PATH,
        core_override_template=js_template_path,
        core_output_name=js_output_name or "gallery/gallery.js",
        core_relative_override=js_relative_override,
        modules=gallery_assets.ADDITIONAL_GALLERY_SCRIPTS,
    )

    css_reference = gallery_assets.cache_bust_reference(assets.css)
    index_reference = gallery_assets.cache_bust_reference(assets.index_js)
    core_js_reference = gallery_assets.cache_bust_reference(assets.core_js)

    embed_options = payload.master_options if not payload.master_json else []
    embed_demerit_options = (
        payload.master_demerit_options if not payload.master_demerit_json else []
    )

    replacements = {
        "__RESULTS_CSV__": _escape_attr(payload.results_csv),
        "__IMAGE_DIR__": _escape_attr(payload.image_dir),
        "__LABEL_SYMBOLS__": _escape_attr(json.dumps(payload.label_symbols, ensure_ascii=False)),
        "__MASTER_CSV__": _escape_attr(payload.master_csv),
        "__MASTER_JSON__": _escape_attr(payload.master_json),
        "__MASTER_OPTIONS__": _escape_attr(json.dumps(embed_options, ensure_ascii=False)),
        "__MASTER_OPTIONS_MAP__": _escape_attr(json.dumps(payload.master_options_by_type, ensure_ascii=False)),
        "__MASTER_LEVELS__": _escape_attr(json.dumps(payload.master_levels, ensure_ascii=False)),
        "__MASTER_LEVELS_BY_TYPE__": _escape_attr(json.dumps(payload.master_levels_by_type, ensure_ascii=False)),
        "__MASTER_CSV_MAP__": _escape_attr(json.dumps(payload.master_csv_map, ensure_ascii=False)),
        "__MASTER_DEMERIT_CSV__": _escape_attr(payload.master_demerit_csv),
        "__MASTER_DEMERIT_JSON__": _escape_attr(payload.master_demerit_json),
        "__MASTER_DEMERIT_OPTIONS__": _escape_attr(
            json.dumps(embed_demerit_options, ensure_ascii=False)
        ),
        "__MASTER_DEMERIT_OPTIONS_MAP__": _escape_attr(
            json.dumps(payload.master_demerit_options_by_type, ensure_ascii=False)
        ),
        "__MASTER_DEMERIT_CSV_MAP__": _escape_attr(
            json.dumps(payload.master_demerit_csv_map, ensure_ascii=False)
        ),
        "__MASTER_DEMERIT_RULES_MAP__": _escape_attr(
            json.dumps(payload.master_demerit_rules_by_type, ensure_ascii=False)
        ),
        "__CSS_FILE__": _escape_attr(css_reference),
        "__JS_FILE__": _escape_attr(index_reference),
        "__CORE_JS__": _escape_attr(core_js_reference),
        "__DATASETS__": _escape_attr(json.dumps(payload.datasets, ensure_ascii=False)),
        "__ACTIVE_DATASET__": _escape_attr(str(payload.active_dataset_index)),
        "__ITEM_IMAGE_VIEW_BOX__": _escape_attr(payload.item_image_view_box),
    }

    html_output = render_gallery_template(html_template, replacements)

    with open(output_html, "w", encoding="utf-8") as handle:
        handle.write(html_output)

    print(f"[✓] {output_html} を生成しました！ ブラウザで開いてください。")


if __name__ == "__main__":
    generate_html(
        RESULTS_CSV_PATH,
        IMG_DIR,
        OUTPUT_HTML,
        LABEL_SYMBOLS,
        master_csv_path=DEFAULT_MASTER_CSV,
        master_json_path=DEFAULT_MASTER_JSON,
    )

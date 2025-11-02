import os
import html
import json
import shutil
import time
from typing import Dict, List, Optional, Sequence

from relic_data import load_master_csv, load_master_json, load_master_effects_and_levels, normalize_master_values
from resource_paths import templates_path

RESULTS_CSV_PATH = "results_input_video.csv"
IMG_DIR = "crops/input_video"
OUTPUT_HTML = "viewer.html"
LABEL_SYMBOLS = ["①", "②", "③"]
DEFAULT_ITEM_IMAGE_VIEW_BOX = "inset(0px 180px 0px 0px)"
DEFAULT_MASTER_CSV = str(templates_path("master_relics.csv"))
DEFAULT_MASTER_JSON = "master_relics.json"
TEMPLATE_HTML_PATH = str(templates_path("gallery.html"))
TEMPLATE_CSS_PATH = str(templates_path("gallery.css"))
TEMPLATE_INDEX_JS_PATH = str(templates_path("gallery/index.js"))
TEMPLATE_CORE_JS_PATH = str(templates_path("gallery.js"))

ADDITIONAL_GALLERY_SCRIPTS = [
    "gallery/utils/dom.js",
    "gallery/utils/data.js",
    "gallery/utils/records.js",
    "gallery/dataset/utils.js",
    "gallery/utils/filter.js",
    "gallery/state/store.js",
    "gallery/app/stateApi.js",
    "gallery/dataset/manager.js",
    "gallery/storage/utils.js",
    "gallery/storage/manager.js",
    "gallery/app/controller.js",
    "gallery/render/effectViewModel.js",
    "gallery/render/effectFactory.js",
    "gallery/render/itemEnhancers.js",
    "gallery/render/itemFactory.js",
    "gallery/render/galleryView.js",
    "gallery/events/recordActionHandlers.js",
    "gallery/events/galleryEvents.js"
]


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


def _collect_master_data_by_type(
    dataset_entries: Sequence[dict],
    output_dir: str,
) -> tuple[Dict[str, List[str]], Dict[str, Dict[str, List[str]]], Dict[str, str]]:
    relic_types: set[str] = set()
    for entry in dataset_entries or []:
        if not isinstance(entry, dict):
            continue
        normalized = _normalize_relic_type_key(entry.get("relicType") or entry.get("relic_type"))
        if normalized and normalized != "merged":
            relic_types.add(normalized)

    options_map: Dict[str, List[str]] = {}
    levels_map: Dict[str, Dict[str, List[str]]] = {}
    csv_map: Dict[str, str] = {}

    for relic_type in sorted(relic_types):
        csv_path = _resolve_master_csv_for_type(relic_type)
        if not csv_path or not os.path.exists(csv_path):
            continue
        effects, levels = load_master_effects_and_levels(csv_path)
        if effects:
            options_map[relic_type] = effects
        if levels:
            levels_map[relic_type] = levels
        try:
            rel_path = os.path.relpath(csv_path, output_dir)
        except ValueError:
            rel_path = os.path.basename(csv_path)
        if os.sep != "/":
            rel_path = rel_path.replace(os.sep, "/")
        csv_map[relic_type] = rel_path

    # Levels map values should be plain dicts for JSON serialization.
    levels_map_serializable: Dict[str, Dict[str, List[str]]] = {}
    for key, mapping in levels_map.items():
        levels_map_serializable[key] = {effect: list(values) for effect, values in mapping.items()}

    return options_map, levels_map_serializable, csv_map


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


def _copy_static_asset(
    default_path: str,
    output_dir: str,
    override: Optional[str] = None,
    target_relative_path: Optional[str] = None,
) -> tuple[str, str]:
    source = _resolve_asset_path(default_path, override)
    if target_relative_path:
        relative_path = target_relative_path
    else:
        relative_path = os.path.basename(source)
    destination = os.path.join(output_dir, relative_path)
    os.makedirs(os.path.dirname(destination), exist_ok=True)
    try:
        shutil.copyfile(source, destination)
    except FileNotFoundError as exc:
        raise FileNotFoundError(f"静的アセットが見つかりません: {source}") from exc
    normalized = relative_path.replace(os.sep, "/")
    return normalized, destination




def _copy_gallery_modules(output_dir: str) -> None:
    for relative in ADDITIONAL_GALLERY_SCRIPTS:
        source_path = templates_path(relative)
        destination = os.path.join(output_dir, relative.replace("/", os.sep))
        os.makedirs(os.path.dirname(destination), exist_ok=True)
        shutil.copyfile(str(source_path), destination)


def _cache_busted_path(relative_path: str, target_path: Optional[str]) -> str:
    if not relative_path or not target_path:
        return relative_path
    try:
        version = str(int(os.path.getmtime(target_path)))
    except OSError:
        return relative_path
    separator = '&' if '?' in relative_path else '?'
    return f"{relative_path}{separator}v={version}"


def generate_html(
    results_path,
    img_dir,
    output_html,
    label_symbols=None,
    master_csv_path: Optional[str] = None,
    master_json_path: Optional[str] = None,
    template_path: Optional[str] = None,
    css_template_path: Optional[str] = None,
    js_template_path: Optional[str] = None,
    css_output_name: Optional[str] = None,
    js_output_name: Optional[str] = None,
    master_options: Optional[Sequence[str]] = None,
    datasets=None,
    active_dataset_index: int = 0,
    item_image_view_box: Optional[str] = None,
    css_relative_override: Optional[str] = None,
    js_relative_override: Optional[str] = None,
):
    label_symbols = _sanitize_symbols(label_symbols) or _sanitize_symbols(LABEL_SYMBOLS)
    if not label_symbols:
        label_symbols = ["①", "②", "③"]

    output_dir = os.path.dirname(os.path.abspath(output_html)) or "."
    os.makedirs(output_dir, exist_ok=True)

    results_abs_path = os.path.abspath(results_path)
    results_rel_path = os.path.relpath(results_abs_path, output_dir)

    if not os.path.exists(results_abs_path):
        print(f"[!] 結果ファイルが見つかりません: {results_path}")

    if img_dir:
        if os.path.isabs(img_dir):
            img_rel_dir = os.path.relpath(img_dir, output_dir)
            img_abs_dir = img_dir
        else:
            img_rel_dir = img_dir
            img_abs_dir = os.path.abspath(os.path.join(output_dir, img_dir))
        if not os.path.exists(img_abs_dir):
            print(f"[!] 画像ディレクトリが見つかりません: {img_abs_dir}")
    else:
        img_rel_dir = "."

    master_options = normalize_master_values(master_options)
    resolved_view_box = _normalize_item_image_view_box(item_image_view_box)
    master_csv_rel_path = ""
    master_json_rel_path = ""
    master_levels_map: Dict[str, List[str]] = {}
    master_effects_from_csv: List[str] = []

    master_csv_abs: Optional[str] = None
    if master_csv_path:
        candidate = master_csv_path if os.path.isabs(master_csv_path) else os.path.abspath(os.path.join(output_dir, master_csv_path))
        if os.path.exists(candidate):
            master_csv_abs = candidate
            master_csv_rel_path = os.path.relpath(candidate, output_dir)
        else:
            print(f"[!] マスターデータ(CSV)が見つかりません: {candidate}")
    if master_csv_abs is None:
        fallback_csv = DEFAULT_MASTER_CSV if os.path.isabs(DEFAULT_MASTER_CSV) else os.path.abspath(os.path.join(output_dir, DEFAULT_MASTER_CSV))
        if os.path.exists(fallback_csv):
            master_csv_abs = fallback_csv
            master_csv_rel_path = os.path.relpath(fallback_csv, output_dir)
        else:
            print(f"[!] 既定のマスターデータ(CSV)が見つかりません: {fallback_csv}")

    if master_csv_abs:
        master_effects_from_csv, master_levels_map = load_master_effects_and_levels(master_csv_abs)

    if not master_options and master_json_path:
        if os.path.isabs(master_json_path):
            master_json_abs = master_json_path
        else:
            master_json_abs = os.path.abspath(os.path.join(output_dir, master_json_path))
        if os.path.exists(master_json_abs):
            master_json_rel_path = os.path.relpath(master_json_abs, output_dir)
            master_options = load_master_json(master_json_abs)
        else:
            print(f"[!] マスターデータ(JSON)が見つかりません: {master_json_abs}")

    if not master_options and master_effects_from_csv:
        master_options = master_effects_from_csv

    if not master_options and master_csv_abs:
        master_options = load_master_csv(master_csv_abs)

    dataset_entries = _normalize_dataset_entries(datasets, output_dir)

    master_options_by_type, master_levels_by_type, master_csv_map = _collect_master_data_by_type(
        dataset_entries,
        output_dir,
    )

    aggregated_options: List[str] = list(master_options or [])
    for options in master_options_by_type.values():
        aggregated_options.extend(options)
    master_options = normalize_master_values(aggregated_options)

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

    active_dataset_index = max(0, min(active_dataset_index, len(dataset_entries) - 1)) if dataset_entries else -1

    if dataset_entries and active_dataset_index >= 0:
        active_dataset = dataset_entries[active_dataset_index]
        csv_entry = active_dataset.get("csv") or ""
        img_entry = active_dataset.get("imgDir") or ""

        if csv_entry:
            active_csv_abs = os.path.abspath(os.path.join(output_dir, csv_entry))
            results_abs_path = active_csv_abs
            results_rel_path = csv_entry
            if not os.path.exists(active_csv_abs):
                print(f"[!] データセットCSVが見つかりません: {active_csv_abs}")

        if img_entry:
            img_rel_dir = img_entry
            img_abs_dir = os.path.abspath(os.path.join(output_dir, img_entry))
            if not os.path.exists(img_abs_dir):
                print(f"[!] データセット画像ディレクトリが見つかりません: {img_abs_dir}")

    html_template = _load_text_asset(TEMPLATE_HTML_PATH, template_path)
    if css_relative_override is not None:
        css_relative = css_relative_override.replace('\\', '/')
        if '://' in css_relative_override:
            css_abs_path = None
        elif os.path.isabs(css_relative_override):
            css_abs_path = css_relative_override
        else:
            candidate = os.path.join(output_dir, css_relative)
            css_abs_path = candidate if os.path.exists(candidate) else None
    else:
        css_relative, css_abs_path = _copy_static_asset(
            TEMPLATE_CSS_PATH,
            output_dir,
            override=css_template_path,
            target_relative_path=css_output_name,
        )
    css_reference = _cache_busted_path(css_relative, css_abs_path)

    index_relative, index_abs_path = _copy_static_asset(
        TEMPLATE_INDEX_JS_PATH,
        output_dir,
        target_relative_path='gallery/index.js',
    )
    index_reference = _cache_busted_path(index_relative, index_abs_path)

    if js_relative_override is not None:
        core_js_relative = js_relative_override.replace('\\', '/')
        if '://' in js_relative_override:
            core_js_abs_path = None
        elif os.path.isabs(js_relative_override):
            core_js_abs_path = js_relative_override
        else:
            candidate_js = os.path.join(output_dir, core_js_relative)
            core_js_abs_path = candidate_js if os.path.exists(candidate_js) else None
    else:
        core_js_relative, core_js_abs_path = _copy_static_asset(
            TEMPLATE_CORE_JS_PATH,
            output_dir,
            override=js_template_path,
            target_relative_path=js_output_name,
        )
    core_js_reference = _cache_busted_path(core_js_relative, core_js_abs_path)

    _copy_gallery_modules(output_dir)

    html_output = html_template
    embed_options = master_options if not master_json_rel_path else []

    html_output = html_output.replace("__RESULTS_CSV__", _escape_attr(results_rel_path))
    html_output = html_output.replace("__IMAGE_DIR__", _escape_attr(img_rel_dir))
    html_output = html_output.replace("__LABEL_SYMBOLS__", _escape_attr(json.dumps(label_symbols, ensure_ascii=False)))
    html_output = html_output.replace("__MASTER_CSV__", _escape_attr(master_csv_rel_path))
    html_output = html_output.replace("__MASTER_JSON__", _escape_attr(master_json_rel_path))
    html_output = html_output.replace("__MASTER_OPTIONS__", _escape_attr(json.dumps(embed_options, ensure_ascii=False)))
    html_output = html_output.replace("__MASTER_OPTIONS_MAP__", _escape_attr(json.dumps(master_options_by_type, ensure_ascii=False)))
    html_output = html_output.replace("__MASTER_LEVELS__", _escape_attr(json.dumps(master_levels_map, ensure_ascii=False)))
    html_output = html_output.replace("__MASTER_LEVELS_BY_TYPE__", _escape_attr(json.dumps(master_levels_by_type, ensure_ascii=False)))
    html_output = html_output.replace("__MASTER_CSV_MAP__", _escape_attr(json.dumps(master_csv_map, ensure_ascii=False)))
    html_output = html_output.replace("__CSS_FILE__", _escape_attr(css_reference))
    html_output = html_output.replace("__JS_FILE__", _escape_attr(index_reference))
    html_output = html_output.replace("__CORE_JS__", _escape_attr(core_js_reference))
    html_output = html_output.replace("__DATASETS__", _escape_attr(json.dumps(dataset_entries, ensure_ascii=False)))
    html_output = html_output.replace("__ACTIVE_DATASET__", _escape_attr(str(active_dataset_index)))
    html_output = html_output.replace("__ITEM_IMAGE_VIEW_BOX__", _escape_attr(resolved_view_box))

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

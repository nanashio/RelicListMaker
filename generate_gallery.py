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
DEFAULT_MASTER_CSV = str(templates_path("master_relics.csv"))
DEFAULT_MASTER_JSON = "master_relics.json"
TEMPLATE_HTML_PATH = str(templates_path("gallery.html"))
TEMPLATE_CSS_PATH = str(templates_path("gallery.css"))
TEMPLATE_JS_PATH = str(templates_path("gallery.js"))


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

        if isinstance(entry, dict):
            raw_label = entry.get("label") or entry.get("name")
            if raw_label is not None:
                label = str(raw_label).strip()
            csv_path = entry.get("csv") or entry.get("results_csv") or entry.get("results")
            img_dir = entry.get("imgDir") or entry.get("img_dir") or entry.get("images") or entry.get("image_dir")
            folder = str(entry.get("folder") or "").strip()
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

        normalized.append(entry_data)

    return normalized


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
    master_csv_rel_path = ""
    master_json_rel_path = ""
    master_levels_map: Dict[str, List[str]] = {}

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

    if not master_options and master_csv_abs:
        master_options = load_master_csv(master_csv_abs)

    if master_csv_abs:
        _, master_levels_map = load_master_effects_and_levels(master_csv_abs)

    dataset_entries = _normalize_dataset_entries(datasets, output_dir)

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

    if js_relative_override is not None:
        js_relative = js_relative_override.replace('\\', '/')
        if '://' in js_relative_override:
            js_abs_path = None
        elif os.path.isabs(js_relative_override):
            js_abs_path = js_relative_override
        else:
            candidate_js = os.path.join(output_dir, js_relative)
            js_abs_path = candidate_js if os.path.exists(candidate_js) else None
    else:
        js_relative, js_abs_path = _copy_static_asset(
            TEMPLATE_JS_PATH,
            output_dir,
            override=js_template_path,
            target_relative_path=js_output_name,
        )
    js_reference = _cache_busted_path(js_relative, js_abs_path)

    html_output = html_template
    embed_options = master_options if not master_json_rel_path else []

    html_output = html_output.replace("__RESULTS_CSV__", _escape_attr(results_rel_path))
    html_output = html_output.replace("__IMAGE_DIR__", _escape_attr(img_rel_dir))
    html_output = html_output.replace("__LABEL_SYMBOLS__", _escape_attr(json.dumps(label_symbols, ensure_ascii=False)))
    html_output = html_output.replace("__MASTER_CSV__", _escape_attr(master_csv_rel_path))
    html_output = html_output.replace("__MASTER_JSON__", _escape_attr(master_json_rel_path))
    html_output = html_output.replace("__MASTER_OPTIONS__", _escape_attr(json.dumps(embed_options, ensure_ascii=False)))
    html_output = html_output.replace("__MASTER_LEVELS__", _escape_attr(json.dumps(master_levels_map, ensure_ascii=False)))
    html_output = html_output.replace("__CSS_FILE__", _escape_attr(css_reference))
    html_output = html_output.replace("__JS_FILE__", _escape_attr(js_reference))
    html_output = html_output.replace("__DATASETS__", _escape_attr(json.dumps(dataset_entries, ensure_ascii=False)))
    html_output = html_output.replace("__ACTIVE_DATASET__", _escape_attr(str(active_dataset_index)))

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

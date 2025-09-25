import os
import csv
import html
import json
import shutil
from typing import Optional

RESULTS_JSON_PATH = "results_input_video.json"
IMG_DIR = "crops/input_video"
OUTPUT_HTML = "viewer.html"
LABEL_SYMBOLS = ["①", "②", "③"]
DEFAULT_MASTER_CSV = "master_relics.csv"
DEFAULT_MASTER_JSON = "master_relics.json"
TEMPLATE_HTML_PATH = os.path.join(os.path.dirname(__file__), "templates", "gallery.html")
TEMPLATE_CSS_PATH = os.path.join(os.path.dirname(__file__), "templates", "gallery.css")
TEMPLATE_JS_PATH = os.path.join(os.path.dirname(__file__), "templates", "gallery.js")


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
) -> str:
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
    # HTML内で使いやすいようにパス区切りを統一
    return relative_path.replace(os.sep, "/")


def _extract_master_options_from_csv(master_abs_path: Optional[str], column_name: str = "EffectBase"):
    if not master_abs_path or not os.path.exists(master_abs_path):
        return []

    options = []
    seen = set()
    try:
        with open(master_abs_path, "r", encoding="utf-8") as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                value = (row.get(column_name) or "").strip()
                if value and value != "-" and value not in seen:
                    seen.add(value)
                    options.append(value)
    except Exception as exc:
        print(f"[!] マスターデータの読み込みに失敗しました: {exc}")
    return options


def _extract_master_options_from_json(master_abs_path: Optional[str]):
    if not master_abs_path or not os.path.exists(master_abs_path):
        return []

    try:
        with open(master_abs_path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
    except Exception as exc:
        print(f"[!] マスターデータ(JSON)の読み込みに失敗しました: {exc}")
        return []

    if not isinstance(data, list):
        return []

    options = []
    seen = set()
    for entry in data:
        value = ""
        if isinstance(entry, str):
            value = entry.strip()
        elif isinstance(entry, dict):
            raw = entry.get("EffectBase") or entry.get("effect") or entry.get("name")
            if isinstance(raw, str):
                value = raw.strip()
        if value and value != "-" and value not in seen:
            seen.add(value)
            options.append(value)
    return options


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
):
    label_symbols = _sanitize_symbols(label_symbols) or _sanitize_symbols(LABEL_SYMBOLS)
    if not label_symbols:
        label_symbols = ["①", "②", "③"]

    output_dir = os.path.dirname(os.path.abspath(output_html)) or "."
    os.makedirs(output_dir, exist_ok=True)

    json_abs_path = os.path.abspath(results_path)
    json_rel_path = os.path.relpath(json_abs_path, output_dir)

    if not os.path.exists(json_abs_path):
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

    master_options = []
    master_csv_rel_path = ""
    master_json_rel_path = ""

    if master_json_path:
        if os.path.isabs(master_json_path):
            master_json_abs = master_json_path
        else:
            master_json_abs = os.path.abspath(os.path.join(output_dir, master_json_path))
        if os.path.exists(master_json_abs):
            master_json_rel_path = os.path.relpath(master_json_abs, output_dir)
            master_options = _extract_master_options_from_json(master_json_abs)
        else:
            print(f"[!] マスターデータ(JSON)が見つかりません: {master_json_abs}")

    if not master_options and master_csv_path:
        if os.path.isabs(master_csv_path):
            master_csv_abs = master_csv_path
        else:
            master_csv_abs = os.path.abspath(os.path.join(output_dir, master_csv_path))
        if os.path.exists(master_csv_abs):
            master_csv_rel_path = os.path.relpath(master_csv_abs, output_dir)
            master_options = _extract_master_options_from_csv(master_csv_abs)
        else:
            print(f"[!] マスターデータ(CSV)が見つかりません: {master_csv_abs}")

    html_template = _load_text_asset(TEMPLATE_HTML_PATH, template_path)
    css_relative = _copy_static_asset(
        TEMPLATE_CSS_PATH,
        output_dir,
        override=css_template_path,
        target_relative_path=css_output_name,
    )
    js_relative = _copy_static_asset(
        TEMPLATE_JS_PATH,
        output_dir,
        override=js_template_path,
        target_relative_path=js_output_name,
    )

    html_output = html_template
    embed_options = master_options if not master_json_rel_path else []

    html_output = html_output.replace("__RESULTS_JSON__", _escape_attr(json_rel_path))
    html_output = html_output.replace("__IMAGE_DIR__", _escape_attr(img_rel_dir))
    html_output = html_output.replace("__LABEL_SYMBOLS__", _escape_attr(json.dumps(label_symbols, ensure_ascii=False)))
    html_output = html_output.replace("__MASTER_CSV__", _escape_attr(master_csv_rel_path))
    html_output = html_output.replace("__MASTER_JSON__", _escape_attr(master_json_rel_path))
    html_output = html_output.replace("__MASTER_OPTIONS__", _escape_attr(json.dumps(embed_options, ensure_ascii=False)))
    html_output = html_output.replace("__CSS_FILE__", _escape_attr(css_relative))
    html_output = html_output.replace("__JS_FILE__", _escape_attr(js_relative))

    with open(output_html, "w", encoding="utf-8") as handle:
        handle.write(html_output)

    print(f"[✓] {output_html} を生成しました！ ブラウザで開いてください。")


if __name__ == "__main__":
    generate_html(
        RESULTS_JSON_PATH,
        IMG_DIR,
        OUTPUT_HTML,
        LABEL_SYMBOLS,
        master_csv_path=DEFAULT_MASTER_CSV,
        master_json_path=DEFAULT_MASTER_JSON,
    )

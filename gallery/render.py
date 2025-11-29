"""ギャラリーHTMLレンダリング処理."""
from __future__ import annotations

import html
import json
import os
from pathlib import Path
from typing import Optional, Sequence

from . import assets as gallery_assets

from .config import GalleryConfig, default_config
from .models import GalleryDependencies, GalleryPayload, build_gallery_payload
from .template_parts import render_template_with_partials
import version_info
from resource_paths import project_root


def _escape_attr(value: str) -> str:
    return html.escape(value or "", quote=True)


def _json_text(value: object, *, allow_empty: bool = False) -> str:
    if not allow_empty and (value == "" or value == [] or value == {}):
        return ""
    return json.dumps(value, ensure_ascii=False)


def _join_attrs(attrs: dict[str, str]) -> str:
    parts = []
    for key, value in attrs.items():
        if value is None or value == "":
            continue
        parts.append(f'{key}="{_escape_attr(value)}"')
    return " ".join(parts)


def _resolve_asset_path(default_path: str, override: Optional[str]) -> str:
    if not override:
        return default_path
    if os.path.isabs(override):
        return override
    base_dir = project_root()
    return os.path.join(str(base_dir), override)


def load_text_asset(default_path: str, override: Optional[str] = None) -> str:
    path = _resolve_asset_path(default_path, override)
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return handle.read()
    except FileNotFoundError as exc:
        raise FileNotFoundError(f"HTMLテンプレートが見つかりません: {path}") from exc


def render_gallery_template(template: str, replacements: dict[str, str]) -> str:
    rendered = template
    for placeholder, value in replacements.items():
        rendered = rendered.replace(placeholder, value)
    return rendered


def _build_bootstrap_data(
    payload: GalleryPayload, *, app_version: str, core_script: str
) -> dict[str, object]:
    embed_options = payload.master_options if not payload.master_json else []
    embed_demerit_options = (
        payload.master_demerit_options if not payload.master_demerit_json else []
    )

    return {
        "resultsCsv": payload.results_csv,
        "imgDir": payload.image_dir,
        "labelSymbols": payload.label_symbols,
        "masterCsv": payload.master_csv,
        "masterJson": payload.master_json,
        "masterOptions": embed_options,
        "masterOptionsMap": payload.master_options_by_type,
        "masterLevels": payload.master_levels,
        "masterLevelsMap": payload.master_levels_by_type,
        "masterCsvMap": payload.master_csv_map,
        "masterDemeritCsv": payload.master_demerit_csv,
        "masterDemeritJson": payload.master_demerit_json,
        "masterDemeritOptions": embed_demerit_options,
        "masterDemeritOptionsMap": payload.master_demerit_options_by_type,
        "masterDemeritCsvMap": payload.master_demerit_csv_map,
        "masterDemeritRulesMap": payload.master_demerit_rules_by_type,
        "datasets": payload.datasets,
        "activeDataset": payload.active_dataset_index,
        "itemImageViewBox": payload.item_image_view_box,
        "appVersion": app_version,
        "coreScript": core_script,
    }


def _build_body_attributes(
    payload: GalleryPayload,
    *,
    bootstrap_reference: str,
    core_script: str,
    app_version: str,
) -> str:
    attrs: dict[str, str] = {
        "class": "gallery-page",
        "data-bootstrap-json": bootstrap_reference,
        "data-results-csv": payload.results_csv,
        "data-img-dir": payload.image_dir,
        "data-label-symbols": _json_text(payload.label_symbols),
        "data-master-csv": payload.master_csv,
        "data-master-json": payload.master_json,
        "data-master-options": _json_text(payload.master_options),
        "data-master-options-map": _json_text(payload.master_options_by_type),
        "data-master-levels": _json_text(payload.master_levels),
        "data-master-levels-map": _json_text(payload.master_levels_by_type),
        "data-master-csv-map": _json_text(payload.master_csv_map),
        "data-master-demerit-csv": payload.master_demerit_csv,
        "data-master-demerit-json": payload.master_demerit_json,
        "data-master-demerit-options": _json_text(payload.master_demerit_options),
        "data-master-demerit-options-map": _json_text(
            payload.master_demerit_options_by_type
        ),
        "data-master-demerit-csv-map": _json_text(payload.master_demerit_csv_map),
        "data-master-demerit-rules-map": _json_text(
            payload.master_demerit_rules_by_type
        ),
        "data-datasets": _json_text(payload.datasets, allow_empty=True),
        "data-active-dataset": str(payload.active_dataset_index),
        "data-core-script": core_script,
    }

    if payload.item_image_view_box:
        attrs["style"] = f"--item-image-view-box: {payload.item_image_view_box};"
        attrs["data-default-item-image-view-box"] = payload.item_image_view_box

    if app_version:
        attrs["data-app-version"] = app_version

    return _join_attrs(attrs)


def generate_html(
    results_path,
    img_dir,
    output_html,
    label_symbols: Optional[Sequence[object]] = None,
    master_csv_path: Optional[str] = None,
    master_json_path: Optional[str] = None,
    master_demerit_csv_path: Optional[str] = None,
    master_demerit_json_path: Optional[str] = None,
    template_path: Optional[str] = None,
    css_template_path: Optional[str] = None,
    js_template_path: Optional[str] = None,
    css_output_name: Optional[str] = None,
    js_output_name: Optional[str] = None,
    master_options: Optional[Sequence[object]] = None,
    master_demerit_options: Optional[Sequence[object]] = None,
    datasets=None,
    active_dataset_index: int = 0,
    item_image_view_box: Optional[str] = None,
    css_relative_override: Optional[str] = None,
    js_relative_override: Optional[str] = None,
    datasets_base_dir: Optional[str] = None,
    *,
    config: Optional[GalleryConfig] = None,
    dependencies: Optional[GalleryDependencies] = None,
) -> GalleryPayload:
    """ギャラリーHTMLを生成し、作成したペイロードを返す."""

    config = config or default_config()
    app_version = version_info.get_version()
    output_dir = os.path.dirname(os.path.abspath(output_html)) or "."
    os.makedirs(output_dir, exist_ok=True)

    payload = build_gallery_payload(
        results_path=results_path,
        img_dir=img_dir,
        output_dir=output_dir,
        datasets_base_dir=datasets_base_dir,
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
        config=config,
        dependencies=dependencies,
    )

    for message in payload.warnings:
        print(message)

    html_template = load_text_asset(config.template_html_path, template_path)

    partials_dir = Path(template_path or config.template_html_path).parent / "gallery" / "partials"
    html_template = render_template_with_partials(html_template, partials_dir=partials_dir)

    asset_replacements = {"__APP_VERSION__": app_version}

    assets = gallery_assets.prepare_gallery_assets(
        output_dir,
        css_template_path=config.template_css_path,
        css_override_template=css_template_path,
        css_output_name=css_output_name or "gallery.css",
        css_relative_override=css_relative_override,
        index_template_path=config.template_index_js_path,
        index_relative_path="index.js",
        core_template_path=config.template_core_js_path,
        core_override_template=js_template_path,
        core_output_name=js_output_name or "gallery.js",
        core_relative_override=js_relative_override,
        modules=gallery_assets.ADDITIONAL_GALLERY_SCRIPTS,
        replacements=asset_replacements,
    )

    css_reference = gallery_assets.cache_bust_reference(assets.css)
    index_reference = gallery_assets.cache_bust_reference(assets.index_js)
    core_js_reference = gallery_assets.cache_bust_reference(assets.core_js)

    bootstrap_data = _build_bootstrap_data(
        payload, app_version=app_version, core_script=core_js_reference
    )
    bootstrap_json_path = os.path.join(output_dir, "gallery_data.json")
    with open(bootstrap_json_path, "w", encoding="utf-8") as handle:
        json.dump(bootstrap_data, handle, ensure_ascii=False, indent=2)

    bootstrap_asset = gallery_assets.PreparedAsset(
        "gallery_data.json", bootstrap_json_path
    )
    bootstrap_reference = gallery_assets.cache_bust_reference(bootstrap_asset)

    body_attributes = _build_body_attributes(
        payload,
        bootstrap_reference=bootstrap_reference,
        core_script=core_js_reference,
        app_version=app_version,
    )

    replacements = {
        "__CSS_FILE__": _escape_attr(css_reference),
        "__JS_FILE__": _escape_attr(index_reference),
        "__BOOTSTRAP_JSON__": _escape_attr(bootstrap_reference),
        "__BODY_ATTRIBUTES__": body_attributes,
    }

    html_output = render_gallery_template(html_template, replacements)

    with open(output_html, "w", encoding="utf-8") as handle:
        handle.write(html_output)

    print(f"[✓] {output_html} を生成しました！ ブラウザで開いてください。")

    return payload


__all__ = [
    "GalleryConfig",
    "GalleryDependencies",
    "GalleryPayload",
    "generate_html",
    "load_text_asset",
    "render_gallery_template",
]

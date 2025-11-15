"""ギャラリーHTMLレンダリング処理."""
from __future__ import annotations

import html
import json
import os
from typing import Optional, Sequence

import gallery_assets

from .config import GalleryConfig, default_config
from .models import GalleryDependencies, GalleryPayload, build_gallery_payload


def _escape_attr(value: str) -> str:
    return html.escape(value or "", quote=True)


def _resolve_asset_path(default_path: str, override: Optional[str]) -> str:
    if not override:
        return default_path
    if os.path.isabs(override):
        return override
    base_dir = os.path.dirname(__file__)
    return os.path.join(base_dir, override)


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


def _serialize_payload(payload: GalleryPayload) -> dict[str, str]:
    embed_options = payload.master_options if not payload.master_json else []
    embed_demerit_options = (
        payload.master_demerit_options if not payload.master_demerit_json else []
    )

    return {
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
        "__DATASETS__": _escape_attr(json.dumps(payload.datasets, ensure_ascii=False)),
        "__ACTIVE_DATASET__": _escape_attr(str(payload.active_dataset_index)),
        "__ITEM_IMAGE_VIEW_BOX__": _escape_attr(payload.item_image_view_box),
    }


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
    )

    css_reference = gallery_assets.cache_bust_reference(assets.css)
    index_reference = gallery_assets.cache_bust_reference(assets.index_js)
    core_js_reference = gallery_assets.cache_bust_reference(assets.core_js)

    replacements = _serialize_payload(payload)
    replacements.update(
        {
            "__CSS_FILE__": _escape_attr(css_reference),
            "__JS_FILE__": _escape_attr(index_reference),
            "__CORE_JS__": _escape_attr(core_js_reference),
        }
    )

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

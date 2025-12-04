"""ギャラリービュー用の静的アセットを準備するユーティリティ."""
from __future__ import annotations

import os
import shutil
from pathlib import Path
from dataclasses import dataclass
from typing import Optional, Sequence

from resource_paths import project_root, templates_path

ADDITIONAL_GALLERY_SCRIPTS: tuple[str, ...] = (
    "gallery/js/modules/moduleEntries.js",
    "gallery/js/modules/tagTokens.js",
    "gallery/js/modules/tagTokenResolvers.js",
    "gallery/js/modules/filterPredicates.js",
    "gallery/utils/dom.js",
    "gallery/utils/data.js",
    "gallery/utils/records.js",
    "gallery/dataset/utils.js",
    "gallery/utils/filter.js",
    "gallery/utils/filterState.js",
    "gallery/utils/renderData.js",
    "gallery/utils/summary.js",
    "gallery/state/store.js",
    "gallery/stores/filterStore.js",
    "gallery/stores/tagStore.js",
    "gallery/stores/tagStateBridge.js",
    "gallery/app/layout.js",
    "gallery/app/stateApi.js",
    "gallery/dataset/manager.js",
    "gallery/storage/utils.js",
    "gallery/storage/manager.js",
    "gallery/app/controller.js",
    "gallery/components/sharedResolvers.js",
    "gallery/components/tagTokenDefaults.js",
    "gallery/components/tagTokenParsersBridge.js",
    "gallery/components/tagTokenResolvers.js",
    "gallery/components/tagDebug.js",
    "gallery/components/tomSelectAdapterFactory.js",
    "gallery/components/tomSelectAdapter.js",
    "gallery/components/tagSearch.js",
    "gallery/components/tagInput.js",
    "gallery/render/effectViewModel.js",
    "gallery/render/effectFactory.js",
    "gallery/render/itemEnhancers.js",
    "gallery/render/itemFactory.js",
    "gallery/render/galleryView.js",
    "gallery/events/recordActionHandlers.js",
    "gallery/events/tagInputEvents.js",
    "gallery/events/galleryEvents.js",
    "gallery/vendor/tom-select/tom-select.complete.js",
    "gallery/vendor/tom-select/tom-select.css",
    "gallery/styles/tom-select.css",
)


@dataclass(frozen=True)
class PreparedAsset:
    """コピー済みまたは外部参照するアセットのパス情報."""

    relative_path: str
    absolute_path: Optional[str]


@dataclass(frozen=True)
class GalleryAssets:
    """ギャラリー表示に必要な主要アセットの集合."""

    css: PreparedAsset
    index_js: PreparedAsset
    core_js: PreparedAsset


def _resolve_asset_path(default_path: str, override: Optional[str]) -> str:
    if not override:
        return default_path
    if os.path.isabs(override):
        return override
    base_dir = project_root()
    return os.path.join(str(base_dir), override)


def _normalize_relative_path(path: str) -> str:
    return path.replace(os.sep, "/")


def _apply_replacements(content: str, replacements: dict[str, str]) -> str:
    rendered = content
    for placeholder, value in replacements.items():
        rendered = rendered.replace(placeholder, value)
    return rendered


def copy_static_asset(
    default_path: str,
    output_dir: str,
    *,
    override_template: Optional[str] = None,
    target_relative_path: Optional[str] = None,
    replacements: Optional[dict[str, str]] = None,
) -> PreparedAsset:
    """静的ファイルをコピーし、コピー先と相対パスを返す."""

    source = _resolve_asset_path(default_path, override_template)
    relative_path = target_relative_path or os.path.basename(source)
    destination = os.path.join(output_dir, relative_path)
    os.makedirs(os.path.dirname(destination), exist_ok=True)
    try:
        if replacements:
            content = _apply_replacements(
                Path(source).read_text(encoding="utf-8"), replacements
            )
            Path(destination).write_text(content, encoding="utf-8")
        else:
            shutil.copyfile(source, destination)
    except FileNotFoundError as exc:
        raise FileNotFoundError(f"静的アセットが見つかりません: {source}") from exc
    return PreparedAsset(
        relative_path=_normalize_relative_path(relative_path),
        absolute_path=destination,
    )


def _asset_from_override(output_dir: str, override: str) -> PreparedAsset:
    normalized = override.replace("\\", "/")
    if "://" in override:
        return PreparedAsset(relative_path=normalized, absolute_path=None)
    if os.path.isabs(override):
        absolute_path = override
    else:
        candidate = os.path.join(output_dir, override)
        absolute_path = candidate if os.path.exists(candidate) else None
    return PreparedAsset(relative_path=normalized, absolute_path=absolute_path)


def cache_bust_reference(asset: PreparedAsset) -> str:
    """mtime を基にクエリストリングを付与した参照を返す."""

    if not asset.relative_path or not asset.absolute_path:
        return asset.relative_path
    try:
        version = str(int(os.path.getmtime(asset.absolute_path)))
    except OSError:
        return asset.relative_path
    separator = "&" if "?" in asset.relative_path else "?"
    return f"{asset.relative_path}{separator}v={version}"


def copy_gallery_modules(
    output_dir: str,
    *,
    modules: Sequence[str] = ADDITIONAL_GALLERY_SCRIPTS,
) -> None:
    """追加のギャラリーモジュールを出力ディレクトリへコピーする."""

    for relative in modules:
        source_path = templates_path(relative)
        normalized = relative.replace("/", os.sep)
        if normalized.startswith(f"gallery{os.sep}"):
            normalized = normalized[len(f"gallery{os.sep}") :]
        destination = os.path.join(output_dir, normalized)
        os.makedirs(os.path.dirname(destination), exist_ok=True)
        shutil.copyfile(str(source_path), destination)


def prepare_gallery_assets(
    output_dir: str,
    *,
    css_template_path: str,
    css_override_template: Optional[str] = None,
    css_output_name: Optional[str] = None,
    css_relative_override: Optional[str] = None,
    index_template_path: str,
    index_relative_path: str,
    core_template_path: str,
    core_override_template: Optional[str] = None,
    core_output_name: Optional[str] = None,
    core_relative_override: Optional[str] = None,
    modules: Sequence[str] = ADDITIONAL_GALLERY_SCRIPTS,
    replacements: Optional[dict[str, str]] = None,
) -> GalleryAssets:
    """ギャラリーHTMLで利用するアセット一式を準備して返す."""

    if css_relative_override is not None:
        css_asset = _asset_from_override(output_dir, css_relative_override)
    else:
        css_asset = copy_static_asset(
            css_template_path,
            output_dir,
            override_template=css_override_template,
            target_relative_path=css_output_name,
            replacements=replacements,
        )

    index_asset = copy_static_asset(
        index_template_path,
        output_dir,
        target_relative_path=index_relative_path,
        replacements=replacements,
    )

    if core_relative_override is not None:
        core_asset = _asset_from_override(output_dir, core_relative_override)
    else:
        core_asset = copy_static_asset(
        core_template_path,
        output_dir,
        override_template=core_override_template,
        target_relative_path=core_output_name,
        replacements=replacements,
    )

    copy_gallery_modules(output_dir, modules=modules)

    return GalleryAssets(css=css_asset, index_js=index_asset, core_js=core_asset)


__all__ = [
    "ADDITIONAL_GALLERY_SCRIPTS",
    "GalleryAssets",
    "PreparedAsset",
    "cache_bust_reference",
    "copy_gallery_modules",
    "copy_static_asset",
    "prepare_gallery_assets",
]

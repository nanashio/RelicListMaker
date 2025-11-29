"""ギャラリーHTMLテンプレートのパーシャル読込ユーティリティ."""
from __future__ import annotations

from pathlib import Path
from typing import Mapping, MutableMapping, Optional

from resource_paths import templates_path

DEFAULT_PARTIAL_PLACEHOLDERS: Mapping[str, str] = {
    "__GALLERY_HEADER__": "header.html",
    "__GALLERY_TOOLBAR__": "toolbar.html",
    "__GALLERY_STORAGE_CONTROLS__": "storage_controls.html",
    "__GALLERY_VIEWBOX__": "viewbox_controls.html",
    "__GALLERY_LIGHTBOX__": "lightbox.html",
}


def _resolve_partials_dir(partials_dir: Optional[Path | str]) -> Path:
    if partials_dir is None:
        return Path(templates_path("gallery/partials"))
    return Path(partials_dir)


def _load_partial_content(partials_dir: Path, relative_path: str) -> str:
    candidate = partials_dir / relative_path
    try:
        return candidate.read_text(encoding="utf-8")
    except FileNotFoundError:
        return ""


def render_template_with_partials(
    template_text: str,
    *,
    partials_dir: Optional[Path | str] = None,
    placeholder_paths: Mapping[str, str] = DEFAULT_PARTIAL_PLACEHOLDERS,
) -> str:
    """テンプレート中のパーシャルプレースホルダーを置き換える."""

    if not template_text:
        return ""

    resolved_dir = _resolve_partials_dir(partials_dir)
    replacements: MutableMapping[str, str] = {}

    for placeholder, relative_path in placeholder_paths.items():
        replacements[placeholder] = _load_partial_content(resolved_dir, relative_path)

    rendered = template_text
    for placeholder, value in replacements.items():
        rendered = rendered.replace(placeholder, value)
    return rendered


__all__ = ["render_template_with_partials", "DEFAULT_PARTIAL_PLACEHOLDERS"]

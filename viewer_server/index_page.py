"""インデックスページ生成ロジック."""
from __future__ import annotations

import html
from functools import lru_cache
from pathlib import Path
from string import Template
from typing import Iterable
from urllib.parse import quote

from .assets import load_text_asset

_TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "templates" / "index.html"


@lru_cache(maxsize=1)
def _load_template() -> Template:
    text = load_text_asset(_TEMPLATE_PATH)
    return Template(text)


def iter_gallery_files(results_dir: Path) -> list[Path]:
    legacy_pattern = "*_viewer.html"
    files = list(results_dir.rglob(legacy_pattern))

    modern_pattern = "gallery/index.html"
    files.extend(results_dir.rglob(modern_pattern))

    root_viewer = results_dir / "viewer.html"
    if root_viewer.exists():
        files.append(root_viewer)

    return sorted({path.resolve() for path in files})


def render_index(results_dir: Path, gallery_files: Iterable[Path]) -> str:
    entries = []
    for html_path in gallery_files:
        try:
            relative = html_path.relative_to(results_dir)
        except ValueError:
            continue
        rel_posix = relative.as_posix()
        if rel_posix.endswith("gallery/index.html"):
            display_base = rel_posix[: -len("gallery/index.html")] or "gallery"
            display = display_base.rstrip("/") or "gallery"
        elif rel_posix.endswith("_viewer.html"):
            display = rel_posix[:-len("_viewer.html")]
        else:
            display = rel_posix
        item = f'<li><a href="/{quote(rel_posix)}">{html.escape(display)}</a></li>'
        entries.append(item)

    if entries:
        body = "<p>クリックすると対象のビューワを開きます。</p><ul>" + "\n".join(entries) + "</ul>"
    else:
        body = (
            "<p>表示できるビューワが見つかりませんでした。"
            " `results/` に <code>gallery/index.html</code> または <code>*_viewer.html</code> を出力してから再度アクセスしてください。</p>"
        )

    template = _load_template()
    return template.substitute(body=body)

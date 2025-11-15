"""Playwright 用の結果ディレクトリを構築して viewer_server を起動するユーティリティ."""
from __future__ import annotations

import argparse
import html
import json
import os
import shutil
import struct
import sys
import zlib
from pathlib import Path

DEFAULT_ITEM_IMAGE_VIEW_BOX = "inset(0px 180px 0px 0px)"  # generate_gallery.DEFAULT_ITEM_IMAGE_VIEW_BOX と同期すること


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _build_fixture_tree(base_dir: Path) -> None:
    if base_dir.exists():
        shutil.rmtree(base_dir)
    base_dir.mkdir(parents=True, exist_ok=True)

    sample_dir = base_dir / "sample"
    gallery_dir = sample_dir / "gallery"
    gallery_dir.mkdir(parents=True, exist_ok=True)

    crops_dir = gallery_dir / "crops"
    crops_dir.mkdir(parents=True, exist_ok=True)

    templates_dir = _repo_root() / "templates"
    shutil.copy2(templates_dir / "gallery" / "gallery.css", gallery_dir / "gallery.css")
    shutil.copy2(templates_dir / "gallery" / "gallery.js", gallery_dir / "gallery.js")
    shutil.copy2(templates_dir / "gallery" / "index.js", gallery_dir / "index.js")

    additional_scripts = [
        Path('gallery/utils/dom.js'),
        Path('gallery/utils/data.js'),
        Path('gallery/utils/records.js'),
        Path('gallery/dataset/utils.js'),
        Path('gallery/utils/filter.js'),
        Path('gallery/state/store.js'),
        Path('gallery/app/stateApi.js'),
        Path('gallery/dataset/manager.js'),
        Path('gallery/storage/utils.js'),
        Path('gallery/storage/manager.js'),
        Path('gallery/app/controller.js'),
        Path('gallery/render/effectViewModel.js'),
        Path('gallery/render/effectFactory.js'),
        Path('gallery/render/itemEnhancers.js'),
        Path('gallery/render/itemFactory.js'),
        Path('gallery/render/galleryView.js'),
        Path('gallery/events/recordActionHandlers.js'),
        Path('gallery/events/galleryEvents.js')
    ]
    for relative in additional_scripts:
        source = templates_dir / relative
        destination = gallery_dir / relative.relative_to(Path("gallery"))
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)

    _write_png(crops_dir / "sample_red.png", (220, 38, 38))
    _write_png(crops_dir / "sample_blue.png", (37, 99, 235))
    _write_png(crops_dir / "sample_green.png", (34, 139, 34))

    (gallery_dir / "sample.csv").write_text(
        "Image,Duplicate,ItemColor,Effect1,Effect1Score,Effect1Source,Effect1Status,RawText1,Effect1Level,Effect1LevelOptions,RelicType\n"
        "sample_red.png,False,red,神秘,95.0,神秘,pass,神秘,none,none,normal\n"
        "sample_blue.png,False,blue,最大HP上昇,85.0,最大HP上昇,pending,最大HPが上昇,none,none,normal\n"
        "sample_green.png,False,green,物理攻撃力上昇,88.0,物理攻撃力上昇,pending,物理攻撃力上昇,none,none|＋１|＋２|＋３|＋４,deep\n",
        encoding="utf-8",
        newline="\n",
    )

    template = (templates_dir / "gallery.html").read_text(encoding="utf-8")
    master_options = [
        "神秘",
        "最大HP上昇",
        "物理攻撃力上昇",
        "炎のダメージ",
    ]

    master_levels = {
        "神秘": ["none"],
        "最大HP上昇": ["none"],
        "物理攻撃力上昇": ["none", "＋１", "＋２", "＋３", "＋４"],
    }

    master_levels_by_type = {
        "normal": {
            "神秘": ["none"],
            "最大HP上昇": ["none"],
            "物理攻撃力上昇": ["none", "＋１", "＋２"],
        },
        "deep": {
            "神秘": ["none"],
            "最大HP上昇": ["none"],
            "物理攻撃力上昇": ["none", "＋１", "＋２", "＋３", "＋４"],
        },
    }

    def _escape_attr(value: str) -> str:
        return html.escape(value or "", quote=True)

    replacements = {
        "__CSS_FILE__": "gallery.css",
        "__JS_FILE__": "index.js",
        "__CORE_JS__": "gallery.js",
        "__RESULTS_CSV__": "sample.csv",
        "__IMAGE_DIR__": "crops",
        "__LABEL_SYMBOLS__": json.dumps(["①", "②", "③"], ensure_ascii=False),
        "__MASTER_CSV__": "",
        "__MASTER_JSON__": "",
        "__MASTER_OPTIONS__": json.dumps(master_options, ensure_ascii=False),
        "__MASTER_OPTIONS_MAP__": json.dumps({}, ensure_ascii=False),
        "__MASTER_LEVELS__": json.dumps(master_levels, ensure_ascii=False),
        "__MASTER_LEVELS_BY_TYPE__": json.dumps(master_levels_by_type, ensure_ascii=False),
        "__MASTER_CSV_MAP__": json.dumps({}, ensure_ascii=False),
        "__MASTER_DEMERIT_CSV__": "",
        "__MASTER_DEMERIT_JSON__": "",
        "__MASTER_DEMERIT_OPTIONS__": json.dumps([], ensure_ascii=False),
        "__MASTER_DEMERIT_OPTIONS_MAP__": json.dumps({}, ensure_ascii=False),
        "__MASTER_DEMERIT_CSV_MAP__": json.dumps({}, ensure_ascii=False),
        "__MASTER_DEMERIT_RULES_MAP__": json.dumps({}, ensure_ascii=False),
        "__DATASETS__": json.dumps([], ensure_ascii=False),
        "__ACTIVE_DATASET__": "0",
        "__ITEM_IMAGE_VIEW_BOX__": DEFAULT_ITEM_IMAGE_VIEW_BOX,
    }

    viewer_html = template
    for placeholder, raw_value in replacements.items():
        viewer_html = viewer_html.replace(placeholder, _escape_attr(raw_value))
    (gallery_dir / "index.html").write_text(viewer_html, encoding="utf-8")


def _write_png(path: Path, rgb: tuple[int, int, int]) -> None:
    width = height = 1
    bit_depth = 8
    color_type = 2  # Truecolor (RGB)

    def chunk(chunk_type: bytes, data: bytes) -> bytes:
        length = struct.pack(">I", len(data))
        crc = struct.pack(">I", zlib.crc32(chunk_type + data) & 0xFFFFFFFF)
        return length + chunk_type + data + crc

    ihdr_data = struct.pack(">IIBBBBB", width, height, bit_depth, color_type, 0, 0, 0)
    raw_scanline = bytes([0, *rgb])
    idat_data = zlib.compress(raw_scanline)

    png_bytes = bytearray()
    png_bytes.extend(b"\x89PNG\r\n\x1a\n")
    png_bytes.extend(chunk(b"IHDR", ihdr_data))
    png_bytes.extend(chunk(b"IDAT", idat_data))
    png_bytes.extend(chunk(b"IEND", b""))

    path.write_bytes(bytes(png_bytes))


def main() -> None:
    parser = argparse.ArgumentParser(description="Setup viewer fixture and launch viewer_server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default="4173")
    args = parser.parse_args()

    repo_root = _repo_root()
    fixture_root = repo_root / "build" / "playwright_viewer"
    _build_fixture_tree(fixture_root)

    os.execv(
        sys.executable,
        [
            sys.executable,
            str(repo_root / "viewer_server.py"),
            "--results-dir",
            str(fixture_root),
            "--host",
            str(args.host),
            "--port",
            str(args.port),
        ],
    )


if __name__ == "__main__":
    main()

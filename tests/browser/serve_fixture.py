"""Playwright 用の結果ディレクトリを構築して viewer_server を起動するユーティリティ."""
from __future__ import annotations

import argparse
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

    (gallery_dir / "sample.csv").write_text(
        "Image,Duplicate,ItemColor,Effect1,Effect1Score,Effect1Source,Effect1Status,RawText1\n"
        "sample_red.png,False,red,神秘,95.0,神秘,pass,神秘\n"
        "sample_blue.png,False,blue,最大HP上昇,85.0,最大HP上昇,pending,最大HPが上昇\n",
        encoding="utf-8",
        newline="\n",
    )

    template = (templates_dir / "gallery.html").read_text(encoding="utf-8")
    viewer_html = (
        template
        .replace("__CSS_FILE__", "gallery.css")
        .replace("__JS_FILE__", "index.js")
        .replace("__CORE_JS__", "gallery.js")
        .replace("__RESULTS_CSV__", "sample.csv")
        .replace("__IMAGE_DIR__", "crops")
        .replace("__LABEL_SYMBOLS__", "[\"①\", \"②\", \"③\"]")
        .replace("__MASTER_CSV__", "")
        .replace("__MASTER_JSON__", "")
        .replace("__MASTER_OPTIONS__", "[]")
        .replace("__MASTER_OPTIONS_MAP__", "{}")
        .replace("__MASTER_LEVELS__", "{}")
        .replace("__MASTER_LEVELS_BY_TYPE__", "{}")
        .replace("__MASTER_CSV_MAP__", "{}")
        .replace("__MASTER_DEMERIT_CSV__", "")
        .replace("__MASTER_DEMERIT_JSON__", "")
        .replace("__MASTER_DEMERIT_OPTIONS__", "[]")
        .replace("__MASTER_DEMERIT_OPTIONS_MAP__", "{}")
        .replace("__MASTER_DEMERIT_CSV_MAP__", "{}")
        .replace("__DATASETS__", "[]")
        .replace("__ACTIVE_DATASET__", "0")
        .replace("__ITEM_IMAGE_VIEW_BOX__", DEFAULT_ITEM_IMAGE_VIEW_BOX)
    )
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

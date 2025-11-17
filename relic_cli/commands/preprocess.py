"""preprocess サブコマンド。"""
from __future__ import annotations

import argparse
from pathlib import Path

from relic_pipeline.settings import DEFAULT_RESIZE_SCALE


def register_subcommand(subparsers: argparse._SubParsersAction[argparse.ArgumentParser]) -> None:
    parser = subparsers.add_parser(
        "preprocess",
        help="OCR向けの前処理を単発画像に適用",
    )
    parser.add_argument("image", help="入力画像ファイル")
    parser.add_argument("--out", default="preprocessed", help="出力ディレクトリ")
    parser.add_argument(
        "--scale",
        type=float,
        default=DEFAULT_RESIZE_SCALE,
        help=f"拡大倍率 (デフォルト: {DEFAULT_RESIZE_SCALE})",
    )
    parser.add_argument("--nosave", action="store_true", help="保存せず配列のみ返す")
    parser.add_argument(
        "--no-threshold",
        action="store_true",
        help="Otsu 二値化をスキップ",
    )
    parser.add_argument(
        "--no-denoise",
        action="store_true",
        help="メディアンブラーによるノイズ除去をスキップ",
    )
    parser.set_defaults(handler=_handle)


def _handle(args: argparse.Namespace) -> int:
    from preprocess import preprocess_for_ocr

    image_path = Path(args.image)
    if not image_path.exists():
        raise FileNotFoundError(f"画像が見つかりません: {image_path}")

    preprocess_for_ocr(
        str(image_path),
        args.out,
        args.scale,
        apply_threshold=not args.no_threshold,
        denoise=not args.no_denoise,
        save=not args.nosave,
    )
    return 0

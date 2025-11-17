"""preprocess サブコマンド."""
from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import Any

from relic_pipeline.ocr.preprocess import prepare_for_ocr
from relic_pipeline.settings import DEFAULT_RESIZE_SCALE

DEFAULT_OUTPUT_DIR = "preprocessed"


def upscale_image(img: Any, scale: float = 2.0):
    """画像を拡大（スケールはfloat対応）"""

    import cv2  # 遅延インポートでCLI起動時の依存を軽減

    return cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)


def preprocess_for_ocr(
    img_path: str | os.PathLike[str],
    out_dir: str = DEFAULT_OUTPUT_DIR,
    scale: float = DEFAULT_RESIZE_SCALE,
    *,
    apply_threshold: bool = True,
    denoise: bool = True,
    save: bool = True,
):
    """OCR用の前処理を単発画像に適用する."""

    path = Path(img_path)
    if not path.exists():
        print(f"[ERROR] ファイルが見つかりません: {path}")
        return None

    import cv2  # pylint: disable=import-error

    img = cv2.imread(str(path))
    if img is None:
        print(f"[ERROR] 画像を開けませんでした: {path}")
        return None

    th = prepare_for_ocr(
        img,
        resize_scale=scale,
        apply_threshold=apply_threshold,
        denoise=denoise,
    )

    if save:
        out_path = Path(out_dir)
        out_path.mkdir(parents=True, exist_ok=True)
        destination = out_path / path.name
        cv2.imwrite(str(destination), th)
        return str(destination)
    return th


def register_subcommand(subparsers: argparse._SubParsersAction[argparse.ArgumentParser]) -> None:
    parser = subparsers.add_parser(
        "preprocess",
        help="OCR向けの前処理を単発画像に適用",
    )
    parser.add_argument("image", help="入力画像ファイル")
    parser.add_argument("--out", default=DEFAULT_OUTPUT_DIR, help="出力ディレクトリ")
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
    result = preprocess_for_ocr(
        args.image,
        args.out,
        args.scale,
        apply_threshold=not args.no_threshold,
        denoise=not args.no_denoise,
        save=not args.nosave,
    )
    if result is None:
        return 1
    return 0


__all__ = ["preprocess_for_ocr", "upscale_image"]

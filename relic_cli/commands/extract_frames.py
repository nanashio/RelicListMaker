"""extract-frames サブコマンド。"""
from __future__ import annotations

import argparse
from pathlib import Path

from relic_cli import utils


def register_subcommand(subparsers: argparse._SubParsersAction[argparse.ArgumentParser]) -> None:
    parser = subparsers.add_parser(
        "extract-frames",
        help="動画からフレームを抽出してクロップ",
    )
    parser.add_argument("video", help="入力動画パス")
    parser.add_argument(
        "--frame-dir",
        default="frames",
        help="フルフレーム保存ディレクトリ (デフォルト: frames)",
    )
    parser.add_argument(
        "--crop-dir",
        default="crops",
        help="クロップ画像の出力ディレクトリ (デフォルト: crops)",
    )
    parser.add_argument(
        "--skip-full",
        action="store_true",
        help="フルフレームの保存をスキップする",
    )
    parser.set_defaults(handler=_handle)


def _handle(args: argparse.Namespace) -> int:
    from pipeline.extraction import extract_and_crop

    video_path = Path(args.video)
    if not video_path.exists():
        raise FileNotFoundError(f"動画が見つかりません: {video_path}")

    frame_dir = utils.ensure_directory(args.frame_dir)
    crop_dir = utils.ensure_directory(args.crop_dir)

    extract_and_crop(
        str(video_path),
        frame_dir=str(frame_dir),
        crop_dir=str(crop_dir),
        save_full_frames=not args.skip_full,
    )
    return 0

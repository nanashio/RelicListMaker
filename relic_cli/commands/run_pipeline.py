"""run-pipeline サブコマンド."""
from __future__ import annotations

import argparse

from relic_cli import utils

DEFAULT_VIDEO_DIR = "videos"
DEFAULT_RESULT_DIR = "results"
DEFAULT_OCR_UPSAMPLE = 1.5
DEFAULT_OCR_ENGINE = "tesseract"
DEFAULT_GCP_CREDENTIALS_FILENAME = "service-account-file.json"


def register_subcommand(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> None:
    parser = subparsers.add_parser(
        "run-pipeline",
        help="動画の処理からHTML生成まで一括実行",
    )
    parser.add_argument(
        "--video-dir",
        default=DEFAULT_VIDEO_DIR,
        help=f"処理対象の動画ディレクトリ (デフォルト: {DEFAULT_VIDEO_DIR})",
    )
    parser.add_argument(
        "--result-dir",
        default=DEFAULT_RESULT_DIR,
        help=f"出力ディレクトリ (デフォルト: {DEFAULT_RESULT_DIR})",
    )
    parser.add_argument(
        "--ocr-upsample",
        type=float,
        default=DEFAULT_OCR_UPSAMPLE,
        help="OCR 前のリサイズ倍率 (例: 1.5)",
    )
    parser.add_argument(
        "--ocr-engine",
        choices=("tesseract", "vision", "none"),
        default=DEFAULT_OCR_ENGINE,
        help="OCR エンジンの選択 (none でOCRを無効化)",
    )
    parser.add_argument(
        "--gcp-credentials",
        help="Google Cloud Vision API 用のサービスアカウントJSON",
    )
    parser.add_argument(
        "--gcp-credentials-filename",
        default=DEFAULT_GCP_CREDENTIALS_FILENAME,
        help="結果ディレクトリに保存する資格情報ファイル名",
    )
    parser.add_argument(
        "--video-file",
        dest="video_files",
        action="append",
        metavar="PATH",
        help="個別に処理する動画を指定 (複数回指定可)",
    )
    parser.add_argument(
        "--item-color",
        dest="item_colors",
        action="append",
        type=utils.key_value_pair,
        metavar="PATH=COLOR",
        help="クロップ色の手動指定 (例: sample.mp4=#ffaa00)",
    )
    parser.add_argument(
        "--relic-type",
        dest="relic_types",
        action="append",
        type=utils.key_value_pair,
        metavar="PATH=TYPE",
        help="レリック種別の上書き (例: sample.mp4=deep)",
    )
    parser.add_argument(
        "--csv-column",
        dest="csv_columns",
        action="append",
        type=utils.key_bool_pair,
        metavar="NAME=BOOL",
        help="CSVの列表示可否を指定 (例: rarity=false)",
    )
    parser.add_argument(
        "--item-image-view-box",
        help="ギャラリーの object-view-box を上書き",
    )
    parser.add_argument(
        "--save-full-frames",
        action="store_true",
        help="フルフレーム画像も保存する",
    )
    parser.add_argument(
        "--templates-only",
        action="store_true",
        help="既存のCSVや画像を変更せず、ギャラリーのテンプレートだけ更新する",
    )
    parser.set_defaults(handler=_handle)


def _handle(args: argparse.Namespace) -> int:
    from pipeline import (
        CliProgressReporter,
        PipelineSettings,
        run_pipeline,
    )

    settings = PipelineSettings(
        video_dir=args.video_dir,
        result_dir=args.result_dir,
        ocr_upsample=args.ocr_upsample,
        ocr_engine=args.ocr_engine,
        gcp_credentials=args.gcp_credentials,
        gcp_credentials_filename=args.gcp_credentials_filename,
        video_files=args.video_files,
        item_color_overrides=dict(args.item_colors or []),
        relic_type_overrides=dict(args.relic_types or []),
        save_full_frames=args.save_full_frames,
        csv_column_visibility=dict(args.csv_columns or []),
        item_image_view_box=args.item_image_view_box,
        templates_only=args.templates_only,
    )
    reporter = CliProgressReporter()
    result = run_pipeline(settings=settings, reporter=reporter)
    print(f"[INFO] ギャラリーの出力先: {result.viewer_path}")
    return 0

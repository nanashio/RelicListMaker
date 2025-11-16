"""Standalone CLI entrypoint for OCR processing commands."""

from __future__ import annotations

import argparse
from typing import Sequence

from relic_pipeline.cli.commands import process_images_command
from relic_pipeline.settings import DEFAULT_GCP_CREDENTIALS_FILENAME, DEFAULT_RESIZE_SCALE


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="クロップ済み画像に対してOCRと辞書マッチングを実行し、CSVを生成します。",
    )
    parser.add_argument(
        "image_dir",
        nargs="?",
        default="crops",
        help="OCR 対象の画像ディレクトリ",
    )
    parser.add_argument(
        "--output",
        "-o",
        dest="output_path",
        default="results.csv",
        help="出力先CSVパス",
    )
    parser.add_argument(
        "--scale",
        type=float,
        default=1.0,
        help="クロップ領域の倍率 (BASE_CROP_BOXES に適用)",
    )
    parser.add_argument(
        "--upsample",
        type=float,
        default=DEFAULT_RESIZE_SCALE,
        help="OCR 前処理時のアップサンプリング倍率",
    )
    parser.add_argument(
        "--no-preprocess",
        dest="preprocess",
        action="store_false",
        help="前処理をスキップする場合に指定",
    )
    parser.set_defaults(preprocess=True)
    parser.add_argument(
        "--corrections",
        dest="corrections_csv",
        default=None,
        help="フィードバックCSVのパス",
    )
    parser.add_argument(
        "--master-csv",
        dest="master_csv_path",
        default=None,
        help="効果辞書として利用する CSV のパス",
    )
    parser.add_argument(
        "--demerit-master-csv",
        dest="demerit_master_csv_path",
        default=None,
        help="深層遺物向けデメリット辞書の CSV パス",
    )
    parser.add_argument(
        "--item-color",
        dest="item_color",
        default=None,
        help="CSV に埋め込むアイテム色の固定値",
    )
    parser.add_argument(
        "--column",
        dest="column_visibility",
        action="append",
        metavar="NAME=BOOL",
        help="列の表示/非表示を上書き (例: --column RawText=false)",
    )
    parser.add_argument(
        "--relic-type",
        dest="relic_type",
        choices=["normal", "deep"],
        default=None,
        help="遺物の種別 (深層遺物を処理する場合は deep)",
    )
    parser.add_argument(
        "--ocr-engine",
        dest="ocr_engine",
        choices=["tesseract", "vision"],
        default="tesseract",
        help="OCR エンジンを選択します (デフォルト: tesseract)",
    )
    parser.add_argument(
        "--gcp-credentials",
        dest="gcp_credentials",
        default=None,
        help="Google Cloud Vision API 用の認証 JSON パス",
    )
    parser.add_argument(
        "--gcp-credentials-filename",
        dest="gcp_credentials_filename",
        default=DEFAULT_GCP_CREDENTIALS_FILENAME,
        help="実行ファイルと同じディレクトリに配置した Vision 認証ファイル名",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    return process_images_command(args)


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    raise SystemExit(main())

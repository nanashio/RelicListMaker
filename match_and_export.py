"""CLI 互換を維持するためのレガシーラッパー."""

from __future__ import annotations

from relic_pipeline import processing
from relic_pipeline.cli import process_images_command
from relic_pipeline.cli.main import build_arg_parser, main as cli_main

# 後方互換用に `match_and_export` から従来の名前を再公開する
BUNDLED_TESSERACT = processing.BUNDLED_TESSERACT
COLUMN_NAME_IN_CSV = processing.COLUMN_NAME_IN_CSV
DICTIONARY_PATH = processing.DICTIONARY_PATH
DEMERIT_DICTIONARY_PATH = processing.DEMERIT_DICTIONARY_PATH
BASE_CROP_BOXES = processing.BASE_CROP_BOXES
OCR_CONFIG = processing.OCR_CONFIG
DEFAULT_UPSAMPLE = processing.DEFAULT_UPSAMPLE
CORRECTION_SCORE = processing.CORRECTION_SCORE

ProcessingParameters = processing.ProcessingParameters
build_processing_parameters = processing.build_processing_parameters
scale_crop_boxes = processing.scale_crop_boxes
ocr_and_match = processing.ocr_and_match
process_images = processing.process_images


def main(argv=None) -> int:
    """互換 CLI エントリーポイント (新 CLI へ委譲)."""

    return cli_main(argv)


__all__ = [
    "BUNDLED_TESSERACT",
    "COLUMN_NAME_IN_CSV",
    "DICTIONARY_PATH",
    "DEMERIT_DICTIONARY_PATH",
    "BASE_CROP_BOXES",
    "OCR_CONFIG",
    "DEFAULT_UPSAMPLE",
    "CORRECTION_SCORE",
    "ProcessingParameters",
    "build_processing_parameters",
    "scale_crop_boxes",
    "ocr_and_match",
    "process_images",
    "process_images_command",
    "build_arg_parser",
    "main",
]


if __name__ == "__main__":  # pragma: no cover - legacy CLI
    raise SystemExit(main())

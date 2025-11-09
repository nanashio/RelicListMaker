import argparse
import os
import sys
from pathlib import Path
from typing import Sequence

import cv2
import pytesseract
from rapidfuzz import fuzz

from relic_data import load_master_effects_and_levels, normalize_master_values
from resource_paths import templates_path
from tesseract_bundle import (
    configure_pytesseract,
    is_system_tesseract_preferred,
    system_tesseract_reason,
)

from relic_pipeline.cli.commands import process_images_command
from relic_pipeline.io import build_row, load_corrections, normalize_column_visibility, write_csv
from relic_pipeline.matching import MatchResult, resolve_effect
from relic_pipeline.ocr.reader import batch_recognize
from relic_pipeline.settings import (
    DEFAULT_COLUMN_VISIBILITY,
    DEFAULT_OCR_CONFIG,
    DEFAULT_RESIZE_SCALE,
    DEFAULT_GCP_CREDENTIALS_FILENAME,
    ExportOptions,
    MatchingSettings,
    OCRSettings,
)

BUNDLED_TESSERACT = configure_pytesseract()
_TESSERACT_NOTICE_SHOWN = False

DICTIONARY_PATH = templates_path('master_relics.csv')
COLUMN_NAME_IN_CSV = 'EffectBase'

# 元サイズ (1920x1080前提)
BASE_CROP_BOXES = [
    (188, 78,  768, 128),
    (188, 138, 768, 188),
    (188, 198, 768, 248)
]

OCR_CONFIG = DEFAULT_OCR_CONFIG
DEFAULT_UPSAMPLE = DEFAULT_RESIZE_SCALE
CORRECTION_SCORE = 100.0


def _resolve_packaged_credentials(filename: str | None) -> Path | None:
    trimmed = (filename or "").strip()
    if not trimmed:
        return None
    if getattr(sys, "frozen", False):
        exe_path = Path(sys.executable).resolve()
        candidate = exe_path.parent / trimmed
        if candidate.exists():
            return candidate
    return None


def _resolve_gcp_credentials(
    gcp_credentials: str | None,
    packaged_filename: str | None,
) -> Path | None:
    resolved: Path | None = None
    if gcp_credentials:
        cred_path = Path(gcp_credentials).expanduser()
        if cred_path.exists():
            resolved = cred_path
        else:
            print(f"[WARN] 指定した認証ファイルが見つかりません: {cred_path}")

    if resolved is None:
        packaged_path = _resolve_packaged_credentials(packaged_filename)
        if packaged_path is not None:
            resolved = packaged_path
            print(
                "[INFO] 実行ファイルと同じディレクトリの認証ファイルを利用します: "
                f"{packaged_path.name}"
            )
        elif packaged_filename and getattr(sys, "frozen", False):
            print(
                "[WARN] Vision認証ファイルが実行ファイルと同じディレクトリにありません: "
                f"{packaged_filename}"
            )

    if resolved is not None and resolved != Path(gcp_credentials or "").expanduser():
        print(f"[INFO] Vision 認証ファイル: {resolved}")

    return resolved


def scale_crop_boxes(boxes, scale=1.0):
    """拡大倍率に応じてcrop座標をスケーリング"""
    scaled = []
    for (x1, y1, x2, y2) in boxes:
        scaled.append((
            int(x1 * scale),
            int(y1 * scale),
            int(x2 * scale),
            int(y2 * scale)
        ))
    return scaled


def ocr_and_match(
    img_path,
    dictionary,
    corrections_map=None,
    scale=1.0,
    upsample=DEFAULT_UPSAMPLE,
    preprocess=True,
    crop_boxes=None,
    ocr_engine: str = "tesseract",
    vision_credentials_path: Path | None = None,
) -> list[MatchResult]:
    boxes = crop_boxes or scale_crop_boxes(BASE_CROP_BOXES, scale)

    try:
        img_cv = cv2.imread(img_path)
        if img_cv is None:
            raise FileNotFoundError(f"画像を読み込めませんでした: {img_path}")

        results: list[MatchResult] = []
        valid_crops: list[object] = []
        valid_positions: list[int] = []

        for box_index, (x1, y1, x2, y2) in enumerate(boxes):
            crop = img_cv[y1:y2, x1:x2]
            if crop is None or crop.size == 0:
                results.append(
                    MatchResult(
                        raw_text="",
                        matched_text="No image",
                        score=0.0,
                        source="error",
                    )
                )
                continue

            valid_positions.append(len(results))
            results.append(
                MatchResult(
                    raw_text="",
                    matched_text="",
                    score=0.0,
                    source="pending",
                )
            )
            valid_crops.append(crop)

        if not valid_crops:
            return results

        ocr_settings = OCRSettings(
            lang="jpn",
            config=OCR_CONFIG,
            engine=ocr_engine,
            preprocess=preprocess,
            resize_scale=upsample,
            vision_credentials_path=vision_credentials_path,
        )
        recognized_texts = batch_recognize(valid_crops, settings=ocr_settings)

        matching_settings = MatchingSettings(
            dictionary=list(dictionary),
            scorer=fuzz.WRatio,
            corrections=corrections_map or {},
            correction_score=CORRECTION_SCORE,
        )

        for position, text in zip(valid_positions, recognized_texts):
            match_result = resolve_effect(text, settings=matching_settings)
            results[position] = match_result

        return results
    except Exception as err:
        print(f"OCR error: {err}")
        fallback_length = len(boxes)
        return [
            MatchResult(
                raw_text="",
                matched_text="Error",
                score=0.0,
                source="error",
            )
            for _ in range(fallback_length)
        ]

def process_images(
    image_dir="crops",
    output_path="results.csv",
    scale=1.0,
    upsample=DEFAULT_UPSAMPLE,
    preprocess=True,
    corrections_csv=None,
    item_color=None,
    column_visibility=None,
    master_csv_path=None,
    relic_type=None,
    ocr_engine: str = "tesseract",
    gcp_credentials: str | None = None,
    gcp_credentials_filename: str | None = DEFAULT_GCP_CREDENTIALS_FILENAME,
):
    global _TESSERACT_NOTICE_SHOWN
    normalized_engine = ocr_engine.lower()
    credentials_path: Path | None = None
    if normalized_engine in {"vision", "google", "google-vision"}:
        credentials_path = _resolve_gcp_credentials(
            gcp_credentials,
            gcp_credentials_filename,
        )
        print("[INFO] Google Cloud Vision API を利用して OCR を実行します")
    elif normalized_engine == "tesseract":
        if not _TESSERACT_NOTICE_SHOWN:
            if is_system_tesseract_preferred():
                reason = system_tesseract_reason()
                if reason == "wsl":
                    print("[INFO] WSL 環境のためシステムにインストールされた Tesseract を利用します")
                elif reason and reason != "missing":
                    print("[INFO] システムにインストール済みの Tesseract を利用します")
            _TESSERACT_NOTICE_SHOWN = True
        version = pytesseract.get_tesseract_version()
        print(f"Tesseract Ver: {version}")
    else:
        raise ValueError(f"サポートされていない OCR エンジンです: {ocr_engine}")

    master_path = master_csv_path or DICTIONARY_PATH

    dictionary, level_map = load_master_effects_and_levels(
        master_path, column=COLUMN_NAME_IN_CSV
    )
    if not dictionary:
        print("辞書の読み込み失敗")
        return

    corrections_map = load_corrections(corrections_csv)
    if corrections_map:
        dictionary = normalize_master_values(list(dictionary) + list(corrections_map.values()))

    crop_boxes = scale_crop_boxes(BASE_CROP_BOXES, scale)
    column_flags = normalize_column_visibility(
        column_visibility,
        defaults=DEFAULT_COLUMN_VISIBILITY,
    )
    slot_range = range(1, len(crop_boxes) + 1)
    export_options = ExportOptions(
        column_visibility=column_flags,
        slot_range=slot_range,
        level_map=level_map,
        item_color=item_color,
        relic_type=relic_type,
    )

    rows: list[dict[str, object]] = []
    for fname in sorted(os.listdir(image_dir)):
        if not fname.endswith(".png"):
            continue
        img_path = os.path.join(image_dir, fname)
        match_results = ocr_and_match(
            img_path,
            dictionary,
            corrections_map=corrections_map,
            scale=scale,
            upsample=upsample,
            preprocess=preprocess,
            crop_boxes=crop_boxes,
            ocr_engine=normalized_engine,
            vision_credentials_path=credentials_path,
        )
        row = build_row(fname, match_results, options=export_options)
        rows.append(row)

    if not rows:
        print("[!] 出力対象となるOCR結果がありませんでした")
        return

    output_file = Path(output_path)
    try:
        write_csv(rows, path=output_file, column_flags=column_flags)
    except OSError as err:
        print(f"[!] CSVの書き込みに失敗しました: {err}")
        return

    print(f"[✓] CSV出力完了: {output_path}")


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="クロップ済み画像に対してOCRと辞書マッチングを実行し、CSVを生成します。"
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
        default=DEFAULT_UPSAMPLE,
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
    return process_images_command(args, runner=process_images)


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    raise SystemExit(main())


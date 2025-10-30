import os
from pathlib import Path

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

from relic_pipeline.io import build_row, load_corrections, normalize_column_visibility, write_csv
from relic_pipeline.matching import MatchResult, apply_corrections, find_best_effect
from relic_pipeline.ocr.reader import batch_recognize
from relic_pipeline.settings import (
    DEFAULT_OCR_CONFIG,
    DEFAULT_RESIZE_SCALE,
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
DEFAULT_COLUMN_VISIBILITY: dict[str, bool] = {
    "ItemColor": True,
    "RawText": True,
    "Score": True,
    "Source": True,
    "LevelOptions": True,
    "LevelCorrection": True,
    "Dataset": True,
    "DatasetFolder": True,
    "SourceCsv": True,
    "SourceImage": True,
    "BaseImage": True,
}


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
):
    boxes = crop_boxes or scale_crop_boxes(BASE_CROP_BOXES, scale)

    try:
        img_cv = cv2.imread(img_path)
        if img_cv is None:
            raise FileNotFoundError(f"画像を読み込めませんでした: {img_path}")

        results: list[dict[str, object]] = []
        valid_crops: list[object] = []
        valid_positions: list[int] = []

        for box_index, (x1, y1, x2, y2) in enumerate(boxes):
            crop = img_cv[y1:y2, x1:x2]
            if crop is None or crop.size == 0:
                results.append(
                    {
                        "match": "No image",
                        "score": 0.0,
                        "raw": "",
                        "source": "error",
                    }
                )
                continue

            valid_positions.append(len(results))
            results.append({})
            valid_crops.append(crop)

        if not valid_crops:
            return results

        ocr_settings = OCRSettings(
            lang="jpn",
            config=OCR_CONFIG,
            preprocess=preprocess,
            resize_scale=upsample,
        )
        recognized_texts = batch_recognize(valid_crops, settings=ocr_settings)

        matching_settings = MatchingSettings(
            dictionary=list(dictionary),
            scorer=fuzz.WRatio,
            corrections=corrections_map or {},
            correction_score=CORRECTION_SCORE,
        )

        for position, text in zip(valid_positions, recognized_texts):
            correction = apply_corrections(
                text,
                corrections=matching_settings.corrections,
                default_score=matching_settings.correction_score,
            )
            if correction:
                match_result = correction
            else:
                match_result = find_best_effect(
                    text,
                    dictionary=matching_settings.dictionary,
                    scorer=matching_settings.scorer,
                )
            results[position] = match_result.to_dict()

        return results
    except Exception as err:
        print(f"OCR error: {err}")
        fallback_length = len(boxes)
        return [
            {"match": "Error", "score": 0.0, "raw": "", "source": "error"}
        ] * fallback_length

def process_images(
    image_dir="crops",
    output_path="results.csv",
    scale=1.0,
    upsample=DEFAULT_UPSAMPLE,
    preprocess=True,
    corrections_csv=None,
    item_color=None,
    column_visibility=None,
):
    global _TESSERACT_NOTICE_SHOWN
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

    dictionary, level_map = load_master_effects_and_levels(
        DICTIONARY_PATH, column=COLUMN_NAME_IN_CSV
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
    )

    rows: list[dict[str, object]] = []
    for fname in sorted(os.listdir(image_dir)):
        if not fname.endswith(".png"):
            continue
        img_path = os.path.join(image_dir, fname)
        matches_payload = ocr_and_match(
            img_path,
            dictionary,
            corrections_map=corrections_map,
            scale=scale,
            upsample=upsample,
            preprocess=preprocess,
            crop_boxes=crop_boxes,
        )

        match_results = [MatchResult.from_mapping(match) for match in matches_payload]
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


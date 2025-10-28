import os
import csv
import re

import cv2
import pandas as pd
import pytesseract
from rapidfuzz import process, fuzz
from typing import Optional, Sequence

from preprocess import prepare_crop_for_ocr
from relic_data import load_master_effects_and_levels, normalize_master_values
from resource_paths import templates_path
from tesseract_bundle import configure_pytesseract

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

OCR_CONFIG = "--oem 3 --psm 6 -c preserve_interword_spaces=1"
DEFAULT_UPSAMPLE = 1.5
CORRECTION_SCORE = 100.0
LEVEL_OPTIONS_SEPARATOR = " | "
_LEVEL_NORMALIZE_TABLE = str.maketrans({
    '０': '0',
    '１': '1',
    '２': '2',
    '３': '3',
    '４': '4',
    '５': '5',
    '６': '6',
    '７': '7',
    '８': '8',
    '９': '9',
    '＋': '+',
    '－': '-',
    'ー': '-',
    '−': '-',
    'Ⅰ': '1',
    'Ⅱ': '2',
    'Ⅲ': '3',
    'Ⅳ': '4',
    'Ⅴ': '5',
})


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


def _normalize_level_text(text: str) -> str:
    if not text:
        return ""
    normalized = text.translate(_LEVEL_NORMALIZE_TABLE)
    return normalized.replace(" ", "").replace("　", "")


def _detect_level(raw_text: str, candidates: Sequence[str]) -> str:
    if not raw_text or not candidates:
        return ""
    normalized_raw = _normalize_level_text(raw_text)
    if not normalized_raw:
        return ""

    normalized_candidates = []
    for candidate in candidates:
        if not candidate:
            continue
        normalized_candidate = _normalize_level_text(candidate)
        if normalized_candidate:
            normalized_candidates.append((candidate, normalized_candidate))

    for original, normalized in normalized_candidates:
        if normalized and normalized in normalized_raw:
            return original

    match = re.search(r"[+](\d+)$", normalized_raw) or re.search(r"[+](\d+)", normalized_raw)
    if match:
        digits = match.group(1)
        for original, normalized in normalized_candidates:
            if normalized.endswith(digits):
                return original
        return f"+{digits}"
    return ""


def _find_level_candidates(effect_name: str, level_map: dict[str, list[str]]) -> list[str]:
    if not effect_name:
        return []
    if effect_name in level_map:
        return level_map[effect_name]
    for base, tokens in level_map.items():
        if base and base in effect_name:
            return tokens
    return []


def _serialize_level_options(levels: Sequence[str]) -> str:
    filtered = [level for level in (levels or []) if level]
    if not filtered:
        return ""
    ordered = []
    for level in filtered:
        if level not in ordered:
            ordered.append(level)
    return LEVEL_OPTIONS_SEPARATOR.join(ordered)


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

def load_corrections(corrections_csv):
    if not corrections_csv or not os.path.exists(corrections_csv):
        return {}

    try:
        df = pd.read_csv(corrections_csv)
    except Exception as err:
        print(f"[WARN] フィードバックの読み込みに失敗しました: {err}")
        return {}

    corrections = {}
    for _, row in df.iterrows():
        raw_text = str(row.get("RawText", "")).strip()
        corrected = str(row.get("Corrected", "")).strip()
        if raw_text and corrected:
            corrections[raw_text] = corrected

    if corrections:
        print(f"[INFO] フィードバック {len(corrections)} 件を適用します")

    return corrections


def _normalize_column_visibility(overrides: Optional[dict[str, object]]) -> dict[str, bool]:
    flags = DEFAULT_COLUMN_VISIBILITY.copy()
    if not overrides:
        return flags
    for key, value in overrides.items():
        try:
            flags[key] = bool(value)
        except Exception:
            continue
    return flags


def _ensure_effect_slots(
    row: dict[str, object], slot_range: range, column_flags: dict[str, bool]
) -> None:
    """不足している効果スロットの初期値を補完する."""

    for idx in slot_range:
        effect_key = f"Effect{idx}"
        level_key = f"Effect{idx}Level"
        status_key = f"Effect{idx}Status"

        row.setdefault(effect_key, "-")
        row.setdefault(level_key, "")
        row.setdefault(status_key, "pending")

        if column_flags.get("LevelOptions", True):
            row.setdefault(f"Effect{idx}LevelOptions", "")
        if column_flags.get("LevelCorrection", True):
            row.setdefault(f"Effect{idx}LevelCorrection", "")
        if column_flags.get("RawText", True):
            row.setdefault(f"RawText{idx}", "")
        if column_flags.get("Score", True):
            row.setdefault(f"Effect{idx}Score", "")
        if column_flags.get("Source", True):
            row.setdefault(f"Effect{idx}Source", "")

def clean_ocr_text(text):
    """Tesseractの改行や改ページコードを整形"""
    if not text:
        return ""
    text = text.replace("\x0c", " ")
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return " ".join(lines)


def ocr_and_match(
    img_path,
    dictionary,
    corrections_map=None,
    scale=1.0,
    upsample=DEFAULT_UPSAMPLE,
    preprocess=True,
    crop_boxes=None,
):
    try:
        img_cv = cv2.imread(img_path)
        if img_cv is None:
            raise FileNotFoundError(f"画像を読み込めませんでした: {img_path}")

        results: list[dict[str, object]] = []
        boxes = crop_boxes or scale_crop_boxes(BASE_CROP_BOXES, scale)

        for (x1, y1, x2, y2) in boxes:
            crop = img_cv[y1:y2, x1:x2]
            if crop is None or crop.size == 0:
                results.append({
                    "match": "No image",
                    "score": 0.0,
                    "raw": "",
                    "source": "error",
                })
                continue

            if preprocess:
                ocr_input = prepare_crop_for_ocr(crop, resize_scale=upsample)
            else:
                ocr_input = crop
                if upsample and upsample != 1.0:
                    ocr_input = cv2.resize(
                        ocr_input, None, fx=upsample, fy=upsample, interpolation=cv2.INTER_CUBIC
                    )
                ocr_input = cv2.cvtColor(ocr_input, cv2.COLOR_BGR2GRAY)

            raw_text = pytesseract.image_to_string(ocr_input, lang='jpn', config=OCR_CONFIG)
            text = clean_ocr_text(raw_text)
            if corrections_map and text in corrections_map:
                best_match = corrections_map[text]
                score = CORRECTION_SCORE
                source = "feedback"
            else:
                match = process.extractOne(text, dictionary, scorer=fuzz.WRatio)
                if match:
                    best_match, score, _ = match
                else:
                    best_match, score = "No match", 0.0
                source = "dictionary"

            results.append({
                "match": best_match,
                "score": float(score) if score is not None else 0.0,
                "raw": text,
                "source": source,
            })

        return results
    except Exception as e:
        print(f"OCR error: {e}")
        fallback_length = len(crop_boxes) if crop_boxes else len(BASE_CROP_BOXES)
        return [{"match": "Error", "score": 0.0, "raw": "", "source": "error"}] * fallback_length

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
        if BUNDLED_TESSERACT:
            print(f"[INFO] バンドル済みTesseractを使用します: {BUNDLED_TESSERACT.cmd}")
            if BUNDLED_TESSERACT.tessdata_prefix:
                print(f"[INFO] tessdata パス: {BUNDLED_TESSERACT.tessdata_prefix}")
        else:
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
        # 辞書候補にフィードバック語を加えてマッチ精度を向上
        dictionary = normalize_master_values(list(dictionary) + list(corrections_map.values()))

    crop_boxes = scale_crop_boxes(BASE_CROP_BOXES, scale)
    column_flags = _normalize_column_visibility(column_visibility)
    slot_range = range(1, len(BASE_CROP_BOXES) + 1)

    data = []
    for fname in sorted(os.listdir(image_dir)):
        if not fname.endswith(".png"):
            continue
        img_path = os.path.join(image_dir, fname)
        matches = ocr_and_match(
            img_path,
            dictionary,
            corrections_map=corrections_map,
            scale=scale,
            upsample=upsample,
            preprocess=preprocess,
            crop_boxes=crop_boxes,
        )

        row = {"Image": fname, "Duplicate": False}
        if column_flags.get("ItemColor", True):
            row["ItemColor"] = item_color or "none"

        for idx, match in enumerate(matches, start=1):
            raw_value = match.get("raw", "")
            effect_value = match.get("match", "")
            row[f"Effect{idx}"] = effect_value
            row[f"Effect{idx}Status"] = "pending"
            row.setdefault(f"Effect{idx}Level", "")

            if column_flags.get("RawText", True):
                row[f"RawText{idx}"] = raw_value
            if column_flags.get("Score", True):
                row[f"Effect{idx}Score"] = match.get("score", 0.0)
            if column_flags.get("Source", True):
                row[f"Effect{idx}Source"] = match.get("source", "dictionary")

            if level_map:
                candidates = _find_level_candidates(str(effect_value), level_map)
                if candidates:
                    detected_level = _detect_level(str(raw_value), candidates)
                    row[f"Effect{idx}Level"] = detected_level or ""
                    options_value = _serialize_level_options(candidates)
                    if column_flags.get("LevelOptions", True) and options_value:
                        row[f"Effect{idx}LevelOptions"] = options_value

            if column_flags.get("LevelOptions", True):
                row.setdefault(f"Effect{idx}LevelOptions", "")
            if column_flags.get("LevelCorrection", True):
                row[f"Effect{idx}LevelCorrection"] = row.get(
                    f"Effect{idx}LevelCorrection", ""
                )

        _ensure_effect_slots(row, slot_range, column_flags)

        if not column_flags.get("Dataset", True):
            row.pop("Dataset", None)
        if not column_flags.get("DatasetFolder", True):
            row.pop("DatasetFolder", None)
        if not column_flags.get("SourceCsv", True):
            row.pop("SourceCsv", None)
        if not column_flags.get("SourceImage", True):
            row.pop("SourceImage", None)
        if not column_flags.get("BaseImage", True):
            row.pop("BaseImage", None)

        data.append(row)

    if not data:
        print("[!] 出力対象となるOCR結果がありませんでした")
        return

    fieldnames: list[str] = ["Image", "Duplicate"]
    if column_flags.get("ItemColor", True):
        fieldnames.append("ItemColor")

    for idx in slot_range:
        fieldnames.append(f"Effect{idx}")
        fieldnames.append(f"Effect{idx}Level")
        if column_flags.get("LevelOptions", True):
            fieldnames.append(f"Effect{idx}LevelOptions")
        fieldnames.append(f"Effect{idx}Status")

    if column_flags.get("RawText", True):
        for idx in slot_range:
            fieldnames.append(f"RawText{idx}")
    if column_flags.get("Score", True):
        for idx in slot_range:
            fieldnames.append(f"Effect{idx}Score")
    if column_flags.get("Source", True):
        for idx in slot_range:
            fieldnames.append(f"Effect{idx}Source")
    if column_flags.get("LevelCorrection", True):
        for idx in slot_range:
            fieldnames.append(f"Effect{idx}LevelCorrection")

    for row in data:
        for key in row.keys():
            if key not in fieldnames:
                fieldnames.append(key)

    try:
        with open(output_path, "w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            for row in data:
                writer.writerow(row)
    except OSError as err:
        print(f"[!] CSVの書き込みに失敗しました: {err}")
        return

    print(f"[✓] CSV出力完了: {output_path}")

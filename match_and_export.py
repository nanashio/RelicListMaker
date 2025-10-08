import os
import csv

import cv2
import pandas as pd
import pytesseract
from rapidfuzz import process, fuzz

from preprocess import prepare_crop_for_ocr
from relic_data import load_master_csv, normalize_master_values
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

    dictionary = load_master_csv(DICTIONARY_PATH, column=COLUMN_NAME_IN_CSV)
    if not dictionary:
        print("辞書の読み込み失敗")
        return

    corrections_map = load_corrections(corrections_csv)
    if corrections_map:
        # 辞書候補にフィードバック語を加えてマッチ精度を向上
        dictionary = normalize_master_values(list(dictionary) + list(corrections_map.values()))

    crop_boxes = scale_crop_boxes(BASE_CROP_BOXES, scale)

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

        row = {"Image": fname, "Duplicate": False, "ItemColor": item_color or 'none'}
        for idx, match in enumerate(matches, start=1):
            row[f"RawText{idx}"] = match.get("raw", "")
            row[f"Effect{idx}"] = match.get("match", "")
            row[f"Effect{idx}Score"] = match.get("score", 0.0)
            row[f"Effect{idx}Source"] = match.get("source", "dictionary")
            row[f"Effect{idx}Status"] = "pending"

        data.append(row)

    if not data:
        print("[!] 出力対象となるOCR結果がありませんでした")
        return

    fieldnames = []

    def register_field(field_name):
        if field_name not in fieldnames:
            fieldnames.append(field_name)

    for mandatory in ("Image", "Duplicate"):
        register_field(mandatory)

    for row in data:
        for key in row.keys():
            register_field(key)

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

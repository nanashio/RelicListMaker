import json
import os

import cv2
import pandas as pd
import pytesseract
from rapidfuzz import process, fuzz

from preprocess import prepare_crop_for_ocr

DICTIONARY_FILE = 'master_relics.csv'
COLUMN_NAME_IN_CSV = 'EffectBase'

# 元サイズ (1920x1080前提)
BASE_CROP_BOXES = [
    (188, 78,  768, 105),
    (188, 138, 768, 165),
    (188, 198, 768, 225)
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

def load_dictionary(file_path, column_name):
    try:
        df = pd.read_csv(file_path)
        if column_name not in df.columns:
            print(f"Column '{column_name}' not found. Available: {df.columns}")
            return []
        return df[column_name].dropna().astype(str).tolist()
    except Exception as e:
        print(f"Error loading dictionary: {e}")
        return []

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


def ocr_and_match(img_path, dictionary, corrections_map=None, scale=1.0, upsample=DEFAULT_UPSAMPLE, preprocess=True):
    try:
        img_cv = cv2.imread(img_path)
        results = []
        crop_boxes = scale_crop_boxes(BASE_CROP_BOXES, scale)

        for (x1, y1, x2, y2) in crop_boxes:
            crop = img_cv[y1:y2, x1:x2]
            if crop is None or crop.size == 0:
                results.append("No image")
                continue

            if preprocess:
                ocr_input = prepare_crop_for_ocr(crop, resize_scale=upsample)
            else:
                ocr_input = crop
                if upsample and upsample != 1.0:
                    ocr_input = cv2.resize(ocr_input, None, fx=upsample, fy=upsample, interpolation=cv2.INTER_CUBIC)
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
                "source": source
            })

        return results
    except Exception as e:
        print(f"OCR error: {e}")
        return [{"match": "Error", "score": 0.0, "raw": "", "source": "error"}] * len(BASE_CROP_BOXES)

def process_images(
    image_dir="crops",
    output_path="results.json",
    scale=1.0,
    upsample=DEFAULT_UPSAMPLE,
    preprocess=True,
    corrections_csv=None,
):
    version = pytesseract.get_tesseract_version()
    print(f"Tesseract Ver: {version}")

    dictionary = load_dictionary(DICTIONARY_FILE, COLUMN_NAME_IN_CSV)
    if not dictionary:
        print("辞書の読み込み失敗")
        return

    corrections_map = load_corrections(corrections_csv)
    if corrections_map:
        # 辞書候補にフィードバック語を加えてマッチ精度を向上
        dictionary = list(dict.fromkeys(dictionary + list(corrections_map.values())))

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
        )

        row = {"Image": fname}
        for idx, match in enumerate(matches, start=1):
            row[f"RawText{idx}"] = match.get("raw", "")
            row[f"Effect{idx}"] = match.get("match", "")
            row[f"Effect{idx}Score"] = match.get("score", 0.0)
            row[f"Effect{idx}Source"] = match.get("source", "dictionary")
            row[f"Effect{idx}Status"] = "pending"

        data.append(row)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"[✓] JSON出力完了: {output_path}")

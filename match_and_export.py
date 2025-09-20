import pytesseract
from PIL import Image
import pandas as pd
from rapidfuzz import process, fuzz
import os
import cv2

DICTIONARY_FILE = 'master_relics.csv'
COLUMN_NAME_IN_CSV = 'EffectBase'

# 元サイズ (1920x1080前提)
BASE_CROP_BOXES = [
    (188, 78,  768, 105),
    (188, 138, 768, 165),
    (188, 198, 768, 225)
]

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

def ocr_and_match(img_path, dictionary, scale=1.0):
    try:
        img_cv = cv2.imread(img_path)
        results = []
        crop_boxes = scale_crop_boxes(BASE_CROP_BOXES, scale)

        for (x1, y1, x2, y2) in crop_boxes:
            crop = img_cv[y1:y2, x1:x2]
            if scale != 1.0:
                crop = cv2.resize(crop, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

            text = pytesseract.image_to_string(crop, lang='jpn').strip()
            match = process.extractOne(text, dictionary, scorer=fuzz.ratio)
            best_match = match[0] if match else "No match"
            results.append(best_match)

        return results
    except Exception as e:
        print(f"OCR error: {e}")
        return ["Error"] * 3

def process_images(image_dir="crops", output_csv="results.csv", scale=1.0):
    print("Tesseract Ver: " + pytesseract.get_tesseract_version())

    dictionary = load_dictionary(DICTIONARY_FILE, COLUMN_NAME_IN_CSV)
    if not dictionary:
        print("辞書の読み込み失敗")
        return

    data = []
    for fname in sorted(os.listdir(image_dir)):
        if not fname.endswith(".png"):
            continue
        img_path = os.path.join(image_dir, fname)
        matches = ocr_and_match(img_path, dictionary, scale=scale)
        data.append([fname] + matches)

    df = pd.DataFrame(data, columns=["Image", "Effect1", "Effect2", "Effect3"])
    df.to_csv(output_csv, index=False, encoding="utf-8-sig")
    print(f"[✓] CSV出力完了: {output_csv}")

# main.py
import os
import csv
import shutil
import time
from typing import Optional

from extract_frames import extract_and_crop
from generate_gallery import generate_html
from match_and_export import process_images

VIDEO_DIR = "videos"
DEFAULT_RESULT_DIR = "results"
OCR_UPSAMPLE = 1.5




COLOR_KEYWORDS = {
    'red': 'red',
    'green': 'green',
    'blue': 'blue',
    'yellow': 'yellow',
    '赤': 'red',
    '緑': 'green',
    '青': 'blue',
    '黄': 'yellow',
}


def detect_item_color(name: str) -> Optional[str]:
    if not name:
        return None

    lowered = name.lower()
    for word, color in COLOR_KEYWORDS.items():
        if word in lowered:
            return color

    # 日本語キーワードは lower() で変換できないので別途チェック
    for word in ('赤', '緑', '青', '黄'):
        if word in name:
            return COLOR_KEYWORDS[word]

    return None

def prepare_master_csv(src_csv: str, dest_csv: str) -> list:
    options = []
    seen = set()
    try:
        with open(src_csv, "r", encoding="utf-8") as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                value = (row.get("EffectBase") or "").strip()
                if value and value != "-" and value not in seen:
                    seen.add(value)
                    options.append(value)
    except FileNotFoundError:
        print(f"[!] マスターデータが見つかりません: {src_csv}")
        return []
    except Exception as err:
        print(f"[!] マスターデータの読み込みに失敗しました: {err}")
        return []

    try:
        src_abs = os.path.abspath(src_csv)
        dest_abs = os.path.abspath(dest_csv)
        if src_abs != dest_abs:
            os.makedirs(os.path.dirname(dest_abs), exist_ok=True)
            shutil.copyfile(src_abs, dest_abs)
    except OSError as err:
        print(f"[!] マスターデータCSVのコピーに失敗しました: {err}")
    return options

def main(video_dir="videos", result_dir=DEFAULT_RESULT_DIR, ocr_upsample=OCR_UPSAMPLE):
    start_time = time.time()
    print("[INFO] 動画ごとの処理開始...")

    os.makedirs(result_dir, exist_ok=True)

    for video_file in os.listdir(video_dir):
        if not video_file.lower().endswith((".mp4", ".avi", ".mov", ".mkv")):
            continue

        video_path = os.path.join(video_dir, video_file)
        base_name = os.path.splitext(video_file)[0]
        video_output_dir = os.path.join(result_dir, base_name)
        frames_dir = os.path.join(video_output_dir, "frames")
        crops_dir = os.path.join(video_output_dir, "crops")
        os.makedirs(video_output_dir, exist_ok=True)

        print(f"[PROCESSING] {video_file} を処理中...")

        # 1. フレーム抽出 & crop
        extract_and_crop(video_path, frame_dir=frames_dir, crop_dir=crops_dir)

        # 2. OCR＋マッチング結果をCSVに出力
        csv_path = os.path.join(video_output_dir, f"{base_name}.csv")
        corrections_csv = os.path.join(video_output_dir, "corrections.csv")
        item_color = detect_item_color(base_name)

        process_images(
            image_dir=crops_dir,
            output_path=csv_path,
            scale=1.0,
            upsample=ocr_upsample,
            preprocess=True,
            corrections_csv=corrections_csv,
            item_color=item_color,
        )
        print(f"[✓] {crops_dir} の結果を {csv_path} に出力しました")

        # 3. HTMLギャラリー生成
        html_path = os.path.join(video_output_dir, f"{base_name}_viewer.html")
        img_rel_dir = os.path.relpath(crops_dir, video_output_dir)
        master_src = os.path.join(os.path.dirname(__file__), "templates", "master_relics.csv")
        master_csv_dest = os.path.join(video_output_dir, "master_relics.csv")
        prepare_master_csv(master_src, master_csv_dest)
        master_csv_rel = (
            os.path.relpath(os.path.abspath(master_csv_dest), os.path.abspath(video_output_dir))
            if os.path.exists(master_csv_dest)
            else ""
        )
        generate_html(
            csv_path,
            img_rel_dir,
            html_path,
            master_csv_path=master_csv_rel,
            master_json_path="",
        )

    elapsed = time.time() - start_time
    print(f"[✓] 全処理完了！処理時間: {elapsed:.2f}秒")

if __name__ == "__main__":
    main()

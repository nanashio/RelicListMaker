# main.py
import os
import csv
import time
from typing import Optional

from extract_frames import extract_and_crop
from generate_gallery import generate_html
from match_and_export import process_images
from resource_paths import templates_path

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

def load_master_options(src_csv: str) -> list:
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
    return options

def main(video_dir="videos", result_dir=DEFAULT_RESULT_DIR, ocr_upsample=OCR_UPSAMPLE):
    start_time = time.time()
    print("[INFO] 動画ごとの処理開始...")

    os.makedirs(result_dir, exist_ok=True)

    master_src = str(templates_path("master_relics.csv"))
    master_options = load_master_options(master_src)
    dataset_entries = []

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

        dataset_entries.append(
            {
                "label": base_name,
                "csv": os.path.relpath(csv_path, result_dir),
                "img_dir": os.path.relpath(crops_dir, result_dir),
                "folder": os.path.relpath(video_output_dir, result_dir),
            }
        )

    default_csv_path = (
        os.path.abspath(os.path.join(result_dir, dataset_entries[0]["csv"]))
        if dataset_entries
        else os.path.join(result_dir, "results.csv")
    )
    default_img_dir = dataset_entries[0]["img_dir"] if dataset_entries else ""

    viewer_path = os.path.join(result_dir, "viewer.html")
    generate_html(
        default_csv_path,
        default_img_dir,
        viewer_path,
        master_csv_path=None,
        master_json_path="",
        master_options=master_options,
        datasets=dataset_entries,
        active_dataset_index=0,
    )

    elapsed = time.time() - start_time
    print(f"[✓] 全処理完了！処理時間: {elapsed:.2f}秒")

if __name__ == "__main__":
    main()

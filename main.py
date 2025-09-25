# main.py
import os
import csv
import json
import time

from extract_frames import extract_and_crop
from generate_gallery import generate_html
from match_and_export import process_images

VIDEO_DIR = "videos"
DEFAULT_RESULT_DIR = "results"
OCR_UPSAMPLE = 1.5


def export_master_json(src_csv: str, dest_json: str) -> list:
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
        with open(dest_json, "w", encoding="utf-8") as handle:
            json.dump(options, handle, ensure_ascii=False, indent=2)
    except OSError as err:
        print(f"[!] マスターデータJSONの書き込みに失敗しました: {err}")
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

        # 2. OCR＋マッチング結果をJSONに出力
        json_path = os.path.join(video_output_dir, f"{base_name}.json")
        corrections_csv = os.path.join(video_output_dir, "corrections.csv")
        process_images(
            image_dir=crops_dir,
            output_path=json_path,
            scale=1.0,
            upsample=ocr_upsample,
            preprocess=True,
            corrections_csv=corrections_csv,
        )
        print(f"[✓] {crops_dir} の結果を {json_path} に出力しました")

        # 3. HTMLギャラリー生成
        html_path = os.path.join(video_output_dir, f"{base_name}_viewer.html")
        img_rel_dir = os.path.relpath(crops_dir, video_output_dir)
        master_src = os.path.join(os.path.dirname(__file__), "master_relics.csv")
        master_json_dest = os.path.join(video_output_dir, "master_relics.json")
        master_options = export_master_json(master_src, master_json_dest)
        master_json_rel = (
            os.path.relpath(os.path.abspath(master_json_dest), os.path.abspath(video_output_dir))
            if os.path.exists(master_json_dest)
            else ""
        )
        generate_html(
            json_path,
            img_rel_dir,
            html_path,
            master_json_path=master_json_rel,
        )

    elapsed = time.time() - start_time
    print(f"[✓] 全処理完了！処理時間: {elapsed:.2f}秒")

if __name__ == "__main__":
    main()

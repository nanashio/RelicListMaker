# main.py
import os
import time
from extract_frames import extract_and_crop
from match_and_export import process_images
from generate_gallery import generate_html
# 前処理（必要ならインポート）
from preprocess import preprocess_for_ocr  

VIDEO_DIR = "videos"
FRAME_DIR = "frames"
CROP_DIR = "crops"
OUTPUT_HTML = "viewer.html"

def main(video_dir="videos", result_dir="results"):
    start_time = time.time()
    print("[INFO] 動画ごとの処理開始...")

    os.makedirs(result_dir, exist_ok=True)

    for video_file in os.listdir(video_dir):
        if not video_file.lower().endswith((".mp4", ".avi", ".mov", ".mkv")):
            continue

        video_path = os.path.join(video_dir, video_file)
        base_name = os.path.splitext(video_file)[0]

        print(f"[PROCESSING] {video_file} を処理中...")

        # 1. フレーム抽出 & crop
        crop_dir = os.path.join("crops", base_name)
        extract_and_crop(video_path, crop_dir=crop_dir)

        # # === OCR前処理を有効化する場合 ===
        # for img_file in os.listdir(crop_dir):
        #     img_path = os.path.join(crop_dir, img_file)
        #     preprocess_for_ocr(img_path, out_dir=crop_dir, scale=2, save=True)

        # OCR＋マッチング結果を個別CSVに出力
        csv_path = os.path.join(result_dir, f"results_{base_name}.csv")
        process_images(image_dir=crop_dir, output_csv=csv_path, scale=1.0)
        print(f"[✓] {crop_dir} の結果を {csv_path} に出力しました")
        
        # # 3. HTMLギャラリー生成
        # print("[INFO] HTMLギャラリー生成中...")
        generate_html(csv_path, crop_dir, f"results_{base_name}_viewer.html")

    elapsed = time.time() - start_time
    print(f"[✓] 全処理完了！処理時間: {elapsed:.2f}秒")

if __name__ == "__main__":
    main()

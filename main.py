# main.py
import os
import time
from typing import Callable, Optional

from extract_frames import extract_and_crop
from generate_gallery import generate_html
from match_and_export import process_images
from relic_data import load_master_csv
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

def main(
    video_dir="videos",
    result_dir=DEFAULT_RESULT_DIR,
    ocr_upsample=OCR_UPSAMPLE,
    progress_callback: Optional[Callable[[int, int, str], None]] = None,
) -> None:
    start_time = time.time()
    print("[INFO] 動画ごとの処理開始...")

    os.makedirs(result_dir, exist_ok=True)

    master_src = templates_path("master_relics.csv")
    master_options = load_master_csv(master_src)
    dataset_entries: list[dict[str, str]] = []

    video_files: list[str] = []
    for entry in sorted(os.listdir(video_dir)):
        if not entry.lower().endswith((".mp4", ".avi", ".mov", ".mkv")):
            continue
        video_path = os.path.join(video_dir, entry)
        if not os.path.isfile(video_path):
            continue
        video_files.append(entry)

    total_steps = len(video_files) * 2 + 1 if video_files else 1
    current_step = 0

    def report(message: str, *, advance: bool = False) -> None:
        nonlocal current_step
        if advance:
            current_step = min(current_step + 1, total_steps)
        if progress_callback:
            try:
                progress_callback(current_step, total_steps, message)
            except Exception as callback_err:  # pragma: no cover - 通知失敗は致命的でない
                print(f"[WARN] プログレス更新に失敗しました: {callback_err}")

    report("動画処理を準備中...")

    if not video_files:
        print("[WARN] 処理対象の動画が見つかりません。")
        report("処理対象の動画が見つかりませんでした")

    for video_file in video_files:
        video_path = os.path.join(video_dir, video_file)
        base_name = os.path.splitext(video_file)[0]
        video_output_dir = os.path.join(result_dir, base_name)
        frames_dir = os.path.join(video_output_dir, "frames")
        crops_dir = os.path.join(video_output_dir, "crops")
        os.makedirs(video_output_dir, exist_ok=True)

        print(f"[PROCESSING] {video_file} を処理中...")
        report(f"{video_file} のフレーム抽出中...")
        extract_and_crop(video_path, frame_dir=frames_dir, crop_dir=crops_dir)
        report(f"{video_file} のフレーム抽出完了", advance=True)

        csv_path = os.path.join(video_output_dir, f"{base_name}.csv")
        corrections_csv = os.path.join(video_output_dir, "corrections.csv")
        item_color = detect_item_color(base_name)

        report(f"{video_file} のOCR/マッチング中...")
        process_images(
            image_dir=crops_dir,
            output_path=csv_path,
            scale=1.0,
            upsample=ocr_upsample,
            preprocess=True,
            corrections_csv=corrections_csv,
            item_color=item_color,
        )
        report(f"{video_file} のOCR/マッチング完了", advance=True)
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
    report("HTML を生成中...")
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

    report("全処理完了", advance=True)
    elapsed = time.time() - start_time
    print(f"[✓] 全処理完了！処理時間: {elapsed:.2f}秒")
if __name__ == "__main__":
    main()

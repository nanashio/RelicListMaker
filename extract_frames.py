import cv2
import os
import numpy as np

FPS_INTERVAL = 20
CROP_BOX = (920, 734, 1800, 996)  # 比較・crop範囲


def safe_crop(img, x1, y1, x2, y2):
    """範囲を画像サイズに収めてクロップ"""
    h, w = img.shape[:2]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    return img[y1:y2, x1:x2]


def is_similar(img1, img2, threshold=10.0):
    """比較範囲の差分が少なければTrue"""
    if img1 is None or img2 is None:
        return False

    x1, y1, x2, y2 = CROP_BOX
    roi1 = img1[y1:y2, x1:x2]
    roi2 = img2[y1:y2, x1:x2]

    diff = cv2.absdiff(roi1, roi2)
    gray = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY)
    non_zero = np.count_nonzero(gray)
    total_pixels = gray.size
    diff_ratio = (non_zero / total_pixels) * 100

    return diff_ratio < threshold


def extract_and_crop(video_path, frame_dir="frames", crop_dir="crops"):
    os.makedirs(frame_dir, exist_ok=True)
    os.makedirs(crop_dir, exist_ok=True)

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    interval = int(fps / FPS_INTERVAL)
    frame_count = saved_count = 0
    prev_frame = None
    video_name = os.path.splitext(os.path.basename(video_path))[0]

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_count % interval == 0:
            if prev_frame is None or not is_similar(frame, prev_frame):
                fname = f"{video_name}_frame_{saved_count+1:05d}.png"
                full_frame_path = os.path.join(frame_dir, fname)
                cv2.imwrite(full_frame_path, frame)

                crop = safe_crop(frame, *CROP_BOX)
                cv2.imwrite(os.path.join(crop_dir, fname), crop)

                prev_frame = frame.copy()
                saved_count += 1

        frame_count += 1

    cap.release()
    print(f"[✓] {video_name}: {saved_count}フレーム抽出完了（重複スキップ済み）")

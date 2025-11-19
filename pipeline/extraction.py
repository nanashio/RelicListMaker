"""フレーム抽出ユーティリティ."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Tuple

import cv2
import numpy as np

FPS_INTERVAL = 20
CROP_BOX: Tuple[int, int, int, int] = (920, 734, 1800, 996)


def safe_crop(img: np.ndarray, x1: int, y1: int, x2: int, y2: int) -> np.ndarray:
    """範囲を画像サイズに収めてクロップ."""

    h, w = img.shape[:2]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    return img[y1:y2, x1:x2]


def is_similar(img1: np.ndarray | None, img2: np.ndarray | None, threshold: float = 10.0) -> bool:
    """比較範囲の差分が少なければTrue."""

    if img1 is None or img2 is None:
        return False

    x1, y1, x2, y2 = CROP_BOX
    roi1 = img1[y1:y2, x1:x2]
    roi2 = img2[y1:y2, x1:x2]

    diff = cv2.absdiff(roi1, roi2)
    gray = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY)
    non_zero = np.count_nonzero(gray)
    total_pixels = gray.size
    diff_ratio = (non_zero / total_pixels) * 100 if total_pixels else 0

    return diff_ratio < threshold


def extract_and_crop(
    video_path: str | os.PathLike[str] | Path,
    *,
    frame_dir: str | os.PathLike[str] = "frames",
    crop_dir: str | os.PathLike[str] = "crops",
    save_full_frames: bool = True,
) -> None:
    """動画からフレームを抽出し、クロップした画像を保存する."""

    frame_dir_path = Path(frame_dir)
    crop_dir_path = Path(crop_dir)
    if save_full_frames:
        frame_dir_path.mkdir(parents=True, exist_ok=True)
    crop_dir_path.mkdir(parents=True, exist_ok=True)

    cap = cv2.VideoCapture(str(video_path))
    fps = cap.get(cv2.CAP_PROP_FPS) or FPS_INTERVAL
    interval = int(fps / FPS_INTERVAL) if fps else 1
    interval = max(interval, 1)

    frame_count = 0
    saved_count = 0
    prev_frame: np.ndarray | None = None
    video_name = Path(video_path).stem

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_count % interval == 0:
            if prev_frame is None or not is_similar(frame, prev_frame):
                fname = f"{video_name}_{saved_count+1:05d}.png"
                if save_full_frames:
                    full_frame_path = frame_dir_path / fname
                    cv2.imwrite(str(full_frame_path), frame)

                crop = safe_crop(frame, *CROP_BOX)
                cv2.imwrite(str(crop_dir_path / fname), crop)

                prev_frame = frame.copy()
                saved_count += 1

        frame_count += 1

    cap.release()
    print(f"[✓] {video_name}: {saved_count}フレーム抽出完了（重複スキップ済み）")


__all__ = ["FPS_INTERVAL", "CROP_BOX", "safe_crop", "is_similar", "extract_and_crop"]

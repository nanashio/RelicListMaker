import cv2
import os
import argparse
import os

import cv2

DEFAULT_RESIZE_SCALE = 1.5
GAUSSIAN_KERNEL_SIZE = (3, 3)
MEDIAN_KERNEL_SIZE = 3


def upscale_image(img, scale=2.0):
    """画像を拡大（スケールはfloat対応）"""
    return cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)


def prepare_crop_for_ocr(crop, resize_scale=DEFAULT_RESIZE_SCALE, apply_threshold=True, denoise=True):
    """OCR向けにクロップ画像を前処理して返す"""
    if crop is None or crop.size == 0:
        return crop

    processed = crop
    if resize_scale and resize_scale != 1.0:
        processed = upscale_image(processed, scale=resize_scale)

    gray = cv2.cvtColor(processed, cv2.COLOR_BGR2GRAY) if processed.ndim == 3 else processed
    blurred = cv2.GaussianBlur(gray, GAUSSIAN_KERNEL_SIZE, 0)

    if apply_threshold:
        _, blurred = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    if denoise:
        blurred = cv2.medianBlur(blurred, MEDIAN_KERNEL_SIZE)

    return blurred


def preprocess_for_ocr(img_path, out_dir="preprocessed", scale=DEFAULT_RESIZE_SCALE, save=True):
    """
    OCR前処理:
      - 拡大
      - グレースケール + ガウシアンブラー
      - Otsu 二値化
      - メディアンブラーでノイズ除去

    Args:
        img_path (str): 入力画像ファイル
        out_dir (str): 保存先ディレクトリ
        scale (float): 拡大倍率
        save (bool): Trueなら保存, Falseならndarrayを返すのみ
    """
    if not os.path.exists(img_path):
        print(f"[ERROR] ファイルが見つかりません: {img_path}")
        return None

    # 画像読み込み
    img = cv2.imread(img_path)
    if img is None:
        print(f"[ERROR] 画像を開けませんでした: {img_path}")
        return None

    th = prepare_crop_for_ocr(img, resize_scale=scale)

    if save:
        os.makedirs(out_dir, exist_ok=True)
        fname = os.path.basename(img_path)
        out_path = os.path.join(out_dir, fname)
        cv2.imwrite(out_path, th)
        # print(f"[✓] 前処理済み画像を保存: {out_path}")
        return out_path
    else:
        return th  # ndarrayを返す


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="OCR用前処理スクリプト")
    parser.add_argument("image", help="入力画像ファイル")
    parser.add_argument("--out", default="preprocessed", help="出力ディレクトリ")
    parser.add_argument("--scale", type=int, default=2, help="拡大倍率（デフォルト2倍）")
    parser.add_argument("--nosave", action="store_true", help="保存せずに処理済み画像を返す")

    args = parser.parse_args()

    preprocess_for_ocr(args.image, args.out, args.scale, save=not args.nosave)

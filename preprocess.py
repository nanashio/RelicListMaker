import cv2
import os
import argparse

def upscale_image(img, scale=2):
    """画像を拡大（デフォルト2倍）"""
    return cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

def preprocess_for_ocr(img_path, out_dir="preprocessed", scale=2, save=True):
    """
    OCR前処理:
      - 拡大
      - グレースケール化
      - 二値化（Otsu）
      - ノイズ除去（median blur）
    
    Args:
        img_path (str): 入力画像ファイル
        out_dir (str): 保存先ディレクトリ
        scale (int): 拡大倍率
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

    # 拡大
    img = upscale_image(img, scale=scale)

    # グレースケール
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # # 二値化（Otsu）
    # _, th = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # # ノイズ除去
    # th = cv2.medianBlur(th, 3)
    th = gray

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

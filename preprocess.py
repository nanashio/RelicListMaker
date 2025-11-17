import cv2
import os

from relic_pipeline.ocr.preprocess import prepare_for_ocr
from relic_pipeline.settings import DEFAULT_RESIZE_SCALE


def upscale_image(img, scale=2.0):
    """画像を拡大（スケールはfloat対応）"""
    return cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
def preprocess_for_ocr(
    img_path,
    out_dir="preprocessed",
    scale=DEFAULT_RESIZE_SCALE,
    *,
    apply_threshold=True,
    denoise=True,
    save=True,
):
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

    th = prepare_for_ocr(
        img,
        resize_scale=scale,
        apply_threshold=apply_threshold,
        denoise=denoise,
    )

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
    import sys

    from relic_cli.__main__ import main as cli_main
    from relic_cli.utils import extend_argv

    sys.exit(cli_main(extend_argv(["preprocess"], sys.argv[1:])))

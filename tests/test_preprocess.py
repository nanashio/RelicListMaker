import importlib
import sys
import types

import numpy as np


_fake_cv2 = types.SimpleNamespace()
_fake_cv2.INTER_CUBIC = 0
_fake_cv2.COLOR_BGR2GRAY = 1
_fake_cv2.THRESH_BINARY = 0
_fake_cv2.THRESH_OTSU = 0


def _repeat_scale(image: np.ndarray, scale: float) -> np.ndarray:
    factor = max(int(round(scale)), 1)
    scaled = np.repeat(image, factor, axis=0)
    scaled = np.repeat(scaled, factor, axis=1)
    return scaled


def _resize(image, dsize, fx, fy, interpolation=None):  # noqa: D401 - OpenCV 互換の簡易スタブ
    return _repeat_scale(image, fy if fy else 1.0)


def _cvt_color(image, code):  # noqa: D401
    if image.ndim == 3:
        return image.mean(axis=2).astype(image.dtype)
    return image


def _gaussian_blur(image, ksize, sigma_x):  # noqa: D401
    return image


def _threshold(image, thresh, max_value, flag):  # noqa: D401
    mask = np.where(image > thresh, max_value, 0).astype(image.dtype)
    return thresh, mask


def _median_blur(image, ksize):  # noqa: D401
    return image


def _imwrite(path, image):  # noqa: D401
    return True


_fake_cv2.resize = _resize
_fake_cv2.cvtColor = _cvt_color
_fake_cv2.GaussianBlur = _gaussian_blur
_fake_cv2.threshold = _threshold
_fake_cv2.medianBlur = _median_blur
_fake_cv2.imwrite = _imwrite
_fake_cv2.imread = lambda path: None

sys.modules.setdefault("cv2", _fake_cv2)


preprocess = importlib.import_module("preprocess")


def test_prepare_crop_for_ocr_returns_processed_grayscale():
    color_image = np.zeros((10, 10, 3), dtype=np.uint8)
    color_image[:, :] = (10, 120, 230)

    processed = preprocess.prepare_crop_for_ocr(color_image, resize_scale=1.0)

    assert processed.shape == (10, 10)
    assert processed.dtype == np.uint8


def test_preprocess_for_ocr_skips_save_when_requested(tmp_path, monkeypatch):
    input_path = tmp_path / "sample.png"
    input_path.write_bytes(b"")

    sample = np.full((12, 12, 3), 180, dtype=np.uint8)
    monkeypatch.setattr(preprocess.cv2, "imread", lambda path: sample)

    processed = preprocess.preprocess_for_ocr(str(input_path), scale=1.0, save=False)

    assert processed is not None
    assert processed.shape == (12, 12)

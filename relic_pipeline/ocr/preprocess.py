"""Image preprocessing helpers for OCR."""

from __future__ import annotations

import cv2
import numpy as np

DEFAULT_GAUSSIAN_KERNEL = (3, 3)
DEFAULT_MEDIAN_KERNEL_SIZE = 3


def _to_gray(image: np.ndarray) -> np.ndarray:
    if image.ndim == 3:
        return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return image


def prepare_for_ocr(
    image: np.ndarray,
    *,
    resize_scale: float,
    apply_threshold: bool,
    denoise: bool,
) -> np.ndarray:
    """Normalize an input crop for OCR."""

    if image is None or image.size == 0:
        return image

    processed = image
    if resize_scale and resize_scale != 1.0:
        processed = cv2.resize(
            processed,
            None,
            fx=resize_scale,
            fy=resize_scale,
            interpolation=cv2.INTER_CUBIC,
        )

    gray = _to_gray(processed)
    blurred = cv2.GaussianBlur(gray, DEFAULT_GAUSSIAN_KERNEL, 0)

    if apply_threshold:
        _, blurred = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    if denoise:
        blurred = cv2.medianBlur(blurred, DEFAULT_MEDIAN_KERNEL_SIZE)

    return blurred


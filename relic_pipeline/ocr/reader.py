"""OCR reader utilities that wrap pytesseract."""

from __future__ import annotations

from typing import Sequence

import cv2
import numpy as np
import pytesseract

from .preprocess import prepare_for_ocr
from ..settings import OCRSettings


def clean_ocr_text(text: str) -> str:
    """Trim control codes and whitespace artifacts from OCR output."""

    if not text:
        return ""
    text = text.replace("\x0c", " ")
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return " ".join(lines)


def recognize_effect_text(image: np.ndarray, *, lang: str, config: str) -> str:
    """Run pytesseract on a prepared image and return the cleaned text."""

    raw_text = pytesseract.image_to_string(image, lang=lang, config=config)
    return clean_ocr_text(raw_text)


def _prepare_crop(image: np.ndarray, settings: OCRSettings) -> np.ndarray:
    if settings.preprocess:
        return prepare_for_ocr(
            image,
            resize_scale=settings.resize_scale,
            apply_threshold=settings.apply_threshold,
            denoise=settings.denoise,
        )

    prepared = image
    if settings.resize_scale and settings.resize_scale != 1.0:
        prepared = cv2.resize(
            prepared,
            None,
            fx=settings.resize_scale,
            fy=settings.resize_scale,
            interpolation=cv2.INTER_CUBIC,
        )
    if prepared.ndim == 3:
        prepared = cv2.cvtColor(prepared, cv2.COLOR_BGR2GRAY)
    return prepared


def batch_recognize(crops: Sequence[np.ndarray], *, settings: OCRSettings) -> list[str]:
    """Execute OCR over a batch of crops and return cleaned texts."""

    texts: list[str] = []
    for crop in crops:
        prepared = _prepare_crop(crop, settings)
        texts.append(
            recognize_effect_text(
                prepared,
                lang=settings.lang,
                config=settings.config,
            )
        )
    return texts


"""OCR reader utilities that wrap pytesseract."""

from __future__ import annotations

from pathlib import Path
from typing import Sequence

import cv2
import numpy as np
import pytesseract

from .google_vision import (
    VisionClient,
    close_vision_client,
    create_vision_client,
    detect_text as vision_detect_text,
)
from .preprocess import prepare_for_ocr
from ..settings import DEFAULT_OCR_ENGINE, OCRSettings


def clean_ocr_text(text: str) -> str:
    """Trim control codes and whitespace artifacts from OCR output."""

    if not text:
        return ""
    text = text.replace("\x0c", " ")
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return " ".join(lines)


def recognize_effect_text(
    image: np.ndarray,
    *,
    lang: str,
    config: str,
    engine: str = DEFAULT_OCR_ENGINE,
    vision_client: VisionClient | None = None,
    credentials_path: Path | str | None = None,
) -> str:
    """Run the configured OCR engine on a prepared image and return the cleaned text."""

    if engine == "tesseract":
        raw_text = pytesseract.image_to_string(image, lang=lang, config=config)
    elif engine in {"vision", "google", "google-vision"}:
        raw_text = vision_detect_text(
            image,
            mode="document",
            client=vision_client,
            credentials_path=credentials_path,
        )
    else:  # pragma: no cover - defensive branch for unsupported engines
        raise ValueError(f"Unsupported OCR engine: {engine}")
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
    vision_client = None
    try:
        if settings.engine in {"vision", "google", "google-vision"}:
            vision_client = create_vision_client(settings.vision_credentials_path)

        for crop in crops:
            prepared = _prepare_crop(crop, settings)
            texts.append(
                recognize_effect_text(
                    prepared,
                    lang=settings.lang,
                    config=settings.config,
                    engine=settings.engine,
                    vision_client=vision_client,
                    credentials_path=settings.vision_credentials_path,
                )
            )
    finally:
        if vision_client is not None:
            close_vision_client(vision_client)
    return texts


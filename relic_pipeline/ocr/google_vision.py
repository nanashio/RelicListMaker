"""Google Cloud Vision API OCR helpers."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

import cv2
import numpy as np

DetectionMode = Literal["document", "text"]


@lru_cache(maxsize=1)
def _get_vision_client():
    try:
        from google.cloud import vision  # type: ignore
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError(
            "google-cloud-vision がインストールされていません。requirements.txt を確認してください。"
        ) from exc

    return vision.ImageAnnotatorClient()


def detect_text(
    image: np.ndarray,
    *,
    mode: DetectionMode = "document",
) -> str:
    """Call Google Cloud Vision API and return the raw OCR text."""

    success, encoded = cv2.imencode(".png", image)
    if not success:
        raise RuntimeError("OCR 用の画像エンコードに失敗しました")

    content = encoded.tobytes()

    try:
        from google.cloud import vision  # type: ignore
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError(
            "google-cloud-vision がインストールされていません。requirements.txt を確認してください。"
        ) from exc

    client = _get_vision_client()
    gcv_image = vision.Image(content=content)

    if mode == "document":
        response = client.document_text_detection(image=gcv_image)
        annotation = response.full_text_annotation
        text = annotation.text if annotation else ""
    else:
        response = client.text_detection(image=gcv_image)
        annotations = response.text_annotations or []
        text = annotations[0].description if annotations else ""

    if response.error.message:
        raise RuntimeError(f"Google Cloud Vision API error: {response.error.message}")

    return text or ""

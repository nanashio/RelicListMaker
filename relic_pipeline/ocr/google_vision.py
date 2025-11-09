"""Google Cloud Vision API OCR helpers."""

from __future__ import annotations

from pathlib import Path
from typing import Literal, Protocol, runtime_checkable

import cv2
import numpy as np

DetectionMode = Literal["document", "text"]


def _import_vision():
    try:
        from google.cloud import vision  # type: ignore
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError(
            "google-cloud-vision がインストールされていません。requirements.txt を確認してください。"
        ) from exc

    return vision


@runtime_checkable
class VisionClient(Protocol):
    """Protocol describing the subset of the Vision client that we use."""

    def document_text_detection(self, *, image):
        ...

    def text_detection(self, *, image):
        ...

    def close(self) -> None:  # pragma: no cover - depends on transport implementation
        ...


def create_vision_client(credentials_path: Path | str | None = None) -> VisionClient:
    """Instantiate a Vision API client without relying on environment variables."""

    vision = _import_vision()

    if credentials_path:
        cred_path = Path(credentials_path).expanduser()
        if not cred_path.exists():
            raise FileNotFoundError(f"Vision 認証ファイルが見つかりません: {cred_path}")
        return vision.ImageAnnotatorClient.from_service_account_file(str(cred_path))

    return vision.ImageAnnotatorClient()


def close_vision_client(client: VisionClient) -> None:
    """Best-effort close of the underlying transport resources."""

    close = getattr(client, "close", None)
    if callable(close):  # pragma: no branch - deterministic attribute check
        close()
        return

    transport = getattr(client, "transport", None)
    transport_close = getattr(transport, "close", None)
    if callable(transport_close):  # pragma: no cover - fallback path
        transport_close()


def detect_text(
    image: np.ndarray,
    *,
    mode: DetectionMode = "document",
    client: VisionClient | None = None,
    credentials_path: Path | str | None = None,
) -> str:
    """Call Google Cloud Vision API and return the raw OCR text."""

    success, encoded = cv2.imencode(".png", image)
    if not success:
        raise RuntimeError("OCR 用の画像エンコードに失敗しました")

    content = encoded.tobytes()

    vision = _import_vision()

    managed_client = client
    close_after_use = False
    if managed_client is None:
        managed_client = create_vision_client(credentials_path)
        close_after_use = True

    gcv_image = vision.Image(content=content)

    if mode == "document":
        response = managed_client.document_text_detection(image=gcv_image)
        annotation = response.full_text_annotation
        text = annotation.text if annotation else ""
    else:
        response = managed_client.text_detection(image=gcv_image)
        annotations = response.text_annotations or []
        text = annotations[0].description if annotations else ""

    if response.error.message:
        raise RuntimeError(f"Google Cloud Vision API error: {response.error.message}")

    if close_after_use:
        close_vision_client(managed_client)

    return text or ""

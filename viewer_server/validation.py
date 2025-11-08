"""HTTP リクエストの入力バリデーションユーティリティ."""
from __future__ import annotations

import json
from dataclasses import dataclass
from http import HTTPStatus
from pathlib import Path
from typing import Any, Mapping

from .storage import SaveRequest


class RequestValidationError(Exception):
    """リクエストバリデーション失敗を表す例外."""

    def __init__(self, code: str, status: HTTPStatus = HTTPStatus.BAD_REQUEST):
        super().__init__(code)
        self.code = code
        self.status = status

    def to_payload(self) -> dict[str, str]:
        return {"error": self.code}


def parse_content_length(headers: Mapping[str, Any]) -> int:
    """Content-Length ヘッダーを検証して取得する."""

    length_text = headers.get("Content-Length", "0")
    try:
        length = int(length_text)
    except (TypeError, ValueError) as exc:
        raise RequestValidationError("invalid-content-length") from exc
    if length < 0:
        raise RequestValidationError("invalid-content-length")
    return length


def parse_json_body(raw_body: bytes) -> dict[str, Any]:
    """JSON ボディを辞書として解析する."""

    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RequestValidationError("invalid-json") from exc
    if not isinstance(payload, dict):
        raise RequestValidationError("invalid-payload")
    return payload


def _normalize_results_path(results_dir: Path, csv_path: str) -> Path:
    normalized = csv_path.lstrip("/")
    candidate = (results_dir / normalized).resolve()
    try:
        candidate.relative_to(results_dir)
    except ValueError as exc:
        raise RequestValidationError("csv-path-outside-root") from exc
    return candidate


@dataclass(slots=True)
class SavePayload:
    csv_path: Path
    dataset_label: str
    records: list[dict]


def validate_save_payload(payload: dict[str, Any], results_dir: Path) -> SavePayload:
    """保存 API の入力を検証し、正規化したデータ構造を返す."""

    csv_path_text = payload.get("csvPath")
    if not isinstance(csv_path_text, str) or not csv_path_text:
        raise RequestValidationError("invalid-csv-path")

    csv_path = _normalize_results_path(results_dir, csv_path_text)

    records = payload.get("records")
    if not isinstance(records, list):
        raise RequestValidationError("invalid-records")

    dataset_label = payload.get("datasetLabel", "")
    if not isinstance(dataset_label, str):
        dataset_label = ""

    return SavePayload(csv_path=csv_path, dataset_label=dataset_label, records=records)


def build_save_request(payload: SavePayload) -> SaveRequest:
    """検証済みのペイロードから保存リクエストを生成する."""

    return SaveRequest(csv_path=payload.csv_path, records=payload.records, dataset_label=payload.dataset_label)

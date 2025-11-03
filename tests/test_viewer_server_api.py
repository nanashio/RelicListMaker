"""viewer_server API 層のユニットテスト."""
from __future__ import annotations

from pathlib import Path

import pytest

from viewer_server import API_SAVE_PATH
from viewer_server import ServerContext  # noqa: F401 - API 公開確認用
from viewer_server.app import open_browser  # noqa: F401 - 互換API確認
from viewer_server.storage import resolve_field_order, write_records
from viewer_server.validation import RequestValidationError, build_save_request, parse_content_length, validate_save_payload


def test_api_save_path_constant() -> None:
    assert API_SAVE_PATH == "/__viewer_api__/save"


def test_parse_content_length_valid() -> None:
    assert parse_content_length({"Content-Length": "10"}) == 10


def test_parse_content_length_invalid() -> None:
    with pytest.raises(RequestValidationError) as exc:
        parse_content_length({"Content-Length": "invalid"})
    assert exc.value.code == "invalid-content-length"


def test_validate_save_payload(tmp_path: Path) -> None:
    results_dir = tmp_path / "results"
    results_dir.mkdir()
    payload = {
        "csvPath": "sample.csv",
        "records": [{"Image": "a.png"}],
        "datasetLabel": "dataset",
    }
    normalized = validate_save_payload(payload, results_dir)
    request = build_save_request(normalized)
    assert request.csv_path == results_dir / "sample.csv"
    assert request.records == payload["records"]
    assert request.dataset_label == "dataset"


def test_validate_save_payload_outside(tmp_path: Path) -> None:
    results_dir = tmp_path / "results"
    results_dir.mkdir()
    payload = {"csvPath": "../secret.csv", "records": []}
    with pytest.raises(RequestValidationError) as exc:
        validate_save_payload(payload, results_dir)
    assert exc.value.code == "csv-path-outside-root"


def test_write_records_roundtrip(tmp_path: Path) -> None:
    csv_path = tmp_path / "data.csv"
    records = [
        {"Image": "a.png", "Duplicate": "False", "Effect1": "pass"},
        {"Image": "b.png", "Duplicate": "True", "Effect2": "pending"},
    ]
    order = resolve_field_order(records, ["Image", "Duplicate"])
    write_records(csv_path, records, order)
    content = csv_path.read_text(encoding="utf-8").splitlines()
    assert content[0].startswith("Image,Duplicate")
    assert any(line.startswith("b.png") for line in content[1:])

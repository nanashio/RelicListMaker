"""CSV ストレージ操作のユーティリティ."""
from __future__ import annotations

import contextlib
import csv
import re
import threading
from dataclasses import dataclass
from http import HTTPStatus
from pathlib import Path
from typing import Iterable

_RESERVED_FIELDS = [
    "Image",
    "BaseImage",
    "Dataset",
    "DatasetFolder",
    "SourceCsv",
    "SourceImage",
    "Duplicate",
    "ItemColor",
    "Tags",
]
_EXTRA_FIELD_PREFIXES = ("Effect", "RawText", "Demerit")

_SAVE_LOCK = threading.Lock()

_LEVEL_FIELD_PATTERN = re.compile(r"^Effect(\d+)(Level(?:Source|Options)?)$", re.IGNORECASE)
_TAG_SEPARATOR_PATTERN = re.compile(r"[\s,;、，　；]+")


def _normalize_level_placeholder(value: object) -> str:
    if value is None:
        return "none"
    text = str(value).strip()
    if not text:
        return "none"
    return "none" if text.lower() == "none" else text


def _ensure_effect_level_placeholders(record: dict[str, object]) -> None:
    if not isinstance(record, dict):
        return

    pending_defaults: set[int] = set()

    for key in list(record.keys()):
        if not isinstance(key, str):
            continue
        match = _LEVEL_FIELD_PATTERN.match(key)
        if not match:
            continue
        slot = int(match.group(1))
        suffix = match.group(2).lower()
        prefix = f"Effect{slot}"

        if suffix == "level":
            normalized_key = f"{prefix}Level"
            record[normalized_key] = _normalize_level_placeholder(record.get(key))
            source_key = f"{prefix}LevelSource"
            if source_key in record:
                record[source_key] = _normalize_level_placeholder(record.get(source_key))
            continue

        if suffix == "levelsource":
            normalized_key = f"{prefix}LevelSource"
            record[normalized_key] = _normalize_level_placeholder(record.get(key))
            level_key = f"{prefix}Level"
            if level_key not in record:
                record[level_key] = record[normalized_key]
            continue

        if suffix == "leveloptions":
            level_key = f"{prefix}Level"
            if level_key in record:
                continue
            raw_options = record.get(key)
            option_text = str(raw_options).strip().lower() if raw_options is not None else ""
            if not option_text or option_text == "none":
                pending_defaults.add(slot)

    for slot in pending_defaults:
        level_key = f"Effect{slot}Level"
        if level_key not in record:
            record[level_key] = "none"
        else:
            record[level_key] = _normalize_level_placeholder(record.get(level_key))
        source_key = f"Effect{slot}LevelSource"
        if source_key in record:
            record[source_key] = _normalize_level_placeholder(record.get(source_key))


@dataclass(slots=True)
class SaveRequest:
    """保存対象 CSV とレコードを表すデータ構造."""

    csv_path: Path
    records: list[dict]
    dataset_label: str


class StorageError(Exception):
    """CSV ストレージ操作で発生したエラー."""

    def __init__(self, code: str, message: str, status: HTTPStatus = HTTPStatus.INTERNAL_SERVER_ERROR):
        super().__init__(message)
        self.code = code
        self.status = status

    def to_payload(self) -> dict[str, str]:
        detail = self.args[0] if self.args else ""
        if detail:
            return {"error": f"{self.code}: {detail}"}
        return {"error": self.code}


def load_csv_records(csv_path: Path) -> tuple[list[dict[str, str]], list[str]]:
    """CSV を読み込み、既存レコードとフィールド順序を返す."""

    if not csv_path.exists():
        return [], []
    try:
        with csv_path.open("r", encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            records = list(reader)
            fieldnames = list(reader.fieldnames or [])
    except OSError as exc:  # pragma: no cover - 例外経路はテストで個別検証
        raise StorageError("read-failed", str(exc)) from exc
    return records, fieldnames


def resolve_field_order(records: Iterable[dict], existing_order: Iterable[str]) -> list[str]:
    """保存対象レコードと既存順序からフィールド順序を決定する."""

    order: list[str] = []
    seen: set[str] = set()

    def register(name: str) -> None:
        if name and name not in seen:
            seen.add(name)
            order.append(name)

    for field in existing_order:
        register(field)

    for field in _RESERVED_FIELDS:
        register(field)

    extra_fields: set[str] = set()
    for record in records:
        if not isinstance(record, dict):
            continue
        for key in record.keys():
            if key in seen:
                continue
            if any(key.startswith(prefix) for prefix in _EXTRA_FIELD_PREFIXES):
                extra_fields.add(key)
            else:
                register(key)

    for key in sorted(extra_fields, key=lambda value: (value.rstrip("0123456789"), value)):
        register(key)

    return order


def write_records(csv_path: Path, records: list[dict], field_order: list[str]) -> None:
    """CSV にレコードを書き込む."""

    csv_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = csv_path.with_suffix(csv_path.suffix + ".tmp")

    with _SAVE_LOCK:
        try:
            with tmp_path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=field_order)
                writer.writeheader()
                for record in records:
                    if not isinstance(record, dict):
                        continue
                    _ensure_effect_level_placeholders(record)
                    row = {}
                    for field in field_order:
                        value = record.get(field, "")
                        if field == "Tags":
                            value = _serialize_tags_field(value)
                        row[field] = value
                    writer.writerow(row)
            tmp_path.replace(csv_path)
        except OSError as exc:
            if tmp_path.exists():
                with contextlib.suppress(OSError):
                    tmp_path.unlink()
            raise StorageError("write-failed", str(exc)) from exc
def _serialize_tags_field(value: object) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if not text:
        return ""
    tokens = [token.strip() for token in _TAG_SEPARATOR_PATTERN.split(text) if token.strip()]
    if not tokens:
        return ""
    seen: set[str] = set()
    unique_tokens: list[str] = []
    for token in tokens:
        key = token.casefold()
        if key in seen:
            continue
        seen.add(key)
        unique_tokens.append(token)
    return ";".join(unique_tokens)

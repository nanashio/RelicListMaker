"""master_relics.csv 関連の共通ユーティリティ."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Iterable, Optional, Sequence, Union

from resource_paths import templates_path

MASTER_RELICS_FILENAME = "master_relics.csv"
DEFAULT_MASTER_COLUMN = "EffectBase"
_SKIP_VALUES = {"", "-"}


def resolve_master_csv_path(path: Optional[Union[str, Path]] = None) -> Path:
    """master_relics.csv の実際のパスを解決する."""

    if path is None:
        return templates_path(MASTER_RELICS_FILENAME)
    resolved = Path(path)
    if not resolved.is_absolute():
        resolved = Path.cwd() / resolved
    return resolved.resolve()


def normalize_master_values(values: Optional[Iterable[object]]) -> list[str]:
    """マスターデータ候補を正規化して重複やダミー値を除外する."""

    normalized: list[str] = []
    seen: set[str] = set()
    for value in values or []:
        if value is None:
            continue
        text = str(value).strip()
        if text in _SKIP_VALUES:
            continue
        if text not in seen:
            seen.add(text)
            normalized.append(text)
    return normalized


def load_master_csv(
    path: Optional[Union[str, Path]] = None,
    *,
    column: str = DEFAULT_MASTER_COLUMN,
) -> list[str]:
    """master_relics.csv から指定カラムの値を読み込む."""

    csv_path = resolve_master_csv_path(path)
    if not csv_path.exists():
        print(f"[WARN] master_relics.csv が見つかりません: {csv_path}")
        return []

    try:
        with csv_path.open("r", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            if column not in (reader.fieldnames or []):
                print(
                    f"[WARN] master_relics.csv にカラム '{column}' が見つかりません: {csv_path}"
                )
                return []
            raw_values = [row.get(column, "") for row in reader]
    except OSError as err:
        print(f"[WARN] master_relics.csv の読み込みに失敗しました: {err}")
        return []

    return normalize_master_values(raw_values)


def load_master_json(
    path: Optional[Union[str, Path]],
    *,
    key_candidates: Sequence[str] = ("EffectBase", "effect", "name"),
) -> list[str]:
    """JSON 形式のマスターデータから候補を抽出する."""

    if not path:
        return []

    json_path = Path(path)
    if not json_path.is_absolute():
        json_path = Path.cwd() / json_path
    json_path = json_path.resolve()

    if not json_path.exists():
        print(f"[WARN] master_relics.json が見つかりません: {json_path}")
        return []

    try:
        with json_path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, json.JSONDecodeError) as err:
        print(f"[WARN] master_relics.json の読み込みに失敗しました: {err}")
        return []

    if isinstance(payload, list):
        candidates: list[str] = []
        for entry in payload:
            if isinstance(entry, str):
                candidates.append(entry)
            elif isinstance(entry, dict):
                for key in key_candidates:
                    raw = entry.get(key)
                    if isinstance(raw, str):
                        candidates.append(raw)
                        break
        return normalize_master_values(candidates)

    print(f"[WARN] master_relics.json が期待するリスト形式ではありません: {json_path}")
    return []

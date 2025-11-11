"""master_relics.csv 関連の共通ユーティリティ."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Iterable, Optional, Sequence, Union

from resource_paths import templates_path

MASTER_RELICS_FILENAME = "master_relics.csv"
DEFAULT_MASTER_COLUMN = "EffectBase"
LEVELS_COLUMN = "Levels"
DEMERIT_COLUMN = "Demerit"
EXISTING_COLUMN = "Existing"
_SKIP_VALUES = {""}
_PLACEHOLDER_VALUE = "-"
_FALSE_VALUES = {"false", "no", "none"}
_NEGATIVE_MARKS = {"✕", "×", "x"}


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


def _parse_levels_field(raw_value: object) -> list[str]:
    """Levels カラムの値をリストへ変換する。"""

    if raw_value is None:
        return []
    text_value = str(raw_value).strip()
    if not text_value:
        return []
    if text_value.lower() in _FALSE_VALUES:
        return []

    levels: list[str] = []
    for token in text_value.split(","):
        cleaned = token.strip()
        if not cleaned or cleaned in _SKIP_VALUES:
            continue
        if cleaned == _PLACEHOLDER_VALUE:
            continue
        if cleaned not in levels:
            levels.append(cleaned)
    return levels


def _normalize_boolean_flag(raw_value: object) -> bool:
    if raw_value is None:
        return False
    if isinstance(raw_value, bool):
        return raw_value
    text = str(raw_value).strip()
    if not text:
        return False
    lowered = text.lower()
    if lowered in _FALSE_VALUES or lowered in _NEGATIVE_MARKS:
        return False
    if lowered in {"true", "yes", "1"}:
        return True
    if text in {"〇", "○", "◯"}:
        return True
    if text in {"✕", "×"}:
        return False
    return True


def _normalize_level_token(raw_value: object) -> str:
    if raw_value is None:
        return ""
    text = str(raw_value).strip()
    if not text:
        return ""
    normalized = (
        text.replace("﹢", "＋")
        .replace("+", "＋")
        .replace("﹣", "－")
        .replace("−", "－")
        .replace("-", "－")
    )
    return normalized.replace(" ", "")


def _looks_like_level_token(token: str) -> bool:
    if not token:
        return False
    if any(char.isdigit() for char in token):
        return True
    if "＋" in token or "－" in token:
        return True
    return False


def _extract_level_tokens(raw_value: object) -> list[str]:
    tokens: list[str] = []
    for candidate in _parse_levels_field(raw_value):
        normalized = _normalize_level_token(candidate)
        if _looks_like_level_token(normalized):
            tokens.append(normalized)
    return tokens


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


def load_master_effects_and_levels(
    path: Optional[Union[str, Path]] = None,
    *,
    column: str = DEFAULT_MASTER_COLUMN,
) -> tuple[list[str], dict[str, list[str]]]:
    """EffectBase 候補と対応するレベル一覧を同時に読み込む。"""

    csv_path = resolve_master_csv_path(path)
    if not csv_path.exists():
        print(f"[WARN] master_relics.csv が見つかりません: {csv_path}")
        return [], {}

    effects: list[str] = []
    levels_map: dict[str, list[str]] = {}
    try:
        with csv_path.open("r", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            fieldnames = reader.fieldnames or []
            if column not in fieldnames:
                print(f"[WARN] master_relics.csv にカラム '{column}' が見つかりません: {csv_path}")
                return [], {}
            has_levels_column = LEVELS_COLUMN in fieldnames
            for row in reader:
                base = str(row.get(column, "")).strip()
                if not base or base in _SKIP_VALUES:
                    continue
                effects.append(base)
                if has_levels_column:
                    tokens = _parse_levels_field(row.get(LEVELS_COLUMN))
                    if tokens:
                        existing = levels_map.get(base, [])
                        merged = list(existing)
                        for token in tokens:
                            if token not in merged:
                                merged.append(token)
                        if merged:
                            levels_map[base] = merged
    except OSError as err:
        print(f"[WARN] master_relics.csv の読み込みに失敗しました: {err}")
        return [], {}

    normalized_effects = normalize_master_values(effects)
    filtered_levels: dict[str, list[str]] = {}
    for effect in normalized_effects:
        tokens = levels_map.get(effect)
        if tokens:
            filtered_levels[effect] = tokens
    return normalized_effects, filtered_levels


def load_master_effect_metadata(
    path: Optional[Union[str, Path]] = None,
    *,
    column: str = DEFAULT_MASTER_COLUMN,
) -> dict[str, dict[str, object]]:
    """master_relics.csv からデメリット有無や対応レベルを取得する."""

    csv_path = resolve_master_csv_path(path)
    if not csv_path.exists():
        print(f"[WARN] master_relics.csv が見つかりません: {csv_path}")
        return {}

    metadata: dict[str, dict[str, object]] = {}
    try:
        with csv_path.open("r", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            fieldnames = reader.fieldnames or []
            if column not in fieldnames:
                print(f"[WARN] master_relics.csv にカラム '{column}' が見つかりません: {csv_path}")
                return {}
            has_demerit_column = DEMERIT_COLUMN in fieldnames
            for row in reader:
                base = str(row.get(column, "")).strip()
                if not base or base in _SKIP_VALUES:
                    continue
                effect_key = base.strip().lower()
                has_demerit = False
                demerit_value = ""
                if has_demerit_column:
                    raw_demerit_value = row.get(DEMERIT_COLUMN)
                    demerit_value = str(raw_demerit_value).strip() if raw_demerit_value is not None else ""
                    has_demerit = _normalize_boolean_flag(raw_demerit_value)
                level_tokens: list[str] = []
                if has_demerit_column and demerit_value:
                    level_tokens = _extract_level_tokens(row.get(DEMERIT_COLUMN))
                metadata[effect_key] = {
                    "hasDemerit": has_demerit,
                    "levels": level_tokens,
                }
    except OSError as err:
        print(f"[WARN] master_relics.csv の読み込みに失敗しました: {err}")
        return {}

    return metadata


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

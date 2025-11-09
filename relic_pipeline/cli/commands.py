"""Command-line entrypoints for OCR utilities."""

from __future__ import annotations

from argparse import Namespace
from typing import Callable, Mapping, MutableMapping, Sequence

from ..io import normalize_column_visibility, parse_column_flag_value
from ..settings import DEFAULT_COLUMN_VISIBILITY, DEFAULT_RESIZE_SCALE


def _coerce_column_overrides(raw: object) -> MutableMapping[str, bool]:
    if raw is None:
        return {}

    if isinstance(raw, Mapping):
        overrides: dict[str, bool] = {}
        for key, value in raw.items():
            parsed = parse_column_flag_value(value)
            if parsed is None:
                print(f"[WARN] 列 `{key}` の値を True/False に解釈できません: {value!r}")
                continue
            overrides[str(key)] = parsed
        return overrides

    if isinstance(raw, Sequence) and not isinstance(raw, (str, bytes)):
        overrides: dict[str, bool] = {}
        for entry in raw:
            if not isinstance(entry, str):
                print(f"[WARN] 列指定の形式が不正です: {entry}")
                continue
            if "=" not in entry:
                print(f"[WARN] 列指定には KEY=VALUE 形式を使用してください: {entry}")
                continue
            key, raw_value = entry.split("=", 1)
            key = key.strip()
            if not key:
                print(f"[WARN] 列名が空です: {entry}")
                continue
            parsed = parse_column_flag_value(raw_value)
            if parsed is None:
                print(f"[WARN] 列 `{key}` の値を True/False に解釈できません: {raw_value}")
                continue
            overrides[key] = parsed
        return overrides

    print(f"[WARN] 列表示設定の型を処理できません: {type(raw)!r}")
    return {}


def process_images_command(
    args: Namespace,
    *,
    runner: Callable[..., object] | None = None,
) -> int:
    """Invoke the OCR pipeline for cropped images based on CLI arguments."""

    overrides = _coerce_column_overrides(getattr(args, "column_visibility", None))
    column_visibility = overrides or None

    if runner is None:
        from match_and_export import process_images as runner  # Local import to avoid cycles

    try:
        runner(
            image_dir=str(getattr(args, "image_dir", "crops")),
            output_path=str(getattr(args, "output_path", getattr(args, "output", "results.csv"))),
            scale=float(getattr(args, "scale", 1.0)),
            upsample=float(getattr(args, "upsample", DEFAULT_RESIZE_SCALE)),
            preprocess=bool(getattr(args, "preprocess", True)),
            corrections_csv=getattr(args, "corrections_csv", None),
            item_color=getattr(args, "item_color", None),
            column_visibility=column_visibility,
            ocr_engine=str(getattr(args, "ocr_engine", "tesseract")),
            gcp_credentials=getattr(args, "gcp_credentials", None),
            gcp_credentials_filename=getattr(args, "gcp_credentials_filename", None),
        )
    except Exception as error:  # pragma: no cover - defensive CLI wrapper
        print(f"[ERROR] OCR 処理に失敗しました: {error}")
        return 1

    return 0


def build_column_flags(overrides: object) -> MutableMapping[str, bool]:
    """Merge CLI overrides with defaults to produce final column flags."""

    parsed_overrides = _coerce_column_overrides(overrides)
    defaults: MutableMapping[str, bool] = dict(DEFAULT_COLUMN_VISIBILITY)
    return normalize_column_visibility(parsed_overrides, defaults=defaults)


__all__ = ["process_images_command", "build_column_flags"]

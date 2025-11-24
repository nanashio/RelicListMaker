"""後方互換レイヤーの実装を切り出した OCR/マッチング処理群."""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Mapping, Sequence

import cv2
import pytesseract
from rapidfuzz import fuzz

from relic_data import load_master_csv, load_master_effects_and_levels, normalize_master_values
from resource_paths import templates_path
from tesseract_bundle import configure_pytesseract, is_system_tesseract_preferred, system_tesseract_reason

from relic_pipeline.io import build_row, load_corrections, normalize_column_visibility, write_csv
from relic_pipeline.matching import MatchResult, resolve_effect
from relic_pipeline.ocr.reader import batch_recognize
from relic_pipeline.settings import (
    DEFAULT_COLUMN_VISIBILITY,
    DEFAULT_GCP_CREDENTIALS_FILENAME,
    DEFAULT_OCR_CONFIG,
    DEFAULT_RESIZE_SCALE,
    ExportOptions,
    MatchingSettings,
    OCRSettings,
)

BUNDLED_TESSERACT = configure_pytesseract()
_TESSERACT_NOTICE_SHOWN = False

DICTIONARY_PATH = templates_path("master_relics.csv")
DEMERIT_DICTIONARY_PATH = templates_path("master_relics_demerit.csv")
COLUMN_NAME_IN_CSV = "EffectBase"

# 元サイズ (1920x1080前提)
BASE_CROP_BOXES = [
    (188, 78, 768, 128),
    (188, 138, 768, 188),
    (188, 198, 768, 248),
]

OCR_CONFIG = DEFAULT_OCR_CONFIG
DEFAULT_UPSAMPLE = DEFAULT_RESIZE_SCALE
CORRECTION_SCORE = 100.0


@dataclass(slots=True)
class ProcessingParameters:
    """Structured container for OCR/matching/export configuration."""

    crop_boxes: Sequence[tuple[int, int, int, int]]
    ocr_settings: OCRSettings
    export_options: ExportOptions
    default_matching: MatchingSettings
    slot_settings: Mapping[int, MatchingSettings]
    slot_sources: Mapping[int, str]
    demerit_matching: MatchingSettings | None = None


def _resolve_packaged_credentials(filename: str | None) -> Path | None:
    trimmed = (filename or "").strip()
    if not trimmed:
        return None
    if getattr(sys, "frozen", False):
        exe_path = Path(sys.executable).resolve()
        candidate = exe_path.parent / trimmed
        if candidate.exists():
            return candidate
    return None


def _resolve_gcp_credentials(
    gcp_credentials: str | None,
    packaged_filename: str | None,
) -> Path | None:
    resolved: Path | None = None
    if gcp_credentials:
        cred_path = Path(gcp_credentials).expanduser()
        if cred_path.exists():
            resolved = cred_path
        else:
            print(f"[WARN] 指定した認証ファイルが見つかりません: {cred_path}")

    if resolved is None:
        packaged_path = _resolve_packaged_credentials(packaged_filename)
        if packaged_path is not None:
            resolved = packaged_path
            print(
                "[INFO] 実行ファイルと同じディレクトリの認証ファイルを利用します: "
                f"{packaged_path.name}"
            )
        elif packaged_filename and getattr(sys, "frozen", False):
            print(
                "[WARN] Vision認証ファイルが実行ファイルと同じディレクトリにありません: "
                f"{packaged_filename}"
            )

    if resolved is not None and resolved != Path(gcp_credentials or "").expanduser():
        print(f"[INFO] Vision 認証ファイル: {resolved}")

    return resolved


def scale_crop_boxes(boxes, scale: float = 1.0):
    """拡大倍率に応じてcrop座標をスケーリング"""
    scaled = []
    for (x1, y1, x2, y2) in boxes:
        scaled.append(
            (
                int(x1 * scale),
                int(y1 * scale),
                int(x2 * scale),
                int(y2 * scale),
            )
        )
    return scaled


def build_processing_parameters(
    *,
    scale: float,
    upsample: float,
    preprocess: bool,
    column_visibility: Mapping[str, object] | None,
    item_color: str | None,
    relic_type: str | None,
    master_csv_path: str | None,
    corrections_csv: str | None,
    demerit_master_csv_path: str | None,
    ocr_engine: str,
    gcp_credentials: str | None,
    gcp_credentials_filename: str | None,
) -> ProcessingParameters:
    normalized_engine = (ocr_engine or "tesseract").lower()
    credentials_path: Path | None = None
    if normalized_engine in {"vision", "google", "google-vision"}:
        credentials_path = _resolve_gcp_credentials(
            gcp_credentials,
            gcp_credentials_filename,
        )
        print("[INFO] Google Cloud Vision API を利用して OCR を実行します")

    ocr_settings = OCRSettings(
        config=OCR_CONFIG,
        engine=normalized_engine,
        preprocess=preprocess,
        resize_scale=upsample,
        vision_credentials_path=credentials_path,
    )

    crop_boxes = scale_crop_boxes(BASE_CROP_BOXES, scale)
    column_flags = normalize_column_visibility(
        column_visibility,
        defaults=dict(DEFAULT_COLUMN_VISIBILITY),
    )

    raw_relic_type = (relic_type or "").strip()
    lowered_relic_type = raw_relic_type.lower()
    if lowered_relic_type in {"深層", "深層遺物"}:
        normalized_relic_type = "deep"
    elif lowered_relic_type in {"deep"}:
        normalized_relic_type = "deep"
    elif lowered_relic_type in {"normal", "通常"}:
        normalized_relic_type = "normal"
    elif lowered_relic_type:
        normalized_relic_type = "normal"
    else:
        normalized_relic_type = "normal"

    display_relic_type = normalized_relic_type if raw_relic_type else ""

    if master_csv_path:
        master_path = master_csv_path
    else:
        if normalized_relic_type == "deep":
            master_path = templates_path("master_relics_deep.csv")
        else:
            master_path = DICTIONARY_PATH

    dictionary, level_map = load_master_effects_and_levels(
        master_path, column=COLUMN_NAME_IN_CSV
    )
    if not dictionary:
        print("辞書の読み込み失敗")

    corrections_map = load_corrections(corrections_csv)
    if corrections_map:
        dictionary = normalize_master_values(list(dictionary) + list(corrections_map.values()))

    default_matching = MatchingSettings(
        dictionary=list(dictionary),
        scorer=fuzz.WRatio,
        corrections=corrections_map or {},
        correction_score=CORRECTION_SCORE,
    )

    slot_settings: dict[int, MatchingSettings] = {}
    slot_sources: dict[int, str] = {}
    demerit_slots: list[int] = []
    demerit_matching: MatchingSettings | None = None

    if normalized_relic_type == "deep":
        demerit_path = demerit_master_csv_path or DEMERIT_DICTIONARY_PATH
        demerit_candidates = load_master_csv(demerit_path, column=COLUMN_NAME_IN_CSV)
        if demerit_candidates:
            if corrections_map:
                demerit_candidates = normalize_master_values(
                    list(demerit_candidates) + list(corrections_map.values())
                )
            demerit_matching = MatchingSettings(
                dictionary=list(demerit_candidates),
                scorer=fuzz.WRatio,
                corrections=corrections_map or {},
                correction_score=CORRECTION_SCORE,
            )
        else:
            print(f"[WARN] デメリット辞書が見つかりません: {demerit_path}")
        demerit_slots = list(range(1, len(crop_boxes) + 1))

    export_options = ExportOptions(
        column_visibility=column_flags,
        slot_range=range(1, len(crop_boxes) + 1),
        level_map=level_map,
        item_color=item_color,
        relic_type=display_relic_type,
        demerit_slots=tuple(demerit_slots),
    )

    return ProcessingParameters(
        crop_boxes=crop_boxes,
        ocr_settings=ocr_settings,
        export_options=export_options,
        default_matching=default_matching,
        slot_settings=slot_settings,
        slot_sources=slot_sources,
        demerit_matching=demerit_matching,
    )


def ocr_and_match(
    img_path,
    *,
    crop_boxes: Sequence[tuple[int, int, int, int]],
    ocr_settings: OCRSettings,
    default_matching: MatchingSettings,
    slot_settings: Mapping[int, MatchingSettings] | None = None,
    slot_sources: Mapping[int, str] | None = None,
) -> tuple[list[MatchResult], list[list[str]]]:
    boxes = crop_boxes

    try:
        img_cv = cv2.imread(img_path)
        if img_cv is None:
            raise FileNotFoundError(f"画像を読み込めませんでした: {img_path}")

        results: list[MatchResult] = []
        recognized_lines: list[list[str]] = []
        valid_crops: list[object] = []
        valid_positions: list[int] = []
        valid_slots: list[int] = []

        for box_index, (x1, y1, x2, y2) in enumerate(boxes, start=1):
            crop = img_cv[y1:y2, x1:x2]
            if crop is None or crop.size == 0:
                results.append(
                    MatchResult(
                        raw_text="",
                        matched_text="No image",
                        score=0.0,
                        source="error",
                    )
                )
                recognized_lines.append([])
                continue

            valid_positions.append(len(results))
            results.append(
                MatchResult(
                    raw_text="",
                    matched_text="",
                    score=0.0,
                    source="pending",
                )
            )
            recognized_lines.append([])
            valid_crops.append(crop)
            valid_slots.append(box_index)

        if not valid_crops:
            return results, recognized_lines

        recognized_texts = batch_recognize(valid_crops, settings=ocr_settings)

        slot_overrides = slot_settings or {}
        source_overrides = slot_sources or {}

        for position, text, slot_index in zip(valid_positions, recognized_texts, valid_slots):
            settings = slot_overrides.get(slot_index, default_matching)
            lines = [line.strip() for line in text.splitlines() if line.strip()]
            recognized_lines[position] = lines

            effect_text = lines[0] if lines else ""
            if not effect_text:
                effect_text = text.strip()

            match_result = resolve_effect(effect_text, settings=settings)
            match_result = replace(match_result, raw_text=effect_text)
            override_source = source_overrides.get(slot_index)
            if override_source:
                match_result = replace(match_result, source=override_source)
            results[position] = match_result

        return results, recognized_lines
    except Exception as err:
        print(f"OCR error: {err}")
        fallback_length = len(boxes)
        fallback_results = [
            MatchResult(
                raw_text="",
                matched_text="Error",
                score=0.0,
                source="error",
            )
            for _ in range(fallback_length)
        ]
        fallback_lines: list[list[str]] = [[] for _ in range(fallback_length)]
        return fallback_results, fallback_lines


def _build_skipped_matches(slot_count: int) -> list[MatchResult]:
    return [
        MatchResult(raw_text="", matched_text="", score=0.0, source="skipped")
        for _ in range(slot_count)
    ]


def _export_without_ocr(
    image_dir: str,
    output_path: str,
    *,
    export_options: ExportOptions,
    slot_count: int,
    column_flags: Mapping[str, bool],
) -> None:
    print("[INFO] OCRを実行せず、空の結果でCSVを書き出します")

    matches = _build_skipped_matches(slot_count)
    rows: list[dict[str, object]] = []
    for fname in sorted(os.listdir(image_dir)):
        if not fname.endswith(".png"):
            continue
        rows.append(build_row(fname, matches, options=export_options))

    if not rows:
        print("[WARN] OCR無しで出力する画像が見つかりませんでした")
        return

    output_file = Path(output_path)
    try:
        write_csv(rows, path=output_file, column_flags=column_flags)
    except OSError as err:
        print(f"[!] CSVの書き込みに失敗しました: {err}")
        return

    print(f"[✓] OCRなしでCSV出力完了: {output_path}")


def process_images(
    image_dir="crops",
    output_path="results.csv",
    *,
    crop_boxes: Sequence[tuple[int, int, int, int]],
    ocr_settings: OCRSettings,
    export_options: ExportOptions,
    default_matching: MatchingSettings,
    slot_settings: Mapping[int, MatchingSettings] | None = None,
    slot_sources: Mapping[int, str] | None = None,
    demerit_matching: MatchingSettings | None = None,
):
    global _TESSERACT_NOTICE_SHOWN
    normalized_engine = (ocr_settings.engine or "tesseract").lower()
    column_flags = export_options.column_visibility

    if normalized_engine == "none":
        _export_without_ocr(
            image_dir,
            output_path,
            export_options=export_options,
            slot_count=len(crop_boxes),
            column_flags=column_flags,
        )
        return

    if normalized_engine == "tesseract":
        if not _TESSERACT_NOTICE_SHOWN:
            if is_system_tesseract_preferred():
                reason = system_tesseract_reason()
                if reason == "wsl":
                    print("[INFO] WSL 環境のためシステムにインストールされた Tesseract を利用します")
                elif reason and reason != "missing":
                    print("[INFO] システムにインストール済みの Tesseract を利用します")
            _TESSERACT_NOTICE_SHOWN = True
        version = pytesseract.get_tesseract_version()
        print(f"Tesseract Ver: {version}")
    elif normalized_engine not in {"vision", "google", "google-vision"}:
        raise ValueError(f"サポートされていない OCR エンジンです: {ocr_settings.engine}")

    if not default_matching.dictionary:
        print("辞書の読み込み失敗")
        return

    slot_overrides = slot_settings or {}
    source_overrides = slot_sources or {}
    column_flags = export_options.column_visibility
    slot_range = list(export_options.slot_range)
    if len(slot_range) != len(crop_boxes):
        print("[WARN] スロット数とクロップ数が一致しません。設定を確認してください。")

    rows: list[dict[str, object]] = []
    for fname in sorted(os.listdir(image_dir)):
        if not fname.endswith(".png"):
            continue
        img_path = os.path.join(image_dir, fname)
        match_results, recognized_lines = ocr_and_match(
            img_path,
            crop_boxes=crop_boxes,
            ocr_settings=ocr_settings,
            default_matching=default_matching,
            slot_settings=slot_overrides,
            slot_sources=source_overrides,
        )

        slot_range = list(export_options.slot_range)
        slot_overrides = slot_settings or {}
        source_overrides = slot_sources or {}
        column_flags = export_options.column_visibility

        demerit_row_matches: dict[int, MatchResult] = {}
        if demerit_matching is not None and export_options.demerit_slots:
            for idx in export_options.demerit_slots:
                if idx in range(1, len(match_results) + 1):
                    if len(recognized_lines) >= idx and len(recognized_lines[idx - 1]) > 1:
                        demerit_text = recognized_lines[idx - 1][1]
                    else:
                        demerit_text = ""

                    if demerit_text.strip():
                        demerit_match = resolve_effect(demerit_text, settings=demerit_matching)
                        demerit_match = replace(
                            demerit_match,
                            raw_text=demerit_text,
                            source="demerit",
                        )
                    else:
                        demerit_match = MatchResult(
                            raw_text=demerit_text,
                            matched_text=demerit_text,
                            score=0.0,
                            source="ocr",
                        )
                    demerit_row_matches[idx] = demerit_match
        row = build_row(
            fname,
            match_results,
            options=export_options,
            demerit_matches=demerit_row_matches,
        )
        rows.append(row)

    if not rows:
        print("[!] 出力対象となるOCR結果がありませんでした")
        return

    output_file = Path(output_path)
    try:
        write_csv(rows, path=output_file, column_flags=column_flags)
    except OSError as err:
        print(f"[!] CSVの書き込みに失敗しました: {err}")
        return

    print(f"[✓] CSV出力完了: {output_path}")


__all__ = [
    "BASE_CROP_BOXES",
    "BUNDLED_TESSERACT",
    "COLUMN_NAME_IN_CSV",
    "CORRECTION_SCORE",
    "DEFAULT_UPSAMPLE",
    "DEMERIT_DICTIONARY_PATH",
    "DICTIONARY_PATH",
    "OCR_CONFIG",
    "ProcessingParameters",
    "build_processing_parameters",
    "ocr_and_match",
    "process_images",
    "scale_crop_boxes",
    "DEFAULT_GCP_CREDENTIALS_FILENAME",
]

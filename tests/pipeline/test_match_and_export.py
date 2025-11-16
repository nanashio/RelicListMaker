import sys
import types
from pathlib import Path

import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import match_and_export  # noqa: E402
from relic_pipeline import processing  # noqa: E402
from relic_pipeline.matching import MatchResult  # noqa: E402
from relic_pipeline.settings import MatchingSettings, OCRSettings  # noqa: E402


def test_ocr_and_match_returns_match_results(monkeypatch):
    dummy_image = np.zeros((20, 20, 3), dtype=np.uint8)
    captured_paths: list[str] = []

    def fake_imread(path):  # pragma: no cover - simple stub
        captured_paths.append(path)
        return dummy_image

    def fake_batch_recognize(crops, settings):  # pragma: no cover - simple stub
        assert len(crops) == 1
        return ["dummy text\ndemerit text"]

    def fake_resolve_effect(text, *, settings):  # pragma: no cover - simple stub
        assert text == "dummy text"
        assert list(settings.dictionary) == ["Dummy"]
        return MatchResult(raw_text=text, matched_text="Resolved", score=87.0, source="dictionary")

    monkeypatch.setattr(
        processing,
        "cv2",
        types.SimpleNamespace(imread=fake_imread),
    )
    monkeypatch.setattr(processing, "batch_recognize", fake_batch_recognize)
    monkeypatch.setattr(processing, "resolve_effect", fake_resolve_effect)

    ocr_settings = OCRSettings(
        config=processing.OCR_CONFIG,
        engine="tesseract",
        preprocess=False,
        resize_scale=1.0,
    )
    matching_settings = MatchingSettings(dictionary=["Dummy"], corrections={})

    assert match_and_export.ocr_and_match is processing.ocr_and_match

    results, recognized_lines = processing.ocr_and_match(
        "dummy.png",
        crop_boxes=[(0, 0, 10, 10)],
        ocr_settings=ocr_settings,
        default_matching=matching_settings,
    )

    assert captured_paths == ["dummy.png"]
    assert len(results) == 1
    result = results[0]
    assert isinstance(result, MatchResult)
    assert result.raw_text == "dummy text"
    assert result.matched_text == "Resolved"
    assert recognized_lines == [["dummy text", "demerit text"]]


def test_process_images_emits_source_columns(monkeypatch, tmp_path):
    image_dir = tmp_path / "crops"
    image_dir.mkdir()
    (image_dir / "sample.png").write_bytes(b"binary")

    dummy_image = np.zeros((10, 10, 3), dtype=np.uint8)

    monkeypatch.setattr(processing, "BASE_CROP_BOXES", [(0, 0, 10, 10)])
    monkeypatch.setattr(
        processing,
        "cv2",
        types.SimpleNamespace(imread=lambda path: dummy_image),
    )
    monkeypatch.setattr(
        processing,
        "batch_recognize",
        lambda crops, settings: ["Effect Raw +1\nDemerit Raw"],
    )

    def fake_resolve_effect(text, *, settings):  # pragma: no cover - simple stub
        if "Demerit" in text:
            return MatchResult(
                raw_text=text,
                matched_text="Demerit Matched",
                score=55.0,
                source="demerit-dictionary",
            )
        return MatchResult(
            raw_text=text,
            matched_text="Effect Matched",
            score=98.5,
            source="effect-dictionary",
        )

    monkeypatch.setattr(processing, "resolve_effect", fake_resolve_effect)
    monkeypatch.setattr(
        processing,
        "load_master_effects_and_levels",
        lambda path, column="EffectBase": (["Effect Matched"], {"Effect Matched": ["+1"]}),
    )
    monkeypatch.setattr(
        processing,
        "load_master_csv",
        lambda path, column="EffectBase": ["Demerit Matched"],
    )
    monkeypatch.setattr(processing, "load_corrections", lambda _: {})
    monkeypatch.setattr(
        processing,
        "pytesseract",
        types.SimpleNamespace(get_tesseract_version=lambda: "5.0.0"),
    )
    monkeypatch.setattr(processing, "is_system_tesseract_preferred", lambda: False)
    monkeypatch.setattr(processing, "system_tesseract_reason", lambda: "")
    monkeypatch.setattr(processing, "_TESSERACT_NOTICE_SHOWN", True)

    captured_rows: list[dict[str, object]] = []

    def fake_write_csv(rows, *, path, column_flags):  # pragma: no cover - simple stub
        captured_rows.extend(rows)

    monkeypatch.setattr(processing, "write_csv", fake_write_csv)

    assert match_and_export.process_images is processing.process_images

    params = processing.build_processing_parameters(
        scale=1.0,
        upsample=1.0,
        preprocess=True,
        column_visibility=None,
        item_color="yellow",
        relic_type="deep",
        master_csv_path=None,
        corrections_csv=None,
        demerit_master_csv_path=None,
        ocr_engine="tesseract",
        gcp_credentials=None,
        gcp_credentials_filename=None,
    )

    processing.process_images(
        image_dir=str(image_dir),
        output_path=str(tmp_path / "results.csv"),
        crop_boxes=params.crop_boxes,
        ocr_settings=params.ocr_settings,
        export_options=params.export_options,
        default_matching=params.default_matching,
        slot_settings=params.slot_settings,
        slot_sources=params.slot_sources,
        demerit_matching=params.demerit_matching,
    )

    assert len(captured_rows) == 1
    row = captured_rows[0]

    assert row["Image"] == "sample.png"
    assert row["Duplicate"] is False
    assert row["ItemColor"] == "yellow"
    assert row["RelicType"] == "deep"

    assert row["Effect1"] == "Effect Matched"
    assert row["Effect1Source"] == "Effect Matched"
    assert row["Effect1Level"] == "+1"
    assert row["Effect1LevelSource"] == "+1"
    assert row["Effect1LevelOptions"] == "+1"
    assert row["Effect1Status"] == "pending"
    assert row["RawText1"] == "Effect Raw +1"
    assert row["Effect1Score"] == 98.5

    assert row["Demerit1"] == "Demerit Matched"
    assert row["Demerit1Source"] == "Demerit Matched"
    assert row["Demerit1Level"] == "none"
    assert row["Demerit1LevelSource"] == "none"
    assert row["Demerit1LevelOptions"] == "none"
    assert row["Demerit1Status"] == "pending"
    assert row["Demerit1RawText"] == "Demerit Raw"
    assert row["Demerit1Score"] == 55.0


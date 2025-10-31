import sys
import types
from pathlib import Path

import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import match_and_export  # noqa: E402
from relic_pipeline.matching import MatchResult  # noqa: E402


def test_ocr_and_match_returns_match_results(monkeypatch):
    dummy_image = np.zeros((20, 20, 3), dtype=np.uint8)
    captured_paths: list[str] = []

    def fake_imread(path):  # pragma: no cover - simple stub
        captured_paths.append(path)
        return dummy_image

    def fake_batch_recognize(crops, settings):  # pragma: no cover - simple stub
        assert len(crops) == 1
        return ["dummy text"]

    def fake_resolve_effect(text, *, settings):  # pragma: no cover - simple stub
        assert text == "dummy text"
        assert list(settings.dictionary) == ["Dummy"]
        return MatchResult(raw_text=text, matched_text="Resolved", score=87.0, source="dictionary")

    monkeypatch.setattr(
        match_and_export,
        "cv2",
        types.SimpleNamespace(imread=fake_imread),
    )
    monkeypatch.setattr(match_and_export, "batch_recognize", fake_batch_recognize)
    monkeypatch.setattr(match_and_export, "resolve_effect", fake_resolve_effect)

    results = match_and_export.ocr_and_match(
        "dummy.png",
        dictionary=["Dummy"],
        crop_boxes=[(0, 0, 10, 10)],
        upsample=1.0,
        preprocess=False,
    )

    assert captured_paths == ["dummy.png"]
    assert len(results) == 1
    result = results[0]
    assert isinstance(result, MatchResult)
    assert result.raw_text == "dummy text"
    assert result.matched_text == "Resolved"


"""`pipeline.processors` の疎通テスト."""
from __future__ import annotations

import sys
import types
from pathlib import Path
from typing import List, Tuple

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

if "pipeline.extraction" not in sys.modules:
    extraction_stub = types.ModuleType("pipeline.extraction")

    def _stub_extract_and_crop(*_args, **_kwargs):  # pragma: no cover - 実際の呼び出しはモックで上書き
        raise AssertionError("extract_and_crop should be patched in tests")

    extraction_stub.extract_and_crop = _stub_extract_and_crop  # type: ignore[attr-defined]
    sys.modules["pipeline.extraction"] = extraction_stub

import datasets.builder as dataset_builder
import pipeline.processors as processors
import pipeline.tasks as tasks


class DummyReporter:
    """`process_video` の進行通知を収集する簡易レポーター."""

    def __init__(self) -> None:
        self.events: List[Tuple[str, str]] = []
        self.total_steps = 0

    def prepare(self, total_steps: int) -> None:
        self.total_steps = total_steps

    def step(self, message: str) -> None:
        self.events.append(("step", message))

    def advance(self, message: str) -> None:
        self.events.append(("advance", message))


@pytest.fixture
def dummy_reporter() -> DummyReporter:
    return DummyReporter()


def test_process_video_creates_outputs_and_invokes_dependencies(tmp_path: Path, monkeypatch, dummy_reporter: DummyReporter) -> None:
    """フロー全体でディレクトリ生成・依存モジュール呼び出し・戻り値整形が行われることを確認する."""

    video_dir = tmp_path / "videos"
    video_dir.mkdir()
    video_file = video_dir / "emerald_run.mp4"
    video_file.write_text("dummy video")

    result_dir = tmp_path / "results"

    monkeypatch.chdir(tmp_path)
    task = tasks.create_video_task(video_file, result_dir)

    calls: List[Tuple[str, Tuple[str, ...]]] = []

    def fake_extract_and_crop(source: str, *, frame_dir: str, crop_dir: str, save_full_frames: bool) -> None:
        calls.append((
            "extract",
            (source, frame_dir, crop_dir, "full" if save_full_frames else "crops"),
        ))
        Path(frame_dir).mkdir(parents=True, exist_ok=True)
        Path(crop_dir).mkdir(parents=True, exist_ok=True)
        (Path(crop_dir) / "0001.png").write_text("image")

    captured_params: dict[str, object] = {}

    def fake_build_parameters(**kwargs):
        captured_params.update(kwargs)
        return types.SimpleNamespace(
            crop_boxes=[(0, 0, 10, 10)],
            ocr_settings=types.SimpleNamespace(engine=kwargs.get("ocr_engine", "tesseract")),
            export_options=types.SimpleNamespace(
                column_visibility={},
                slot_range=range(1, 2),
                demerit_slots=(),
            ),
            default_matching=types.SimpleNamespace(dictionary=["dummy"]),
            slot_settings={},
            slot_sources={},
            demerit_matching=None,
        )

    def fake_process_images(
        *,
        image_dir: str,
        output_path: str,
        crop_boxes,
        ocr_settings,
        export_options,
        default_matching,
        slot_settings,
        slot_sources,
        demerit_matching,
    ) -> None:
        calls.append((
            "process",
            (
                image_dir,
                output_path,
                f"crops={len(crop_boxes)}",
                f"engine={ocr_settings.engine}",
                f"demerit={bool(export_options.demerit_slots)}",
            ),
        ))
        Path(output_path).write_text("csv")

    monkeypatch.setattr(processors, "extract_and_crop", fake_extract_and_crop)
    monkeypatch.setattr(processors, "build_processing_parameters", fake_build_parameters)
    monkeypatch.setattr(processors, "process_images", fake_process_images)

    overrides = {task.source_path: "green"}
    column_visibility = {"confidence": True}

    entry = processors.process_video(
        task,
        ocr_upsample=2.0,
        ocr_engine="vision",
        gcp_credentials="/path/to/creds.json",
        gcp_credentials_filename="packaged.json",
        override_colors=overrides,
        save_full_frames=True,
        csv_column_visibility=column_visibility,
        reporter=dummy_reporter,
    )

    assert (result_dir / task.base_name / f"{task.base_name}.csv").exists()
    assert dummy_reporter.events[0][0] == "step"
    assert dummy_reporter.events[0][1].endswith("のフレーム抽出中...")
    assert dummy_reporter.events[1][0] == "advance"
    assert dummy_reporter.events[1][1].endswith("のフレーム抽出完了")
    assert dummy_reporter.events[2][0] == "step"
    assert dummy_reporter.events[2][1].endswith("のOCR/マッチング中...")
    assert dummy_reporter.events[3][0] == "advance"
    assert dummy_reporter.events[3][1].endswith("のOCR/マッチング完了")

    assert calls[0][0] == "extract"
    assert calls[0][1][0] == str(task.source_path)
    assert calls[0][1][3] == "full"
    assert calls[1][0] == "process"
    assert calls[1][1][0] == str(task.crops_dir)
    assert "engine=vision" in calls[1][1][3]

    assert captured_params["scale"] == pytest.approx(1.0)
    assert captured_params["upsample"] == pytest.approx(2.0)
    assert captured_params["item_color"] == "green"
    assert captured_params["master_csv_path"].endswith("master_relics.csv")
    assert captured_params["relic_type"] == getattr(task, "relic_type", tasks.DEFAULT_RELIC_TYPE)
    assert captured_params["demerit_master_csv_path"] is None
    assert captured_params["ocr_engine"] == "vision"
    assert captured_params["gcp_credentials"] == "/path/to/creds.json"
    assert captured_params["gcp_credentials_filename"] == "packaged.json"

    assert isinstance(entry, dataset_builder.ProcessedVideoResult)
    assert entry.label == task.base_name
    assert entry.relic_type == "normal"
    assert entry.metadata is None

    assert entry.csv_path == task.csv_path
    assert entry.crops_dir == task.crops_dir
    assert entry.output_dir == task.output_dir

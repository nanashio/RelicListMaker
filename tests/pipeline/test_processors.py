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

if "extract_frames" not in sys.modules:
    extract_stub = types.ModuleType("extract_frames")

    def _stub_extract_and_crop(*_args, **_kwargs):  # pragma: no cover - 実際の呼び出しはモックで上書き
        raise AssertionError("extract_and_crop should be patched in tests")

    extract_stub.extract_and_crop = _stub_extract_and_crop  # type: ignore[attr-defined]
    sys.modules["extract_frames"] = extract_stub

if "match_and_export" not in sys.modules:
    match_stub = types.ModuleType("match_and_export")

    def _stub_process_images(*_args, **_kwargs):  # pragma: no cover - 実際の呼び出しはモックで上書き
        raise AssertionError("process_images should be patched in tests")

    match_stub.process_images = _stub_process_images  # type: ignore[attr-defined]
    sys.modules["match_and_export"] = match_stub

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

    def fake_process_images(
        *,
        image_dir: str,
        output_path: str,
        scale: float,
        upsample: float,
        preprocess: bool,
        corrections_csv: str,
        item_color: str | None,
        column_visibility: dict[str, object] | None,
        master_csv_path: str,
        relic_type: str | None,
    ) -> None:
        calls.append((
            "process",
            (
                image_dir,
                output_path,
                f"scale={scale}",
                f"upsample={upsample}",
                f"color={item_color}",
                master_csv_path,
                f"type={relic_type}",
            ),
        ))
        Path(output_path).write_text("csv")

    monkeypatch.setattr(processors, "extract_and_crop", fake_extract_and_crop)
    monkeypatch.setattr(processors, "process_images", fake_process_images)

    overrides = {task.source_path: "green"}
    column_visibility = {"confidence": True}

    entry = processors.process_video(
        task,
        ocr_upsample=2.0,
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
    assert "upsample=2.0" in calls[1][1][3]
    assert "color=green" in calls[1][1][4]
    assert calls[1][1][5].endswith("master_relics.csv")
    assert calls[1][1][6] == "type=normal"

    expected_rel_csv = Path(entry["csv"])
    expected_rel_img = Path(entry["img_dir"])
    expected_rel_folder = Path(entry["folder"])

    assert expected_rel_csv == Path(task.base_name) / f"{task.base_name}.csv"
    assert expected_rel_img == Path(task.base_name) / "crops"
    assert expected_rel_folder == Path(task.base_name)

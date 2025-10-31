from pathlib import Path
import importlib.util
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[2]
TASKS_PATH = PROJECT_ROOT / "pipeline" / "tasks.py"
_spec = importlib.util.spec_from_file_location("pipeline.tasks", TASKS_PATH)
tasks_mod = importlib.util.module_from_spec(_spec)
assert _spec and _spec.loader  # 型チェック用
sys.modules[_spec.name] = tasks_mod
_spec.loader.exec_module(tasks_mod)


def test_create_tasks_normalizes_paths(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "videos").mkdir()
    video_path = Path("videos/test_video.mp4")

    tasks = tasks_mod.create_tasks([video_path], result_dir="results")

    assert len(tasks) == 1
    task = tasks[0]
    assert task.source_path == (tmp_path / video_path).resolve(strict=False)
    assert task.output_dir == (tmp_path / "results" / "test_video").resolve(strict=False)
    assert task.csv_path == task.output_dir / "test_video.csv"
    assert task.corrections_csv == task.output_dir / "corrections.csv"


def test_decide_item_color_prefers_override(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "videos").mkdir()
    task = tasks_mod.create_tasks(["videos/red_item.mp4"], result_dir="results")[0]

    overrides = {task.source_path: "blue"}
    override_none = {task.source_path: "none"}

    assert tasks_mod.decide_item_color(task, overrides) == "blue"
    assert tasks_mod.decide_item_color(task, override_none) is None


def test_decide_item_color_detects_from_name(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "videos").mkdir()
    task = tasks_mod.create_tasks(["videos/green_item.mp4"], result_dir="results")[0]

    assert tasks_mod.decide_item_color(task, {}) == "green"

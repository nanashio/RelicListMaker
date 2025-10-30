from pathlib import Path
import importlib.util
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[2]
INPUTS_PATH = PROJECT_ROOT / "pipeline" / "inputs.py"
_spec = importlib.util.spec_from_file_location("pipeline.inputs", INPUTS_PATH)
inputs = importlib.util.module_from_spec(_spec)
assert _spec and _spec.loader  # 型チェック用
sys.modules[_spec.name] = inputs
_spec.loader.exec_module(inputs)


def test_gather_video_files_scans_directory(tmp_path, monkeypatch):
    video_dir = tmp_path / "videos"
    video_dir.mkdir()
    (video_dir / "alpha.mp4").write_text("dummy")
    (video_dir / "bravo.AVI").write_text("dummy")
    (video_dir / "ignore.txt").write_text("dummy")

    monkeypatch.chdir(tmp_path)

    files = inputs.gather_video_files("videos", candidates=None)

    expected = [
        (video_dir / "alpha.mp4").resolve(strict=False),
        (video_dir / "bravo.AVI").resolve(strict=False),
    ]
    assert files == expected


def test_gather_video_files_with_candidates(tmp_path, monkeypatch):
    video_dir = tmp_path / "videos"
    video_dir.mkdir()
    local_video = video_dir / "local.mp4"
    local_video.write_text("dummy")

    absolute_video = tmp_path / "absolute.mov"
    absolute_video.write_text("dummy")

    monkeypatch.chdir(tmp_path)

    files = inputs.gather_video_files(
        "videos",
        candidates=["local.mp4", absolute_video],
    )

    assert files == [local_video.resolve(strict=False), absolute_video.resolve(strict=False)]


def test_build_override_map_normalizes_paths(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    overrides = {
        "videos/sample.mp4": "red",
        Path("videos/extra.mkv"): "blue",
    }

    result = inputs.build_override_map(overrides)

    expected_keys = {
        (tmp_path / "videos/sample.mp4").resolve(strict=False),
        (tmp_path / "videos/extra.mkv").resolve(strict=False),
    }
    assert set(result.keys()) == expected_keys
    assert result[(tmp_path / "videos/sample.mp4").resolve(strict=False)] == "red"
    assert result[(tmp_path / "videos/extra.mkv").resolve(strict=False)] == "blue"

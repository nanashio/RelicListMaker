"""`relic_cli.commands.merge_results` の分割ヘルパーをテスト."""

from __future__ import annotations

from pathlib import Path

from relic_cli.commands.merge_results.datasets import DatasetRecord, collect_datasets
from relic_cli.commands.merge_results.images import _copy_image, _resolve_image_path


def test_collect_datasets_ignores_merged_and_invalid_dirs(tmp_path: Path) -> None:
    results_dir = tmp_path / "results"
    results_dir.mkdir()
    (results_dir / "gallery").mkdir()

    # 正常なデータセット
    dataset_a = results_dir / "video_a"
    (dataset_a / "crops").mkdir(parents=True)
    (dataset_a / "video_a.csv").write_text("Image\nvideo_a_00001.png\n", encoding="utf-8")

    # 既存の統合結果 (スキップ対象)
    merged_dir = results_dir / "merged"
    merged_dir.mkdir()
    (merged_dir / "crops").mkdir()
    (merged_dir / "merged.csv").write_text("Image\n", encoding="utf-8")

    # 画像ディレクトリの欠落 (スキップ)
    dataset_b = results_dir / "video_b"
    dataset_b.mkdir()
    (dataset_b / "video_b.csv").write_text("Image\nvideo_b_00001.png\n", encoding="utf-8")

    datasets = collect_datasets(results_dir, "merged")
    assert [record.folder.name for record in datasets] == ["video_a"]


def test_copy_image_and_resolve_path_handles_variants(tmp_path: Path) -> None:
    dataset_dir = tmp_path / "video_c"
    crops_dir = dataset_dir / "crops"
    crops_dir.mkdir(parents=True)
    csv_path = dataset_dir / "video_c.csv"
    csv_path.write_text("Image\n", encoding="utf-8")
    record = DatasetRecord(folder=dataset_dir, csv_path=csv_path, images_dir=crops_dir)

    relative_file = dataset_dir / "shotA.PNG"
    relative_file.write_bytes(b"relative")
    fallback_file = crops_dir / "fallback.jpg"
    fallback_file.write_bytes(b"fallback")

    row_relative = {"Image": "shotA.PNG"}
    resolved_relative = _resolve_image_path(row_relative, record)
    assert resolved_relative == relative_file

    row_fallback = {"Image": "fallback.jpg"}
    resolved_fallback = _resolve_image_path(row_fallback, record)
    assert resolved_fallback == fallback_file

    destination = tmp_path / "merged" / "crops"
    destination.mkdir(parents=True)
    copied_name = _copy_image(fallback_file, destination, "Video C!", 12)
    assert copied_name.startswith("Video_C")
    assert "00012" in copied_name
    assert copied_name.endswith(".jpg")
    assert (destination / copied_name).read_bytes() == b"fallback"

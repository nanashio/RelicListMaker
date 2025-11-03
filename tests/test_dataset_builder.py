"""Tests for datasets.builder utilities."""
from __future__ import annotations

from datasets.builder import ProcessedVideoResult, build_dataset_entries


def test_build_dataset_entries_generates_expected_descriptors(tmp_path):
    base_dir = tmp_path / "results"
    output_dir = base_dir / "alpha"
    crops_dir = output_dir / "crops"
    csv_path = output_dir / "alpha.csv"

    crops_dir.mkdir(parents=True)
    csv_path.write_text("id,label\n", encoding="utf-8")

    result = ProcessedVideoResult(
        label=" Alpha ",
        csv_path=csv_path,
        crops_dir=crops_dir,
        output_dir=output_dir,
        relic_type="normal",
        metadata={
            "kind": "primary",
            "sources": [{"label": "Alpha", "csv": "alpha.csv"}],
            "csv": "ignored.csv",
            "img_dir": "ignored/images",
            "folder": "ignored/folder",
        },
    )

    build = build_dataset_entries(base_dir, [result])

    assert build.active_index == 0
    assert build.default_csv_path == csv_path.resolve()
    assert build.default_img_dir == "alpha/crops"

    dataset = build.datasets[0]
    assert dataset["label"] == "Alpha"
    assert dataset["csv"] == "alpha/alpha.csv"
    assert dataset["img_dir"] == "alpha/crops"
    assert dataset["folder"] == "alpha"
    assert dataset["relic_type"] == "normal"
    assert dataset["kind"] == "primary"
    assert dataset["sources"][0]["csv"] == "alpha.csv"


def test_build_dataset_entries_handles_empty_and_missing_labels(tmp_path):
    base_dir = tmp_path / "results"
    base_dir.mkdir()

    empty_build = build_dataset_entries(base_dir, [])
    assert empty_build.datasets == []
    assert empty_build.active_index == -1
    assert empty_build.default_csv_path == (base_dir / "results.csv").resolve()
    assert empty_build.default_img_dir == ""

    csv_path = base_dir / "beta.csv"
    crops_dir = base_dir / "images"
    output_dir = base_dir / "beta"

    crops_dir.mkdir()
    output_dir.mkdir()
    csv_path.write_text("id,label\n", encoding="utf-8")

    result = ProcessedVideoResult(
        label="",
        csv_path=csv_path,
        crops_dir=crops_dir,
        output_dir=output_dir,
    )

    build = build_dataset_entries(base_dir, [result], default_csv_name="custom.csv")

    dataset = build.datasets[0]
    assert dataset["label"] == "beta"
    assert dataset["csv"] == "beta.csv"
    assert dataset["img_dir"] == "images"
    assert dataset["folder"] == "beta"
    assert "relic_type" not in dataset

    assert build.default_csv_path == csv_path.resolve()
    assert build.default_img_dir == "images"
    assert build.active_index == 0

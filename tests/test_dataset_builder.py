"""Tests for datasets.builder utilities."""
from __future__ import annotations

import html
import json

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


def test_build_dataset_entries_merges_existing_gallery(tmp_path):
    base_dir = tmp_path / "results"
    existing_dir = base_dir / "alpha"
    existing_crops = existing_dir / "crops"
    existing_csv = existing_dir / "alpha.csv"

    existing_crops.mkdir(parents=True)
    existing_csv.write_text("Image\n", encoding="utf-8")

    gallery_dir = base_dir / "gallery"
    gallery_dir.mkdir()

    existing_datasets = [
        {
            "label": "alpha",
            "csv": "../alpha/alpha.csv",
            "imgDir": "../alpha/crops",
            "folder": "alpha",
            "relicType": "normal",
        }
    ]
    gallery_html = (
        "<html><body data-datasets=\""
        + html.escape(json.dumps(existing_datasets, ensure_ascii=False))
        + "\" data-active-dataset=\"0\"></body></html>"
    )
    (gallery_dir / "index.html").write_text(gallery_html, encoding="utf-8")

    new_dir = base_dir / "beta"
    new_crops = new_dir / "crops"
    new_csv = new_dir / "beta.csv"
    new_crops.mkdir(parents=True)
    new_csv.write_text("Image\n", encoding="utf-8")

    new_result = ProcessedVideoResult(
        label="beta",
        csv_path=new_csv,
        crops_dir=new_crops,
        output_dir=new_dir,
        relic_type="normal",
    )

    build = build_dataset_entries(base_dir, [new_result])

    assert build.active_index == 1
    assert build.default_csv_path == new_csv.resolve()
    assert build.default_img_dir == "beta/crops"

    assert [entry["label"] for entry in build.datasets] == ["alpha", "beta"]
    assert build.datasets[0]["csv"] == "alpha/alpha.csv"
    assert build.datasets[1]["csv"] == "beta/beta.csv"

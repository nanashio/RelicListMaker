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


def test_build_dataset_entries_prefers_bootstrap_json(tmp_path):
    base_dir = tmp_path / "results"
    gallery_dir = base_dir / "gallery"
    gallery_dir.mkdir(parents=True)

    alpha_dir = base_dir / "alpha"
    alpha_csv = alpha_dir / "alpha.csv"
    alpha_crops = alpha_dir / "crops"
    alpha_crops.mkdir(parents=True)
    alpha_csv.write_text("Image\n", encoding="utf-8")

    beta_dir = base_dir / "beta"
    beta_csv = beta_dir / "beta.csv"
    beta_crops = beta_dir / "crops"
    beta_crops.mkdir(parents=True)
    beta_csv.write_text("Image\n", encoding="utf-8")

    index_datasets = [
        {
            "label": "alpha",
            "csv": "../alpha/alpha.csv",
            "imgDir": "../alpha/crops",
            "folder": "alpha",
        },
        {
            "label": "beta",
            "csv": "../beta/beta.csv",
            "imgDir": "../beta/crops",
            "folder": "beta",
        },
    ]
    gallery_html = (
        "<html><body data-datasets=\""
        + html.escape(json.dumps(index_datasets, ensure_ascii=False))
        + "\" data-active-dataset=\"1\"></body></html>"
    )
    (gallery_dir / "index.html").write_text(gallery_html, encoding="utf-8")

    bootstrap_data = {
        "datasets": [
            {
                "label": "beta",
                "csv": "../beta/beta.csv",
                "imgDir": "../beta/crops",
                "folder": "beta",
            }
        ],
        "activeDataset": 0,
    }
    (gallery_dir / "gallery_data.json").write_text(
        json.dumps(bootstrap_data, ensure_ascii=False), encoding="utf-8"
    )

    build = build_dataset_entries(base_dir, [])

    assert build.active_index == 0
    assert build.default_csv_path == beta_csv.resolve()
    assert build.default_img_dir == "beta/crops"
    assert [entry["label"] for entry in build.datasets] == ["beta"]


def test_build_dataset_entries_keep_base_relative_paths(tmp_path):
    base_dir = tmp_path / "results"
    gallery_dir = base_dir / "gallery"
    gallery_dir.mkdir(parents=True)

    alpha_dir = base_dir / "alpha"
    alpha_csv = alpha_dir / "alpha.csv"
    alpha_crops = alpha_dir / "crops"

    alpha_crops.mkdir(parents=True)
    alpha_csv.write_text("Image\n", encoding="utf-8")

    bootstrap_data = {
        "datasets": [
            {
                "label": "alpha",
                "csv": "alpha/alpha.csv",
                "imgDir": "alpha/crops",
                "folder": "alpha",
            }
        ],
        "activeDataset": 0,
    }
    (gallery_dir / "gallery_data.json").write_text(
        json.dumps(bootstrap_data, ensure_ascii=False), encoding="utf-8"
    )

    build = build_dataset_entries(base_dir, [])

    assert build.active_index == 0
    assert build.default_csv_path == alpha_csv.resolve()
    assert build.default_img_dir == "alpha/crops"
    assert build.datasets[0]["csv"] == "alpha/alpha.csv"
    assert build.datasets[0]["img_dir"] == "alpha/crops"

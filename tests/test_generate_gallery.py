import html
import json
import os
import sys
from pathlib import Path

import pytest

sys.path.append(str(Path(__file__).resolve().parents[1]))

import generate_gallery


def test_copy_gallery_modules_copies_required_viewer_scripts(tmp_path):
    """`generate_gallery` が効果ビューの必須モジュールをコピーすることを検証する."""
    output_dir = tmp_path / "viewer"

    generate_gallery._copy_gallery_modules(str(output_dir))

    expected_files = [
        Path("gallery/render/effectViewModel.js"),
        Path("gallery/utils/filter.js"),
    ]

    for relative_path in expected_files:
        copied_file = output_dir / relative_path
        assert copied_file.is_file(), f"{copied_file} が出力されていません"


def test_normalize_dataset_entries_accepts_various_shapes(tmp_path):
    output_dir = tmp_path / "out"
    output_dir.mkdir()
    absolute_csv = tmp_path / "abs" / "effects.csv"
    absolute_csv.parent.mkdir()
    absolute_csv.write_text("id,label\n", encoding="utf-8")
    absolute_img = tmp_path / "abs" / "images"

    datasets = [
        {
            "csv": str(absolute_csv),
            "imgDir": str(absolute_img),
            "name": " 絶対パス ",
            "kind": "primary",
            "sources": ["ignored"],
        },
        ("rel/results.csv", "rel/images", "  タプル "),
        "bare.csv",
        {"results_csv": "nested/data.csv"},
        None,
    ]

    normalized = generate_gallery._normalize_dataset_entries(datasets, str(output_dir))

    assert [entry["label"] for entry in normalized] == [
        "絶対パス",
        "タプル",
        "bare",
        "nested",
    ]
    assert normalized[0]["csv"].endswith("abs/effects.csv")
    assert normalized[0]["imgDir"].endswith("abs/images")
    assert normalized[0]["kind"] == "primary"
    assert normalized[0]["sources"] == ["ignored"]
    assert normalized[1]["csv"] == "rel/results.csv"
    assert normalized[2]["csv"] == "bare.csv"
    assert normalized[3]["folder"] == "nested"


def test_copy_static_asset_with_subdirectory_and_missing_override(tmp_path):
    source = tmp_path / "templates" / "base.css"
    source.parent.mkdir()
    source.write_text("body{}", encoding="utf-8")
    output_dir = tmp_path / "dist"
    output_dir.mkdir()

    relative, copied = generate_gallery._copy_static_asset(
        str(source),
        str(output_dir),
        target_relative_path="styles/main.css",
    )

    assert relative == "styles/main.css"
    assert Path(copied).read_text(encoding="utf-8") == "body{}"

    with pytest.raises(FileNotFoundError):
        generate_gallery._copy_static_asset(
            str(source),
            str(output_dir),
            override=str(source.parent / "missing.css"),
        )


def test_generate_html_injects_merged_dataset_and_cache_busters(monkeypatch, tmp_path):
    results_csv = tmp_path / "results.csv"
    results_csv.write_text("id,label\n", encoding="utf-8")
    img_dir = tmp_path / "images"
    img_dir.mkdir()
    output_html = tmp_path / "viewer" / "index.html"

    template = (
        "__RESULTS_CSV__\n"
        "__IMAGE_DIR__\n"
        "__LABEL_SYMBOLS__\n"
        "__MASTER_CSV__\n"
        "__MASTER_JSON__\n"
        "__MASTER_OPTIONS__\n"
        "__MASTER_LEVELS__\n"
        "__CSS_FILE__\n"
        "__JS_FILE__\n"
        "__DATASETS__\n"
        "__ACTIVE_DATASET__"
    )

    monkeypatch.setattr(generate_gallery, "_load_text_asset", lambda *args, **kwargs: template)

    def fake_copy_static_asset(default_path, output_dir, override=None, target_relative_path=None):
        target_name = target_relative_path or Path(default_path).name
        destination = tmp_path / "copied" / target_name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text("/* asset */", encoding="utf-8")
        return target_name.replace(os.sep, "/"), str(destination)

    monkeypatch.setattr(generate_gallery, "_copy_static_asset", fake_copy_static_asset)
    monkeypatch.setattr(generate_gallery, "_copy_gallery_modules", lambda output_dir: None)
    monkeypatch.setattr(generate_gallery, "load_master_csv", lambda path: [])
    monkeypatch.setattr(generate_gallery, "load_master_json", lambda path: {})
    monkeypatch.setattr(generate_gallery, "load_master_effects_and_levels", lambda path: ({}, {}))
    monkeypatch.setattr(generate_gallery, "normalize_master_values", lambda values: ["A", "B"])

    datasets = [
        {"csv": "a/results.csv", "imgDir": "a/images", "label": "A"},
        {"csv": "b/results.csv", "imgDir": "b/images", "label": "B"},
    ]

    generate_gallery.generate_html(
        str(results_csv),
        str(img_dir),
        str(output_html),
        label_symbols=["★"],
        master_options=["A"],
        datasets=datasets,
        active_dataset_index=0,
        css_output_name="styles/app.css",
        js_output_name="scripts/app.js",
    )

    html_output = output_html.read_text(encoding="utf-8")
    parts = html_output.splitlines()
    assert parts[0] == "a/results.csv"
    assert parts[1] == "a/images"
    assert "★" in html.unescape(parts[2])
    assert "A" in html.unescape(parts[5])
    datasets_json = json.loads(html.unescape(parts[9]))
    assert datasets_json[0]["label"] == "全データセット（統合）"
    assert datasets_json[0]["kind"] == "merged"
    assert datasets_json[0]["sources"][0]["label"] == "A"
    assert json.loads(parts[10]) == 1
    assert "?v=" in parts[7]
    assert "?v=" in parts[8]

import html
import json
import os
import sys
from pathlib import Path

import pytest

sys.path.append(str(Path(__file__).resolve().parents[1]))

import gallery_assets
from gallery_assets import GalleryAssets, PreparedAsset
import generate_gallery
from resource_paths import templates_path


def test_copy_gallery_modules_copies_required_viewer_scripts(tmp_path):
    """`generate_gallery` が効果ビューの必須モジュールをコピーすることを検証する."""
    output_dir = tmp_path / "viewer"

    gallery_assets.copy_gallery_modules(str(output_dir))

    expected_files = [
        Path("render/effectViewModel.js"),
        Path("utils/filter.js"),
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


def test_normalize_dataset_entries_resolves_different_base_dir(tmp_path):
    root_dir = tmp_path / "results"
    gallery_dir = root_dir / "gallery"
    video_dir = root_dir / "video_a"
    gallery_dir.mkdir(parents=True)
    (video_dir / "crops").mkdir(parents=True)
    csv_path = video_dir / "results.csv"
    csv_path.write_text("id,label\n", encoding="utf-8")

    datasets = [
        {"csv": "video_a/results.csv", "imgDir": "video_a/crops", "label": "Video A"},
    ]

    normalized = generate_gallery._normalize_dataset_entries(
        datasets,
        str(gallery_dir),
        base_dir=str(root_dir),
    )

    assert normalized[0]["csv"] == "../video_a/results.csv"
    assert normalized[0]["imgDir"] == "../video_a/crops"


def test_copy_static_asset_with_subdirectory_and_missing_override(tmp_path):
    source = tmp_path / "templates" / "base.css"
    source.parent.mkdir()
    source.write_text("body{}", encoding="utf-8")
    output_dir = tmp_path / "dist"
    output_dir.mkdir()

    asset = gallery_assets.copy_static_asset(
        str(source),
        str(output_dir),
        target_relative_path="styles/main.css",
    )

    assert asset.relative_path == "styles/main.css"
    assert asset.absolute_path is not None
    assert Path(asset.absolute_path).read_text(encoding="utf-8") == "body{}"

    with pytest.raises(FileNotFoundError):
        gallery_assets.copy_static_asset(
            str(source),
            str(output_dir),
            override_template=str(source.parent / "missing.css"),
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
        "__MASTER_OPTIONS_MAP__\n"
        "__MASTER_LEVELS__\n"
        "__MASTER_LEVELS_BY_TYPE__\n"
        "__MASTER_CSV_MAP__\n"
        "__MASTER_DEMERIT_CSV__\n"
        "__MASTER_DEMERIT_JSON__\n"
        "__MASTER_DEMERIT_OPTIONS__\n"
        "__MASTER_DEMERIT_OPTIONS_MAP__\n"
        "__MASTER_DEMERIT_CSV_MAP__\n"
        "__CSS_FILE__\n"
        "__JS_FILE__\n"
        "__CORE_JS__\n"
        "__DATASETS__\n"
        "__ACTIVE_DATASET__\n"
        "__ITEM_IMAGE_VIEW_BOX__\n"
        "__ITEM_IMAGE_VIEW_BOX__"
    )

    monkeypatch.setattr(generate_gallery, "_load_text_asset", lambda *args, **kwargs: template)

    def fake_prepare_gallery_assets(*args, **kwargs):
        base = tmp_path / "copied"
        css_path = base / "styles" / "app.css"
        index_path = base / "index.js"
        core_path = base / "scripts" / "app.js"
        for file_path in (css_path, index_path, core_path):
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_text("/* asset */", encoding="utf-8")
        return GalleryAssets(
            css=PreparedAsset("styles/app.css", str(css_path)),
            index_js=PreparedAsset("index.js", str(index_path)),
            core_js=PreparedAsset("scripts/app.js", str(core_path)),
        )

    monkeypatch.setattr(generate_gallery.gallery_assets, "prepare_gallery_assets", fake_prepare_gallery_assets)
    monkeypatch.setattr(generate_gallery, "load_master_csv", lambda path: [])
    monkeypatch.setattr(generate_gallery, "load_master_json", lambda path: {})
    monkeypatch.setattr(generate_gallery, "load_master_effects_and_levels", lambda path: ([], {}))
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
    assert json.loads(html.unescape(parts[6])) == {}
    assert parts[10].endswith('master_relics_demerit.csv')
    assert parts[11] == ''
    assert isinstance(json.loads(html.unescape(parts[12])), list)
    assert json.loads(html.unescape(parts[13])) == {}
    demerit_csv_map = json.loads(html.unescape(parts[14]))
    assert "deep" in demerit_csv_map
    assert demerit_csv_map["deep"].endswith('master_relics_demerit.csv')
    datasets_json = json.loads(html.unescape(parts[18]))
    assert datasets_json[0]["label"] == "全データセット（統合）"
    assert datasets_json[0]["kind"] == "merged"
    assert datasets_json[0]["sources"][0]["label"] == "A"
    assert json.loads(parts[19]) == 1


def test_generate_html_sanitizes_inputs_and_embeds_master_data(monkeypatch, tmp_path):
    results_csv = tmp_path / "results.csv"
    results_csv.write_text("id,label\n", encoding="utf-8")
    img_dir = tmp_path / "images"
    img_dir.mkdir()
    output_html = tmp_path / "viewer" / "index.html"

    master_csv = tmp_path / "master.csv"
    master_csv.write_text(
        "EffectBase,Levels\nMystic Strike,\"Alpha, Beta\"\n,\n",
        encoding="utf-8",
    )

    master_json = tmp_path / "master.json"
    master_json.write_text(
        json.dumps([{"EffectBase": "Night Sun"}, "  Mystic Strike  "]),
        encoding="utf-8",
    )

    template = "\n".join(
        [
            "__RESULTS_CSV__",
            "__IMAGE_DIR__",
            "__LABEL_SYMBOLS__",
            "__MASTER_CSV__",
            "__MASTER_JSON__",
            "__MASTER_OPTIONS__",
            "__MASTER_OPTIONS_MAP__",
            "__MASTER_LEVELS__",
            "__MASTER_LEVELS_BY_TYPE__",
            "__MASTER_CSV_MAP__",
            "__MASTER_DEMERIT_CSV__",
            "__MASTER_DEMERIT_JSON__",
                "__MASTER_DEMERIT_OPTIONS__",
                "__MASTER_DEMERIT_OPTIONS_MAP__",
                "__MASTER_DEMERIT_CSV_MAP__",
                "__MASTER_DEMERIT_RULES_MAP__",
                "__CSS_FILE__",
                "__JS_FILE__",
                "__CORE_JS__",
                "__DATASETS__",
            "__ACTIVE_DATASET__",
            "__ITEM_IMAGE_VIEW_BOX__",
        ]
    )

    monkeypatch.setattr(generate_gallery, "_load_text_asset", lambda *args, **kwargs: template)

    copied_assets = []

    def fake_prepare_gallery_assets(*args, **kwargs):
        base = tmp_path / "copied"
        css_path = base / "gallery.css"
        index_path = base / "index.js"
        core_path = base / "gallery.js"
        for file_path in (css_path, index_path, core_path):
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_text("/* asset */", encoding="utf-8")
        copied_assets.append(css_path.name)
        return GalleryAssets(
            css=PreparedAsset("gallery.css", str(css_path)),
            index_js=PreparedAsset("index.js", str(index_path)),
            core_js=PreparedAsset("gallery.js", str(core_path)),
        )

    monkeypatch.setattr(generate_gallery.gallery_assets, "prepare_gallery_assets", fake_prepare_gallery_assets)

    def fake_load_master_effects_and_levels(path):
        candidate = Path(path)
        if candidate.resolve() == master_csv.resolve():
            return (["Mystic Strike"], {"Mystic Strike": ["Alpha", "Beta"]})
        basename = candidate.name
        if basename == "master_relics.csv":
            return (["Default Effect"], {"Default Effect": ["F1"]})
        if basename == "master_relics_deep.csv":
            return (["Deep Effect"], {"Deep Effect": ["D1"]})
        if basename == "master_relics_demerit.csv":
            return (["Deep Demerit"], {})
        return ([], {})

    monkeypatch.setattr(generate_gallery, "load_master_effects_and_levels", fake_load_master_effects_and_levels)

    datasets = [
        {"csv": "a/results.csv", "imgDir": "a/images", "label": "A"},
    ]

    generate_gallery.generate_html(
        str(results_csv),
        str(img_dir),
        str(output_html),
        label_symbols=[None, "", "◇", "<b>", 123],
        master_csv_path=str(master_csv),
        master_json_path=str(master_json),
        datasets=datasets,
        item_image_view_box="<script>alert(1)</script>",
    )

    html_output = output_html.read_text(encoding="utf-8")
    parts = html_output.splitlines()

    assert json.loads(html.unescape(parts[2])) == ["◇", "<b>", "123"]
    expected_master_csv_rel = os.path.relpath(master_csv, output_html.parent)
    expected_master_json_rel = os.path.relpath(master_json, output_html.parent)
    assert parts[3] == html.escape(expected_master_csv_rel, quote=True)
    assert parts[4] == html.escape(expected_master_json_rel, quote=True)
    assert json.loads(html.unescape(parts[5])) == []
    master_options_map = json.loads(html.unescape(parts[6]))
    assert master_options_map == {
        "deep": ["Deep Effect"],
        "normal": ["Default Effect"],
    }
    master_levels = json.loads(html.unescape(parts[7]))
    assert master_levels.get("Mystic Strike") == ["Alpha", "Beta"]
    assert master_levels.get("Default Effect") == ["F1"]
    assert master_levels.get("Deep Effect") == ["D1"]
    master_levels_by_type = json.loads(html.unescape(parts[8]))
    assert master_levels_by_type == {
        "deep": {"Deep Effect": ["D1"]},
        "normal": {"Default Effect": ["F1"]},
    }
    assert parts[10].endswith('master_relics_demerit.csv')
    assert parts[11] == ''
    demerit_options = json.loads(html.unescape(parts[12]))
    assert isinstance(demerit_options, list)
    assert len(demerit_options) > 0
    master_demerit_map = json.loads(html.unescape(parts[13]))
    assert "deep" in master_demerit_map
    assert isinstance(master_demerit_map["deep"], list)
    assert len(master_demerit_map["deep"]) > 0
    master_demerit_csv_map = json.loads(html.unescape(parts[14]))
    assert "deep" in master_demerit_csv_map
    assert master_demerit_csv_map["deep"].endswith('master_relics_demerit.csv')
    master_demerit_rules_map = json.loads(html.unescape(parts[15]))
    assert "deep" in master_demerit_rules_map
    assert isinstance(master_demerit_rules_map["deep"], dict)
    assert parts[21] == html.escape(generate_gallery.DEFAULT_ITEM_IMAGE_VIEW_BOX, quote=True)
    assert copied_assets.count("gallery.css") == 1


def test_generate_html_embeds_known_master_types(monkeypatch, tmp_path):
    results_csv = tmp_path / "results.csv"
    results_csv.write_text("id,label\n", encoding="utf-8")
    output_html = tmp_path / "viewer" / "index.html"

    template = "\n".join(
        [
            "__MASTER_OPTIONS__",
            "__MASTER_OPTIONS_MAP__",
            "__MASTER_LEVELS__",
            "__MASTER_LEVELS_BY_TYPE__",
            "__MASTER_CSV_MAP__",
            "__MASTER_DEMERIT_OPTIONS__",
            "__MASTER_DEMERIT_OPTIONS_MAP__",
            "__MASTER_DEMERIT_CSV_MAP__",
            "__MASTER_DEMERIT_RULES_MAP__",
        ]
    )

    monkeypatch.setattr(generate_gallery, "_load_text_asset", lambda *args, **kwargs: template)
    def fake_prepare_gallery_assets(*args, **kwargs):
        base = tmp_path / "copied"
        css_path = base / "gallery.css"
        index_path = base / "index.js"
        core_path = base / "gallery.js"
        for file_path in (css_path, index_path, core_path):
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_text("/* asset */", encoding="utf-8")
        return GalleryAssets(
            css=PreparedAsset("gallery.css", str(css_path)),
            index_js=PreparedAsset("index.js", str(index_path)),
            core_js=PreparedAsset("gallery.js", str(core_path)),
        )

    monkeypatch.setattr(generate_gallery.gallery_assets, "prepare_gallery_assets", fake_prepare_gallery_assets)
    monkeypatch.setattr(generate_gallery, "load_master_csv", lambda path: [])
    monkeypatch.setattr(generate_gallery, "load_master_json", lambda path: [])

    loaded_paths = []

    def fake_load_master_effects_and_levels(path):
        basename = os.path.basename(path)
        loaded_paths.append(basename)
        if basename == "master_relics.csv":
            return (["Normal Effect"], {"Normal Effect": ["N1"]})
        if basename == "master_relics_deep.csv":
            return (["Deep Effect"], {"Deep Effect": ["D1"]})
        return ([], {})

    monkeypatch.setattr(generate_gallery, "load_master_effects_and_levels", fake_load_master_effects_and_levels)

    generate_gallery.generate_html(
        str(results_csv),
        "images",
        str(output_html),
        datasets=[{"csv": "results.csv", "imgDir": "images", "label": "A"}],
    )

    html_output = output_html.read_text(encoding="utf-8")
    parts = [html.unescape(part) for part in html_output.splitlines()]

    assert json.loads(parts[0]) == ["Normal Effect", "Deep Effect"]

    options_map = json.loads(parts[1])
    assert set(options_map.keys()) == {"normal", "deep"}
    assert options_map["normal"] == ["Normal Effect"]
    assert options_map["deep"] == ["Deep Effect"]

    levels_map = json.loads(parts[2])
    assert levels_map == {
        "Normal Effect": ["N1"],
        "Deep Effect": ["D1"],
    }

    levels_by_type = json.loads(parts[3])
    assert levels_by_type == {
        "deep": {"Deep Effect": ["D1"]},
        "normal": {"Normal Effect": ["N1"]},
    }

    csv_map = json.loads(parts[4])
    assert set(csv_map.keys()) == {"normal", "deep"}
    assert csv_map["normal"].endswith("master_relics.csv")
    assert csv_map["deep"].endswith("master_relics_deep.csv")

    assert json.loads(parts[5]) == []
    assert json.loads(parts[6]) == {}
    demerit_csv_map = json.loads(parts[7])
    assert demerit_csv_map == {
        "deep": os.path.relpath(
            templates_path("master_relics_demerit.csv"),
            output_html.parent,
        ).replace(os.sep, "/"),
    }

    assert "master_relics.csv" in loaded_paths
    assert "master_relics_deep.csv" in loaded_paths


def test_generate_html_resolves_dataset_base_dir(monkeypatch, tmp_path):
    root_dir = tmp_path / "results"
    gallery_dir = root_dir / "gallery"
    video_dir = root_dir / "video_a"
    crops_dir = video_dir / "crops"
    gallery_dir.mkdir(parents=True)
    crops_dir.mkdir(parents=True)

    results_csv = video_dir / "results.csv"
    results_csv.write_text("id,label\n", encoding="utf-8")

    template = "__RESULTS_CSV__\n__IMAGE_DIR__\n__DATASETS__"
    monkeypatch.setattr(generate_gallery, "_load_text_asset", lambda *args, **kwargs: template)

    def fake_prepare_gallery_assets(*args, **kwargs):
        base = tmp_path / "assets"
        css_path = base / "gallery.css"
        index_path = base / "index.js"
        core_path = base / "gallery.js"
        for file_path in (css_path, index_path, core_path):
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_text("", encoding="utf-8")
        return GalleryAssets(
            css=PreparedAsset("gallery.css", str(css_path)),
            index_js=PreparedAsset("index.js", str(index_path)),
            core_js=PreparedAsset("gallery.js", str(core_path)),
        )

    monkeypatch.setattr(generate_gallery.gallery_assets, "prepare_gallery_assets", fake_prepare_gallery_assets)
    monkeypatch.setattr(generate_gallery, "load_master_csv", lambda *args, **kwargs: [])
    monkeypatch.setattr(generate_gallery, "load_master_json", lambda *args, **kwargs: {})
    monkeypatch.setattr(generate_gallery, "load_master_effects_and_levels", lambda *args, **kwargs: ([], {}))
    monkeypatch.setattr(generate_gallery, "normalize_master_values", lambda values: list(values or []))

    datasets = [
        {"csv": "video_a/results.csv", "imgDir": "video_a/crops", "label": "Video A"},
    ]

    output_html = gallery_dir / "index.html"
    generate_gallery.generate_html(
        str(results_csv),
        "video_a/crops",
        str(output_html),
        datasets=datasets,
        datasets_base_dir=str(root_dir),
    )

    parts = output_html.read_text(encoding="utf-8").splitlines()
    assert parts[0] == "../video_a/results.csv"
    assert parts[1] == "../video_a/crops"
    datasets_payload = json.loads(html.unescape(parts[2]))
    assert datasets_payload[0]["csv"] == "../video_a/results.csv"
    assert datasets_payload[0]["imgDir"] == "../video_a/crops"


def test_generate_html_respects_asset_overrides(monkeypatch, tmp_path):
    results_csv = tmp_path / "results.csv"
    results_csv.write_text("id,label\n", encoding="utf-8")
    img_dir = tmp_path / "images"
    img_dir.mkdir()
    output_html = tmp_path / "viewer" / "index.html"

    template = "\n".join(
        [
            "__CSS_FILE__",
            "__JS_FILE__",
            "__CORE_JS__",
        ]
    )

    monkeypatch.setattr(generate_gallery, "_load_text_asset", lambda *args, **kwargs: template)

    copied_assets = []

    def fake_prepare_gallery_assets(output_dir, **kwargs):
        base = tmp_path / "copied"
        index_path = base / "gallery" / "index.js"
        index_path.parent.mkdir(parents=True, exist_ok=True)
        index_path.write_text("/* index */", encoding="utf-8")
        copied_assets.append("index.js")

        css_override = kwargs.get("css_relative_override")
        if css_override is not None:
            css_asset = PreparedAsset(css_override, None)
        else:
            css_path = base / "gallery.css"
            css_path.parent.mkdir(parents=True, exist_ok=True)
            css_path.write_text("/* css */", encoding="utf-8")
            css_asset = PreparedAsset("gallery.css", str(css_path))

        core_override = kwargs.get("core_relative_override")
        if core_override is not None:
            normalized_core = core_override.replace("\\", "/")
            core_path = (Path(output_dir) / core_override).resolve()
            core_asset = PreparedAsset(normalized_core, str(core_path))
        else:
            core_path = base / "gallery.js"
            core_path.parent.mkdir(parents=True, exist_ok=True)
            core_path.write_text("/* core */", encoding="utf-8")
            core_asset = PreparedAsset("gallery.js", str(core_path))

        return GalleryAssets(
            css=css_asset,
            index_js=PreparedAsset("index.js", str(index_path)),
            core_js=core_asset,
        )

    monkeypatch.setattr(generate_gallery.gallery_assets, "prepare_gallery_assets", fake_prepare_gallery_assets)

    custom_core = output_html.parent / "custom" / "core.js"
    custom_core.parent.mkdir(parents=True, exist_ok=True)
    custom_core.write_text("console.log('core');", encoding="utf-8")

    generate_gallery.generate_html(
        str(results_csv),
        str(img_dir),
        str(output_html),
        css_relative_override="https://cdn.example.com/viewer.css",
        js_relative_override="custom/core.js",
    )

    html_output = output_html.read_text(encoding="utf-8")
    parts = html_output.splitlines()

    assert parts[0] == "https://cdn.example.com/viewer.css"
    assert copied_assets == ["index.js"]

    index_reference = parts[1]
    assert index_reference.startswith("index.js?v=")

    expected_core_rel = "custom/core.js"
    expected_version = str(int(os.path.getmtime(custom_core)))
    assert parts[2] == f"{expected_core_rel}?v={expected_version}"

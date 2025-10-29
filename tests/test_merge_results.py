import csv
import html
import json
import sys
import re
from pathlib import Path

import pytest

sys.path.append(str(Path(__file__).resolve().parents[1]))

from generate_gallery import DEFAULT_ITEM_IMAGE_VIEW_BOX
from merge_results import MERGED_CSV_NAME, MERGED_DIR_NAME, merge_results, _is_duplicate


def _write_csv(path: Path, header: list[str], rows: list[list[str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(header)
        writer.writerows(rows)


@pytest.fixture
def sample_results(tmp_path: Path) -> Path:
    results_dir = tmp_path / "results"
    (results_dir).mkdir(parents=True, exist_ok=True)
    (results_dir / "gallery.css").write_text("body { background: #fff; }", encoding="utf-8")
    (results_dir / "gallery.js").write_text("console.log('stub');", encoding="utf-8")

    # dataset 1: 2 images, one marked duplicate
    dataset1 = results_dir / "video_a"
    (dataset1 / "crops").mkdir(parents=True)
    (dataset1 / "crops" / "frame001.png").write_bytes(b"frame001")
    (dataset1 / "crops" / "frame002.png").write_bytes(b"frame002")
    _write_csv(
        dataset1 / "video_a.csv",
        [
            "Image",
            "Duplicate",
            "ItemColor",
            "RawText1",
            "Effect1",
            "Effect1Status",
        ],
        [
            ["frame001.png", "False", "red", "text1", "effect1", "pass"],
            ["frame002.png", "True", "red", "text2", "effect2", "pass"],
        ],
    )

    # dataset 2: single non-duplicate
    dataset2 = results_dir / "video_b"
    (dataset2 / "crops").mkdir(parents=True)
    (dataset2 / "crops" / "shot001.png").write_bytes(b"shot001")
    _write_csv(
        dataset2 / "video_b.csv",
        [
            "Image",
            "Duplicate",
            "ItemColor",
            "RawText1",
            "Effect1",
            "Effect1Status",
        ],
        [["shot001.png", "", "blue", "text3", "effect3", "pass"]],
    )

    # dataset 3: pending review, should be filtered out by default
    dataset3 = results_dir / "video_c"
    (dataset3 / "crops").mkdir(parents=True)
    (dataset3 / "crops" / "clip001.png").write_bytes(b"clip001")
    _write_csv(
        dataset3 / "video_c.csv",
        [
            "Image",
            "Duplicate",
            "ItemColor",
            "RawText1",
            "Effect1",
            "Effect1Status",
        ],
        [["clip001.png", "False", "green", "text4", "effect4", "pending"]],
    )

    return results_dir


def test_merge_results_filters_duplicates_and_copies_images(sample_results: Path) -> None:
    merged_dir = merge_results(sample_results)

    assert merged_dir.name == MERGED_DIR_NAME
    merged_csv = merged_dir / MERGED_CSV_NAME
    assert merged_csv.exists()

    with merged_csv.open("r", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)

    assert len(rows) == 2
    datasets = {row["Dataset"] for row in rows}
    assert datasets == {"video_a", "video_b"}

    duplicate_flags = {row.get("Duplicate") for row in rows}
    assert duplicate_flags == {"False"}

    copied_images = sorted((merged_dir / "crops").iterdir())
    assert len(copied_images) == 2
    for image_path in copied_images:
        assert image_path.is_file()

    viewer_html = sample_results / "viewer.html"
    assert viewer_html.exists()
    html_text = viewer_html.read_text(encoding="utf-8")
    assert f"--item-image-view-box: {DEFAULT_ITEM_IMAGE_VIEW_BOX};" in html_text
    assert 'data-default-item-image-view-box="' in html_text
    assert 'id="viewbox-top"' in html_text
    assert 'id="viewbox-left"' in html_text
    assert 'id="viewbox-height"' in html_text
    assert 'id="viewbox-width"' in html_text
    match = re.search(r'data-datasets="([^"]*)"', html_text)
    assert match is not None
    datasets_json = html.unescape(match.group(1))
    datasets = json.loads(datasets_json)
    merged_entry = next((entry for entry in datasets if entry.get("kind") == "merged_csv"), None)
    assert merged_entry is not None
    assert merged_entry["csv"] == "merged/merged.csv"
    assert any(entry.get("folder") == "video_a" for entry in datasets if entry is not merged_entry)
    assert 'data-master-options="[]"' not in html_text
    assert not (merged_dir / "gallery.css").exists()
    assert not (merged_dir / "gallery.js").exists()
    assert not (merged_dir / "merged_viewer.html").exists()


def test_merge_results_creates_unique_directory_when_existing(sample_results: Path) -> None:
    first_dir = merge_results(sample_results)
    assert first_dir.name == MERGED_DIR_NAME
    first_csv = first_dir / MERGED_CSV_NAME
    assert first_csv.exists()

    second_dir = merge_results(sample_results)
    assert second_dir.exists()
    assert second_dir.name != first_dir.name
    assert second_dir.name.startswith(f"{MERGED_DIR_NAME}_")
    assert (second_dir / MERGED_CSV_NAME).exists()
    assert first_csv.exists()

    viewer_html = sample_results / "viewer.html"
    html_text = viewer_html.read_text(encoding="utf-8")
    match = re.search(r'data-datasets="([^"]*)"', html_text)
    assert match is not None
    datasets_json = html.unescape(match.group(1))
    datasets = json.loads(datasets_json)
    merged_entries = [entry for entry in datasets if entry.get("kind") == "merged_csv"]
    assert len(merged_entries) >= 2
    base_csv = f"{MERGED_DIR_NAME}/{MERGED_CSV_NAME}"
    assert any(entry.get("csv") == base_csv for entry in merged_entries)

    expected_csv = f"{second_dir.name}/{MERGED_CSV_NAME}"
    new_entry = next((entry for entry in merged_entries if entry.get("folder") == second_dir.name), None)
    assert new_entry is not None
    assert new_entry["csv"] == expected_csv


def test_merge_results_can_include_pending_when_option_disabled(sample_results: Path) -> None:
    merged_dir = merge_results(sample_results, only_reviewed=False)

    merged_csv = merged_dir / MERGED_CSV_NAME
    with merged_csv.open("r", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)

    assert len(rows) == 3
    datasets = {row["Dataset"] for row in rows}
    assert datasets == {"video_a", "video_b", "video_c"}


def test_merge_results_applies_custom_view_box(sample_results: Path) -> None:
    custom_view_box = "inset(4px 8px 12px 16px)"
    merge_results(sample_results, item_image_view_box=custom_view_box)

    html_text = (sample_results / "viewer.html").read_text(encoding="utf-8")
    assert f"--item-image-view-box: {custom_view_box};" in html_text


def test_merge_results_with_real_dataset(sample_results_dir: Path) -> None:
    dataset_dir = sample_results_dir / "1080p_red"
    csv_path = dataset_dir / "1080p_red.csv"
    if not csv_path.exists():
        pytest.skip("sample dataset '1080p_red' is not available")
    with csv_path.open("r", encoding="utf-8") as handle:
        base_rows = list(csv.DictReader(handle))

    assert base_rows

    expected_count = sum(1 for row in base_rows if not _is_duplicate(row.get("Duplicate")))

    merged_dir = merge_results(sample_results_dir, only_reviewed=False)
    merged_csv = merged_dir / MERGED_CSV_NAME
    assert merged_csv.exists()

    with merged_csv.open("r", encoding="utf-8") as handle:
        merged_rows = list(csv.DictReader(handle))

    assert merged_rows
    assert len(merged_rows) == expected_count

    first_row = merged_rows[0]
    assert first_row["Dataset"] == "1080p_red"
    assert first_row["DatasetFolder"] == "1080p_red"
    assert first_row["BaseImage"].startswith("1080p_red_frame_")
    assert first_row["Image"].startswith("1080p_red_")

    copied_image = merged_dir / "crops" / first_row["Image"]
    assert copied_image.exists()

    viewer_html = (sample_results_dir / "viewer.html").read_text(encoding="utf-8")
    merged_entry_path = f"{merged_dir.name}/{MERGED_CSV_NAME}"
    assert merged_entry_path in viewer_html

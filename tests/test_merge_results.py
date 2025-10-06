import csv
import sys
from pathlib import Path

import pytest

sys.path.append(str(Path(__file__).resolve().parents[1]))

from merge_results import MERGED_CSV_NAME, MERGED_DIR_NAME, merge_results


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

    viewer = merged_dir / "merged_viewer.html"
    assert viewer.exists()
    html_text = viewer.read_text(encoding="utf-8")
    assert "../gallery.css" in html_text
    assert "../gallery.js" in html_text
    assert not (merged_dir / "gallery.css").exists()
    assert not (merged_dir / "gallery.js").exists()


def test_merge_results_can_include_pending_when_option_disabled(sample_results: Path) -> None:
    merged_dir = merge_results(sample_results, only_reviewed=False)

    merged_csv = merged_dir / MERGED_CSV_NAME
    with merged_csv.open("r", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)

    assert len(rows) == 3
    datasets = {row["Dataset"] for row in rows}
    assert datasets == {"video_a", "video_b", "video_c"}

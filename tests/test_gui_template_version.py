from pathlib import Path

from gui.services import detect_gallery_template_version


def _write_viewer(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def test_detect_gallery_version_prefers_data_attribute(tmp_path: Path) -> None:
    viewer_path = tmp_path / "gallery" / "index.html"
    _write_viewer(viewer_path, '<body data-app-version="1.2.3"></body>')

    assert detect_gallery_template_version(tmp_path) == "1.2.3"


def test_detect_gallery_version_falls_back_to_generator_meta(tmp_path: Path) -> None:
    viewer_path = tmp_path / "gallery" / "index.html"
    _write_viewer(
        viewer_path,
        '<meta name="generator" content="RelicListMaker 2.0">',
    )

    assert detect_gallery_template_version(tmp_path) == "RelicListMaker 2.0"


def test_detect_gallery_version_strips_bom(tmp_path: Path) -> None:
    viewer_path = tmp_path / "gallery" / "index.html"
    _write_viewer(viewer_path, '<body data-app-version="\ufeff0.9.0"></body>')

    assert detect_gallery_template_version(tmp_path) == "0.9.0"


def test_detect_gallery_version_missing_returns_none(tmp_path: Path) -> None:
    assert detect_gallery_template_version(tmp_path) is None


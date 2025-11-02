from pathlib import Path
import re


def load_gallery_css():
    project_root = Path(__file__).resolve().parent.parent
    css_path = project_root / 'templates' / 'gallery.css'
    return css_path.read_text(encoding='utf-8')


def test_item_color_select_options_have_primary_text_color():
    css = load_gallery_css()
    pattern = re.compile(
        r"\.item-color-select\s+option\s*\{[^}]*color:\s*var\(--color-text-primary\);",
        re.MULTILINE,
    )
    assert (
        pattern.search(css) is not None
    ), "item-color-select options should reset text color to the primary text color"


def test_item_color_select_options_have_surface_background():
    css = load_gallery_css()
    pattern = re.compile(
        r"\.item-color-select\s+option\s*\{[^}]*background-color:\s*var\(--color-surface\);",
        re.MULTILINE,
    )
    assert (
        pattern.search(css) is not None
    ), "item-color-select options should keep a neutral background for readability"

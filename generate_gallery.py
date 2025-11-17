"""ギャラリーHTML生成のエントリーポイント."""
from __future__ import annotations

from gallery.config import GalleryConfig, default_config
from gallery.models import GalleryDependencies, GalleryPayload, build_gallery_payload
from gallery.normalization import normalize_dataset_entries as _normalize_dataset_entries
from gallery.render import generate_html, load_text_asset, render_gallery_template

DEFAULT_CONFIG = default_config()
RESULTS_CSV_PATH = DEFAULT_CONFIG.results_csv_path
IMG_DIR = DEFAULT_CONFIG.image_dir
OUTPUT_HTML = DEFAULT_CONFIG.output_html
LABEL_SYMBOLS = list(DEFAULT_CONFIG.label_symbols)
DEFAULT_ITEM_IMAGE_VIEW_BOX = DEFAULT_CONFIG.default_item_image_view_box
DEFAULT_MASTER_CSV = DEFAULT_CONFIG.default_master_csv
DEFAULT_MASTER_JSON = DEFAULT_CONFIG.default_master_json
DEFAULT_MASTER_DEMERIT_CSV = DEFAULT_CONFIG.default_master_demerit_csv
DEFAULT_MASTER_DEMERIT_JSON = DEFAULT_CONFIG.default_master_demerit_json
TEMPLATE_HTML_PATH = DEFAULT_CONFIG.template_html_path
TEMPLATE_CSS_PATH = DEFAULT_CONFIG.template_css_path
TEMPLATE_INDEX_JS_PATH = DEFAULT_CONFIG.template_index_js_path
TEMPLATE_CORE_JS_PATH = DEFAULT_CONFIG.template_core_js_path

__all__ = [
    "GalleryConfig",
    "GalleryDependencies",
    "GalleryPayload",
    "LABEL_SYMBOLS",
    "DEFAULT_CONFIG",
    "DEFAULT_ITEM_IMAGE_VIEW_BOX",
    "DEFAULT_MASTER_CSV",
    "DEFAULT_MASTER_JSON",
    "DEFAULT_MASTER_DEMERIT_CSV",
    "DEFAULT_MASTER_DEMERIT_JSON",
    "IMG_DIR",
    "OUTPUT_HTML",
    "RESULTS_CSV_PATH",
    "TEMPLATE_CORE_JS_PATH",
    "TEMPLATE_CSS_PATH",
    "TEMPLATE_HTML_PATH",
    "TEMPLATE_INDEX_JS_PATH",
    "_normalize_dataset_entries",
    "build_gallery_payload",
    "generate_html",
    "load_text_asset",
    "render_gallery_template",
]


if __name__ == "__main__":
    import sys

    from relic_cli.__main__ import main as cli_main
    from relic_cli.utils import extend_argv

    sys.exit(cli_main(extend_argv(["generate-gallery"], sys.argv[1:])))

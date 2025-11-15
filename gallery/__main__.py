"""`python -m gallery` で利用する簡易CLI."""
from __future__ import annotations

from .config import default_config
from .render import generate_html


def main() -> None:
    config = default_config()
    generate_html(
        config.results_csv_path,
        config.image_dir,
        config.output_html,
        config.label_symbols,
        master_csv_path=config.default_master_csv,
        master_json_path=config.default_master_json,
        config=config,
    )


if __name__ == "__main__":
    main()

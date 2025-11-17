"""旧 preprocess CLI の互換モジュール."""
from __future__ import annotations

from relic_cli.commands.preprocess import preprocess_for_ocr, upscale_image

__all__ = ["preprocess_for_ocr", "upscale_image"]


if __name__ == "__main__":
    import sys

    from relic_cli.__main__ import main as cli_main
    from relic_cli.utils import extend_argv

    sys.exit(cli_main(extend_argv(["preprocess"], sys.argv[1:])))

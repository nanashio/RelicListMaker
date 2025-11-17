"""フレーム抽出ロジックへの互換ラッパー."""
from __future__ import annotations

from pipeline.extraction import (
    CROP_BOX,
    FPS_INTERVAL,
    extract_and_crop,
    is_similar,
    safe_crop,
)

__all__ = ["CROP_BOX", "FPS_INTERVAL", "extract_and_crop", "is_similar", "safe_crop"]


if __name__ == "__main__":
    import sys

    from relic_cli.__main__ import main as cli_main
    from relic_cli.utils import extend_argv

    sys.exit(cli_main(extend_argv(["extract-frames"], sys.argv[1:])))

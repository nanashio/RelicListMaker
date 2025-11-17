"""Relic CLIのエントリーポイント。"""
from __future__ import annotations

import argparse
import sys
from typing import Iterable

from relic_cli.commands import (
    extract_frames,
    generate_gallery,
    merge_results,
    preprocess,
)


COMMAND_MODULES = [extract_frames, preprocess, merge_results, generate_gallery]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m relic_cli",
        description="RelicListMaker のサブコマンド群",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    for module in COMMAND_MODULES:
        module.register_subcommand(subparsers)
    return parser


def main(argv: Iterable[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)
    handler = getattr(args, "handler", None)
    if handler is None:
        parser.print_help()
        return 1
    return handler(args)


if __name__ == "__main__":
    sys.exit(main())

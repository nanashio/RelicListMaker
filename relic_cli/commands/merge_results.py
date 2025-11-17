"""merge-results サブコマンド。"""
from __future__ import annotations

import argparse

from merge_results import MERGED_DIR_NAME, MergeResultsError, merge_results


def register_subcommand(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> None:
    parser = subparsers.add_parser(
        "merge-results",
        help="results/配下のデータセットを統合しビューワを更新",
    )
    parser.add_argument(
        "results_dir",
        nargs="?",
        default="results",
        help="統合対象の results ディレクトリ (デフォルト: results)",
    )
    parser.add_argument(
        "--target-name",
        default=MERGED_DIR_NAME,
        help=f"統合結果のディレクトリ名 (デフォルト: {MERGED_DIR_NAME})",
    )
    parser.add_argument(
        "--include-unreviewed",
        action="store_true",
        help="レビュー未完了の行も含めて統合する",
    )
    parser.add_argument(
        "--item-image-view-box",
        dest="item_image_view_box",
        help="ビューワの object-view-box を上書き",
    )
    parser.set_defaults(handler=_handle)


def _handle(args: argparse.Namespace) -> int:
    try:
        merge_results(
            args.results_dir,
            target_name=args.target_name,
            only_reviewed=not args.include_unreviewed,
            item_image_view_box=args.item_image_view_box,
        )
    except MergeResultsError as error:
        print(f"[ERROR] {error}")
        return 1
    return 0

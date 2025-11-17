"""結果ディレクトリ内の複数データセットを統合する互換ラッパー."""
from __future__ import annotations

from relic_cli.commands.merge_results import (
    DEFAULT_IMAGE_DIR_NAME,
    EXTRA_FIELD_PREFIXES,
    MERGED_CSV_NAME,
    MERGED_DIR_NAME,
    MergeResultsError,
    _collect_existing_merged_entries,
    _is_duplicate,
    _prefer_review_csv,
    merge_results,
)

__all__ = [
    "DEFAULT_IMAGE_DIR_NAME",
    "EXTRA_FIELD_PREFIXES",
    "MERGED_CSV_NAME",
    "MERGED_DIR_NAME",
    "MergeResultsError",
    "_collect_existing_merged_entries",
    "_is_duplicate",
    "_prefer_review_csv",
    "merge_results",
]

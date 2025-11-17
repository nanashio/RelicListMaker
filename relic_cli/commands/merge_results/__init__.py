"""merge-results サブコマンド実装."""

from __future__ import annotations

from .cli import register_subcommand
from .constants import (
    DEFAULT_IMAGE_DIR_NAME,
    EXTRA_FIELD_PREFIXES,
    MERGED_CSV_NAME,
    MERGED_DIR_NAME,
)
from .datasets import DatasetRecord, _is_merged_dir_name, _prefer_review_csv
from .errors import MergeResultsError
from .merge import merge_results
from .rows import _is_duplicate
from .viewer import _collect_existing_merged_entries

__all__ = [
    "DEFAULT_IMAGE_DIR_NAME",
    "EXTRA_FIELD_PREFIXES",
    "MERGED_CSV_NAME",
    "MERGED_DIR_NAME",
    "DatasetRecord",
    "MergeResultsError",
    "_collect_existing_merged_entries",
    "_is_duplicate",
    "_is_merged_dir_name",
    "_prefer_review_csv",
    "merge_results",
    "register_subcommand",
]

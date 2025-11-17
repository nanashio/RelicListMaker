"""共有定数."""

from __future__ import annotations

from typing import Sequence

MERGED_DIR_NAME = "merged"
MERGED_CSV_NAME = "merged.csv"
DEFAULT_IMAGE_DIR_NAME = "crops"
EXTRA_FIELD_PREFIXES: Sequence[str] = ("Effect", "RawText")
_REVIEWED_STATUSES = {"pass", "corrected"}

__all__ = [
    "DEFAULT_IMAGE_DIR_NAME",
    "EXTRA_FIELD_PREFIXES",
    "MERGED_CSV_NAME",
    "MERGED_DIR_NAME",
    "_REVIEWED_STATUSES",
]

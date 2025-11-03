"""Datasets package providing helpers for gallery payload construction."""

from .builder import DatasetBuildResult, ProcessedVideoResult, build_dataset_entries

__all__ = [
    "DatasetBuildResult",
    "ProcessedVideoResult",
    "build_dataset_entries",
]

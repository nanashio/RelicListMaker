"""Configuration dataclasses shared across the OCR pipeline."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Mapping, MutableMapping, Sequence

DEFAULT_OCR_LANG = "jpn"
DEFAULT_OCR_CONFIG = "--oem 3 --psm 6 -c preserve_interword_spaces=1"
DEFAULT_OCR_ENGINE = "tesseract"
DEFAULT_RESIZE_SCALE = 1.5
DEFAULT_GCP_CREDENTIALS_FILENAME = "service-account-file.json"

DEFAULT_COLUMN_VISIBILITY: dict[str, bool] = {
    "ItemColor": True,
    "RelicType": True,
    "RawText": True,
    "Score": True,
    "Source": True,
    "LevelOptions": True,
    "LevelCorrection": True,
    "Dataset": True,
    "DatasetFolder": True,
    "SourceCsv": True,
    "SourceImage": True,
    "BaseImage": True,
}


@dataclass(slots=True)
class OCRSettings:
    """Parameters that control OCR preprocessing and OCR engine execution."""

    lang: str = DEFAULT_OCR_LANG
    config: str = DEFAULT_OCR_CONFIG
    engine: str = DEFAULT_OCR_ENGINE
    preprocess: bool = True
    resize_scale: float = DEFAULT_RESIZE_SCALE
    apply_threshold: bool = True
    denoise: bool = True


@dataclass(slots=True)
class MatchingSettings:
    """Parameters used to resolve OCR text into effect dictionary entries."""

    dictionary: Sequence[str] = field(default_factory=tuple)
    scorer: Callable[[str, str], int] | Callable[[str, str], float] | None = None
    corrections: Mapping[str, str] = field(default_factory=dict)
    correction_score: float = 100.0


@dataclass(slots=True)
class ExportOptions:
    """Controls how OCR results are serialized to CSV rows."""

    column_visibility: MutableMapping[str, bool]
    slot_range: range
    level_map: Mapping[str, Sequence[str]] | None = None
    item_color: str | None = None
    relic_type: str | None = None


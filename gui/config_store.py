from __future__ import annotations

import configparser
from dataclasses import dataclass, field, replace
from pathlib import Path

from pipeline import (
    DEFAULT_GCP_CREDENTIALS_FILENAME,
    DEFAULT_OCR_ENGINE,
    DEFAULT_OCR_UPSAMPLE,
)

CONFIG_FILE_NAME = "RelicListMaker.ini"
_APP_SECTION = "app"
_COLUMNS_SECTION = "columns"


def _parse_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    normalized = value.strip().lower()
    if not normalized:
        return default
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default


def _bool_to_text(value: bool) -> str:
    return "true" if value else "false"


@dataclass
class AppConfig:
    """永続化されるGUI設定値を保持するデータコンテナ."""

    video_dir: str = "videos"
    results_dir: str = "results"
    ocr_upsample: str = str(DEFAULT_OCR_UPSAMPLE)
    ocr_engine: str = DEFAULT_OCR_ENGINE
    gcp_credentials_filename: str = DEFAULT_GCP_CREDENTIALS_FILENAME
    server_host: str = "127.0.0.1"
    server_port: str = "0"
    open_browser: bool = True
    save_full_frames: bool = False
    merge_only_reviewed: bool = True
    csv_columns: dict[str, bool] = field(
        default_factory=lambda: {
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
    )


def load_config(path: Path, defaults: AppConfig | None = None) -> AppConfig:
    """INIファイルから設定を読み出し :class:`AppConfig` を返す."""

    config = replace(defaults) if defaults is not None else AppConfig()
    if not path.exists():
        return config

    parser = configparser.ConfigParser()
    try:
        parser.read(path, encoding="utf-8")
    except Exception:
        return config

    if parser.has_section(_APP_SECTION):
        section = parser[_APP_SECTION]
        config.video_dir = section.get("video_dir", config.video_dir)
        config.results_dir = section.get("results_dir", config.results_dir)
        config.ocr_upsample = section.get("ocr_upsample", config.ocr_upsample)
        config.ocr_engine = section.get("ocr_engine", config.ocr_engine)
        config.gcp_credentials_filename = section.get(
            "gcp_credentials_filename", config.gcp_credentials_filename
        )
        config.server_host = section.get("server_host", config.server_host)
        config.server_port = section.get("server_port", config.server_port)
        config.open_browser = _parse_bool(section.get("open_browser"), config.open_browser)
        config.save_full_frames = _parse_bool(
            section.get("save_full_frames"), config.save_full_frames
        )
        config.merge_only_reviewed = _parse_bool(
            section.get("merge_only_reviewed"), config.merge_only_reviewed
        )

    if parser.has_section(_COLUMNS_SECTION):
        columns_section = parser[_COLUMNS_SECTION]
        updated: dict[str, bool] = {}
        for key, default_value in config.csv_columns.items():
            updated[key] = _parse_bool(columns_section.get(key), bool(default_value))
        config.csv_columns = updated

    return config


def save_config(path: Path, config: AppConfig) -> None:
    """設定値をINIファイルへ書き出す."""

    parser = configparser.ConfigParser()
    parser[_APP_SECTION] = {
        "video_dir": config.video_dir.strip(),
        "results_dir": config.results_dir.strip(),
        "ocr_upsample": config.ocr_upsample.strip(),
        "ocr_engine": config.ocr_engine.strip(),
        "gcp_credentials_filename": config.gcp_credentials_filename.strip(),
        "server_host": config.server_host.strip(),
        "server_port": config.server_port.strip(),
        "open_browser": _bool_to_text(config.open_browser),
        "save_full_frames": _bool_to_text(config.save_full_frames),
        "merge_only_reviewed": _bool_to_text(config.merge_only_reviewed),
    }
    parser[_COLUMNS_SECTION] = {
        key: _bool_to_text(bool(value)) for key, value in config.csv_columns.items()
    }

    with path.open("w", encoding="utf-8") as config_file:
        parser.write(config_file)

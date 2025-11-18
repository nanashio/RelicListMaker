"""アプリケーションのバージョン情報を解決するユーティリティ."""
from __future__ import annotations

import os
import subprocess
from functools import lru_cache
from typing import Optional

from resource_paths import resource_path

_VERSION_FILE_NAME = "RELEASE_VERSION"


def _normalize(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    text = value.strip()
    return text or None


def _version_from_file() -> Optional[str]:
    try:
        file_path = resource_path(_VERSION_FILE_NAME)
    except Exception:
        return None
    if not file_path.exists():
        return None
    try:
        content = file_path.read_text(encoding="utf-8")
    except OSError:
        return None
    return _normalize(content)


def _run_git_command(args: list[str]) -> Optional[str]:
    try:
        completed = subprocess.run(
            ["git", *args],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return None
    return _normalize(completed.stdout)


def _latest_release_tag() -> Optional[str]:
    return _run_git_command(["describe", "--tags", "--abbrev=0"])


def _short_commit_hash() -> Optional[str]:
    return _run_git_command(["rev-parse", "--short", "HEAD"])


def _development_version() -> Optional[str]:
    release_tag = _latest_release_tag()
    if release_tag:
        return f"{release_tag}-dev"
    commit_hash = _short_commit_hash()
    if commit_hash:
        return f"{commit_hash}-dev"
    return None


@lru_cache(maxsize=1)
def get_version() -> str:
    """GitHub リリースと整合するバージョン文字列を返す."""

    candidates = (
        _normalize(os.getenv("RELICLISTMAKER_VERSION")),
        _normalize(os.getenv("GITHUB_REF_NAME")),
        _version_from_file(),
    )
    for candidate in candidates:
        if candidate:
            return candidate

    development_version = _development_version()
    if development_version:
        return development_version

    commit_hash = _short_commit_hash()
    if commit_hash:
        return commit_hash
    return "0.0.0-dev"


__all__ = ["get_version"]

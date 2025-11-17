"""bundle-tesseract サブコマンド."""
from __future__ import annotations

import argparse

from tesseract_bundle import (
    TesseractInfo,
    configure_pytesseract,
    find_bundled_tesseract,
    is_system_tesseract_preferred,
    system_tesseract_reason,
)


def register_subcommand(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> None:
    parser = subparsers.add_parser(
        "bundle-tesseract",
        help="バンドル済み Tesseract の検出や有効化を行う",
    )
    parser.add_argument(
        "--activate",
        action="store_true",
        help="pytesseract をバンドル済み Tesseract に向けて環境変数を調整する",
    )
    parser.add_argument(
        "--require",
        action="store_true",
        help="バンドル済み Tesseract が見つからない場合はエラー終了する",
    )
    parser.set_defaults(handler=_handle)


def _print_info(info: TesseractInfo) -> None:
    print(f"[INFO] バンドル済み Tesseract を検出: {info.cmd}")
    if info.tessdata_prefix:
        print(f"[INFO] tessdata: {info.tessdata_prefix}")


def _print_missing() -> None:
    print("[WARN] バンドル済み Tesseract は見つかりませんでした。")


def _handle(args: argparse.Namespace) -> int:
    info = find_bundled_tesseract()
    if info:
        _print_info(info)
    else:
        _print_missing()
        if args.require:
            return 1

    if not args.activate:
        return 0

    try:
        configured = configure_pytesseract()
    except RuntimeError as exc:
        print(f"[ERROR] {exc}")
        return 1

    if configured:
        print(f"[INFO] pytesseract を {configured.cmd} に設定しました")
        if configured.tessdata_prefix:
            print(f"[INFO] TESSDATA_PREFIX: {configured.tessdata_prefix}")
        return 0

    if is_system_tesseract_preferred():
        reason = system_tesseract_reason() or "system"
        if reason == "missing":
            print("[ERROR] 利用可能な Tesseract が見つからないため終了します")
            return 1
        print(f"[INFO] システムの Tesseract を優先します (理由: {reason})")
        return 0

    print("[ERROR] Tesseract を有効化できませんでした。インストール状況を確認してください。")
    return 1


__all__ = ["register_subcommand"]

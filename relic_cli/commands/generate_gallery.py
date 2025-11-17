"""generate-gallery サブコマンド。"""
from __future__ import annotations

import argparse
from pathlib import Path
from typing import Sequence

from gallery import (
    DEFAULT_CONFIG,
    DEFAULT_MASTER_CSV,
    DEFAULT_MASTER_DEMERIT_CSV,
    DEFAULT_MASTER_DEMERIT_JSON,
    DEFAULT_MASTER_JSON,
    LABEL_SYMBOLS,
    generate_html,
)


def register_subcommand(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> None:
    parser = subparsers.add_parser(
        "generate-gallery",
        help="CSV とクロップ画像からギャラリー HTML を生成",
    )
    parser.add_argument(
        "--results-csv",
        default=DEFAULT_CONFIG.results_csv_path,
        help="結果 CSV へのパス (デフォルト: results_input_video.csv)",
    )
    parser.add_argument(
        "--image-dir",
        default=DEFAULT_CONFIG.image_dir,
        help="クロップ画像のディレクトリ (デフォルト: crops/input_video)",
    )
    parser.add_argument(
        "--output-html",
        default=DEFAULT_CONFIG.output_html,
        help="生成する HTML のパス (デフォルト: gallery/index.html)",
    )
    parser.add_argument(
        "--label-symbols",
        nargs="+",
        metavar="SYMBOL",
        help="ギャラリーで使用するラベル記号 (空白区切りで複数指定)",
    )
    parser.add_argument(
        "--master-csv",
        default=DEFAULT_MASTER_CSV,
        help="遺物マスター CSV のパス",
    )
    parser.add_argument(
        "--master-json",
        default=DEFAULT_MASTER_JSON,
        help="遺物マスター JSON のパス",
    )
    parser.add_argument(
        "--master-demerit-csv",
        default=DEFAULT_MASTER_DEMERIT_CSV,
        help="デメリットマスター CSV のパス",
    )
    parser.add_argument(
        "--master-demerit-json",
        default=DEFAULT_MASTER_DEMERIT_JSON,
        help="デメリットマスター JSON のパス",
    )
    parser.add_argument(
        "--template-html",
        help="HTML テンプレートの上書きパス",
    )
    parser.add_argument(
        "--template-css",
        help="CSS テンプレートの上書きパス",
    )
    parser.add_argument(
        "--template-js",
        help="ギャラリー本体 (gallery.js) のテンプレート上書きパス",
    )
    parser.add_argument(
        "--css-output-name",
        help="出力する CSS ファイル名 (デフォルト: gallery.css)",
    )
    parser.add_argument(
        "--js-output-name",
        help="出力するギャラリー JS ファイル名 (デフォルト: gallery.js)",
    )
    parser.add_argument(
        "--css-relative",
        help="HTML から CSS を参照する際の相対パスを固定",
    )
    parser.add_argument(
        "--js-relative",
        help="HTML から JS を参照する際の相対パスを固定",
    )
    parser.add_argument(
        "--datasets-base-dir",
        help="結果 CSV や画像の相対パス解決に利用するベースディレクトリ",
    )
    parser.add_argument(
        "--item-image-view-box",
        help="CSS の view-box (inset) 指定を上書き",
    )
    parser.add_argument(
        "--active-dataset-index",
        type=int,
        default=0,
        help="複数データセットを扱う際の初期選択インデックス",
    )
    parser.set_defaults(handler=_handle)


def _normalize_label_symbols(symbols: Sequence[str] | None) -> Sequence[str]:
    if symbols:
        return list(symbols)
    return list(LABEL_SYMBOLS)


def _resolve_optional_path(path: str | None) -> str | None:
    if not path:
        return None
    resolved = Path(path).expanduser()
    return str(resolved)


def _handle(args: argparse.Namespace) -> int:
    label_symbols = _normalize_label_symbols(args.label_symbols)
    generate_html(
        args.results_csv,
        args.image_dir,
        args.output_html,
        label_symbols=label_symbols,
        master_csv_path=_resolve_optional_path(args.master_csv),
        master_json_path=_resolve_optional_path(args.master_json),
        master_demerit_csv_path=_resolve_optional_path(args.master_demerit_csv),
        master_demerit_json_path=_resolve_optional_path(args.master_demerit_json),
        template_path=_resolve_optional_path(args.template_html),
        css_template_path=_resolve_optional_path(args.template_css),
        js_template_path=_resolve_optional_path(args.template_js),
        css_output_name=args.css_output_name,
        js_output_name=args.js_output_name,
        css_relative_override=args.css_relative,
        js_relative_override=args.js_relative,
        item_image_view_box=args.item_image_view_box,
        datasets_base_dir=args.datasets_base_dir,
        active_dataset_index=args.active_dataset_index,
    )
    return 0

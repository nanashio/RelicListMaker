"""ギャラリー用データモデルと組み立てロジック."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional, Sequence, Tuple

from relic_data import (
    load_master_csv,
    load_master_effect_metadata,
    load_master_effects_and_levels,
    load_master_json,
    normalize_master_values,
)

from .config import GalleryConfig, default_config
from .normalization import (
    clamp_active_dataset_index,
    collect_master_data_by_type,
    collect_warnings,
    insert_merged_dataset,
    merge_level_maps,
    normalize_dataset_entries,
    normalize_item_image_view_box,
    resolve_label_symbols,
)


@dataclass
class GalleryPayload:
    """テンプレートへ埋め込むデータ一式と警告情報."""

    results_csv: str
    image_dir: str
    label_symbols: List[str]
    master_csv: str
    master_json: str
    master_options: List[str]
    master_options_by_type: Dict[str, List[str]]
    master_levels: Dict[str, List[str]]
    master_levels_by_type: Dict[str, Dict[str, List[str]]]
    master_csv_map: Dict[str, str]
    master_demerit_csv: str
    master_demerit_json: str
    master_demerit_options: List[str]
    master_demerit_options_by_type: Dict[str, List[str]]
    master_demerit_csv_map: Dict[str, str]
    master_demerit_rules_by_type: Dict[str, Dict[str, Dict[str, object]]]
    datasets: List[dict]
    active_dataset_index: int
    item_image_view_box: str
    warnings: List[str] = field(default_factory=list)


@dataclass(frozen=True)
class GalleryDependencies:
    """外部入出力を抽象化した依存関係."""

    load_master_csv: Callable[[str], List[str]] = load_master_csv
    load_master_json: Callable[[str], Sequence[object]] = load_master_json
    load_master_effects_and_levels: Callable[[str], Tuple[List[str], Dict[str, List[str]]]] = (
        load_master_effects_and_levels
    )
    load_master_effect_metadata: Callable[[str], Dict[str, Dict[str, object]]] = (
        load_master_effect_metadata
    )
    normalize_master_values: Callable[[Optional[Sequence[object]]], List[str]] = (
        normalize_master_values
    )
    path_exists: Callable[[str], bool] = os.path.exists


def _resolve_relative_path(path: str, output_dir: str) -> str:
    try:
        return os.path.relpath(path, output_dir)
    except ValueError:
        return os.path.basename(path)


def _ensure_relative(path: str) -> str:
    if os.sep != "/":
        return path.replace(os.sep, "/")
    return path


def _resolve_candidate_path(path: str, output_dir: str) -> str:
    if os.path.isabs(path):
        return path
    return os.path.abspath(os.path.join(output_dir, path))


def build_gallery_payload(
    *,
    results_path: str,
    img_dir: Optional[str],
    output_dir: str,
    datasets_base_dir: Optional[str] = None,
    label_symbols: Optional[Sequence[object]] = None,
    master_csv_path: Optional[str] = None,
    master_json_path: Optional[str] = None,
    master_options: Optional[Sequence[object]] = None,
    master_demerit_csv_path: Optional[str] = None,
    master_demerit_json_path: Optional[str] = None,
    master_demerit_options: Optional[Sequence[object]] = None,
    datasets=None,
    active_dataset_index: int = 0,
    item_image_view_box: Optional[str] = None,
    config: Optional[GalleryConfig] = None,
    dependencies: Optional[GalleryDependencies] = None,
) -> GalleryPayload:
    """入力パラメータを正規化しテンプレート描画用ペイロードを構築する."""

    config = config or default_config()
    deps = dependencies or GalleryDependencies()

    output_dir_abs = os.path.abspath(output_dir) if output_dir else os.getcwd()
    datasets_base_dir_abs = (
        os.path.abspath(datasets_base_dir)
        if datasets_base_dir
        else output_dir_abs
    )

    warnings: List[str] = []

    normalized_symbols = resolve_label_symbols(
        label_symbols,
        config.label_symbols,
        config.label_symbols,
    )

    results_abs_path = os.path.abspath(results_path)
    results_rel_path = _resolve_relative_path(results_abs_path, output_dir_abs)
    warnings.extend(
        collect_warnings(
            [
                (
                    deps.path_exists(results_abs_path),
                    f"[!] 結果ファイルが見つかりません: {results_path}",
                )
            ]
        )
    )

    img_rel_dir = "."
    img_abs_dir: Optional[str] = None
    if img_dir:
        if os.path.isabs(img_dir):
            img_abs_dir = img_dir
        else:
            img_abs_dir = os.path.abspath(os.path.join(datasets_base_dir_abs, img_dir))
        if img_abs_dir:
            img_rel_dir = _resolve_relative_path(img_abs_dir, output_dir_abs)
        warnings.extend(
            collect_warnings(
                [
                    (
                        not img_abs_dir or deps.path_exists(img_abs_dir),
                        f"[!] 画像ディレクトリが見つかりません: {img_abs_dir}",
                    )
                ]
            )
        )

    resolved_view_box = normalize_item_image_view_box(
        item_image_view_box,
        config.default_item_image_view_box,
    )

    master_options_list = deps.normalize_master_values(master_options)
    master_csv_rel_path = ""
    master_json_rel_path = ""
    master_levels_map: Dict[str, List[str]] = {}
    master_effects_from_csv: List[str] = []
    master_demerit_options_list = deps.normalize_master_values(master_demerit_options)
    master_demerit_csv_rel_path = ""
    master_demerit_json_rel_path = ""
    master_demerit_effects_from_csv: List[str] = []

    master_csv_abs: Optional[str] = None
    if master_csv_path:
        candidate = _resolve_candidate_path(master_csv_path, output_dir_abs)
        if deps.path_exists(candidate):
            master_csv_abs = candidate
        else:
            warnings.extend(
                collect_warnings(
                    [(False, f"[!] マスターデータ(CSV)が見つかりません: {candidate}")]
                )
            )
    if master_csv_abs is None and config.default_master_csv:
        fallback_csv = _resolve_candidate_path(config.default_master_csv, output_dir_abs)
        if deps.path_exists(fallback_csv):
            master_csv_abs = fallback_csv
        else:
            warnings.extend(
                collect_warnings(
                    [
                        (
                            False,
                            f"[!] 既定のマスターデータ(CSV)が見つかりません: {fallback_csv}",
                        )
                    ]
                )
            )

    if master_csv_abs:
        master_csv_rel_path = _resolve_relative_path(master_csv_abs, output_dir_abs)
        master_effects_from_csv, master_levels_map = deps.load_master_effects_and_levels(
            master_csv_abs
        )

    if not master_options_list and master_json_path:
        master_json_candidate = _resolve_candidate_path(master_json_path, output_dir_abs)
        if deps.path_exists(master_json_candidate):
            master_json_rel_path = _resolve_relative_path(
                master_json_candidate, output_dir_abs
            )
            master_options_list = list(deps.load_master_json(master_json_candidate))
        else:
            warnings.extend(
                collect_warnings(
                    [
                        (
                            False,
                            f"[!] マスターデータ(JSON)が見つかりません: {master_json_candidate}",
                        )
                    ]
                )
            )

    if not master_options_list and master_effects_from_csv:
        master_options_list = master_effects_from_csv

    if not master_options_list and master_csv_abs:
        master_options_list = deps.load_master_csv(master_csv_abs)

    master_demerit_csv_abs: Optional[str] = None
    if master_demerit_csv_path:
        candidate = _resolve_candidate_path(master_demerit_csv_path, output_dir_abs)
        if deps.path_exists(candidate):
            master_demerit_csv_abs = candidate
        else:
            warnings.extend(
                collect_warnings(
                    [
                        (
                            False,
                            f"[!] デメリットマスターデータ(CSV)が見つかりません: {candidate}",
                        )
                    ]
                )
            )
    if master_demerit_csv_abs is None and config.default_master_demerit_csv:
        fallback_csv = _resolve_candidate_path(
            config.default_master_demerit_csv,
            output_dir_abs,
        )
        if deps.path_exists(fallback_csv):
            master_demerit_csv_abs = fallback_csv
        elif config.default_master_demerit_csv:
            warnings.extend(
                collect_warnings(
                    [
                        (
                            False,
                            f"[!] 既定のデメリットマスターデータ(CSV)が見つかりません: {fallback_csv}",
                        )
                    ]
                )
            )

    if master_demerit_csv_abs:
        master_demerit_csv_rel_path = _resolve_relative_path(
            master_demerit_csv_abs,
            output_dir_abs,
        )
        master_demerit_effects_from_csv = deps.load_master_csv(master_demerit_csv_abs)

    if not master_demerit_options_list and master_demerit_json_path:
        master_demerit_json_candidate = _resolve_candidate_path(
            master_demerit_json_path,
            output_dir_abs,
        )
        if deps.path_exists(master_demerit_json_candidate):
            master_demerit_json_rel_path = _resolve_relative_path(
                master_demerit_json_candidate,
                output_dir_abs,
            )
            master_demerit_options_list = list(
                deps.load_master_json(master_demerit_json_candidate)
            )
        else:
            warnings.extend(
                collect_warnings(
                    [
                        (
                            False,
                            f"[!] デメリットマスターデータ(JSON)が見つかりません: {master_demerit_json_candidate}",
                        )
                    ]
                )
            )

    if not master_demerit_options_list and master_demerit_effects_from_csv:
        master_demerit_options_list = master_demerit_effects_from_csv

    if not master_demerit_options_list and master_demerit_csv_abs:
        master_demerit_options_list = deps.load_master_csv(master_demerit_csv_abs)

    dataset_entries = normalize_dataset_entries(
        datasets,
        output_dir_abs,
        base_dir=datasets_base_dir_abs,
    )

    (
        master_options_by_type,
        master_levels_by_type,
        master_csv_map,
        master_demerit_options_by_type,
        master_demerit_csv_map,
        master_demerit_rules_by_type,
    ) = collect_master_data_by_type(
        dataset_entries,
        output_dir_abs,
        config=config,
        load_effects_and_levels=deps.load_master_effects_and_levels,
        load_metadata=deps.load_master_effect_metadata,
    )

    aggregated_options: List[str] = list(master_options_list or [])
    for options in master_options_by_type.values():
        aggregated_options.extend(options)
    master_options_list = deps.normalize_master_values(aggregated_options)

    aggregated_demerit_options: List[str] = list(
        master_demerit_options_list or []
    )
    for options in master_demerit_options_by_type.values():
        aggregated_demerit_options.extend(options)
    master_demerit_options_list = deps.normalize_master_values(
        aggregated_demerit_options
    )

    combined_levels = merge_level_maps(master_levels_map, None)
    for levels in master_levels_by_type.values():
        combined_levels = merge_level_maps(combined_levels, levels)
    master_levels_map = combined_levels

    dataset_entries, active_dataset_index = insert_merged_dataset(
        dataset_entries,
        active_dataset_index,
    )
    active_dataset_index = clamp_active_dataset_index(
        dataset_entries,
        active_dataset_index,
    )

    if dataset_entries and active_dataset_index >= 0:
        active_dataset = dataset_entries[active_dataset_index]
        csv_entry = active_dataset.get("csv") or ""
        img_entry = active_dataset.get("imgDir") or ""

        if csv_entry:
            active_csv_abs = os.path.abspath(os.path.join(output_dir_abs, csv_entry))
            results_abs_path = active_csv_abs
            results_rel_path = csv_entry
            if not deps.path_exists(active_csv_abs):
                warnings.extend(
                    collect_warnings(
                        [
                            (
                                False,
                                f"[!] データセットCSVが見つかりません: {active_csv_abs}",
                            )
                        ]
                    )
                )

        if img_entry:
            img_rel_dir = img_entry
            img_abs_dir = os.path.abspath(os.path.join(output_dir_abs, img_entry))
            if not deps.path_exists(img_abs_dir):
                warnings.extend(
                    collect_warnings(
                        [
                            (
                                False,
                                f"[!] データセット画像ディレクトリが見つかりません: {img_abs_dir}",
                            )
                        ]
                    )
                )
    else:
        active_dataset_index = -1

    return GalleryPayload(
        results_csv=_ensure_relative(results_rel_path),
        image_dir=_ensure_relative(img_rel_dir),
        label_symbols=list(normalized_symbols),
        master_csv=_ensure_relative(master_csv_rel_path),
        master_json=_ensure_relative(master_json_rel_path),
        master_options=list(master_options_list or []),
        master_options_by_type={key: list(values) for key, values in master_options_by_type.items()},
        master_levels=master_levels_map,
        master_levels_by_type=master_levels_by_type,
        master_csv_map=master_csv_map,
        master_demerit_csv=_ensure_relative(master_demerit_csv_rel_path),
        master_demerit_json=_ensure_relative(master_demerit_json_rel_path),
        master_demerit_options=list(master_demerit_options_list or []),
        master_demerit_options_by_type={
            key: list(values)
            for key, values in master_demerit_options_by_type.items()
        },
        master_demerit_csv_map=master_demerit_csv_map,
        master_demerit_rules_by_type=master_demerit_rules_by_type,
        datasets=list(dataset_entries),
        active_dataset_index=active_dataset_index,
        item_image_view_box=resolved_view_box,
        warnings=warnings,
    )


__all__ = [
    "GalleryPayload",
    "GalleryDependencies",
    "build_gallery_payload",
]

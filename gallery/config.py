"""ギャラリー生成に関する設定定数とヘルパー."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import MutableMapping, Optional, Sequence

from resource_paths import templates_path


@dataclass
class GalleryConfig:
    """ギャラリー生成で利用する設定値群."""

    results_csv_path: str = "results_input_video.csv"
    image_dir: str = "crops/input_video"
    output_html: str = "gallery/index.html"
    label_symbols: Sequence[str] = ("①", "②", "③")
    default_item_image_view_box: str = "inset(0px 180px 0px 0px)"
    default_master_csv: str = field(
        default_factory=lambda: str(templates_path("master_relics.csv"))
    )
    default_master_json: str = "master_relics.json"
    default_master_demerit_csv: str = field(
        default_factory=lambda: str(templates_path("master_relics_demerit.csv"))
    )
    default_master_demerit_json: str = "master_relics_demerit.json"
    template_html_path: str = field(
        default_factory=lambda: str(templates_path("gallery.html"))
    )
    template_css_path: str = field(
        default_factory=lambda: str(templates_path("gallery/gallery.css"))
    )
    template_index_js_path: str = field(
        default_factory=lambda: str(templates_path("gallery/index.js"))
    )
    template_core_js_path: str = field(
        default_factory=lambda: str(templates_path("gallery/gallery.js"))
    )
    known_relic_types: MutableMapping[str, str] = field(
        default_factory=lambda: {"normal": "master_relics.csv", "deep": "master_relics_deep.csv"}
    )
    known_demerit_types: MutableMapping[str, str] = field(
        default_factory=lambda: {"deep": "master_relics_demerit.csv"}
    )

    def resolve_master_csv_for_type(self, relic_type: str) -> Optional[str]:
        """遺物種別ごとのマスターデータCSVパスを返す."""

        path = self.known_relic_types.get(relic_type)
        if not path:
            return None
        return self._resolve_template_path(path)

    def resolve_master_demerit_csv_for_type(self, relic_type: str) -> Optional[str]:
        """遺物種別ごとのデメリットマスターデータCSVパスを返す."""

        path = self.known_demerit_types.get(relic_type)
        if not path:
            return None
        return self._resolve_template_path(path)

    @staticmethod
    def _resolve_template_path(path: str) -> str:
        if os.path.isabs(path):
            return path
        return str(templates_path(path))


def default_config() -> GalleryConfig:
    """設定値のデフォルトインスタンスを取得する."""

    return GalleryConfig()


__all__ = ["GalleryConfig", "default_config"]

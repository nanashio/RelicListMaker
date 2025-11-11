"""relic_data ユーティリティの挙動を検証するテスト."""

from __future__ import annotations

import textwrap

from relic_data import load_master_effect_metadata


def _write_csv(tmp_path, content: str):
    csv_path = tmp_path / "master_relics.csv"
    csv_path.write_text(textwrap.dedent(content).lstrip(), encoding="utf-8")
    return csv_path


def test_load_master_effect_metadata_prefers_demerit_levels(tmp_path):
    csv_path = _write_csv(
        tmp_path,
        """
        EffectBase,Demerit,Existing
        Effect A,"+1,＋２","+3"
        Effect B,FALSE,"＋１"
        Effect C,TRUE,"＋２,＋３"
        """,
    )

    metadata = load_master_effect_metadata(csv_path)

    assert metadata["effect a"]["levels"] == ["＋1", "＋２"]
    assert metadata["effect b"]["levels"] == ["＋１"]
    assert metadata["effect c"]["levels"] == ["＋２", "＋３"]
    assert metadata["effect a"]["hasDemerit"] is True
    assert metadata["effect b"]["hasDemerit"] is False
    assert metadata["effect c"]["hasDemerit"] is True


def test_load_master_effect_metadata_without_demerit_column(tmp_path):
    csv_path = _write_csv(
        tmp_path,
        """
        EffectBase,Existing
        Effect A,"＋１,＋２"
        """,
    )

    metadata = load_master_effect_metadata(csv_path)

    assert metadata["effect a"]["levels"] == ["＋１", "＋２"]
    assert metadata["effect a"]["hasDemerit"] is False

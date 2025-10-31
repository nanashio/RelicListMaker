"""Load manual corrections for OCR results."""

from __future__ import annotations

from pathlib import Path
from typing import Mapping

import pandas as pd


def load_corrections(corrections_csv: str | Path | None) -> Mapping[str, str]:
    """Load correction mappings from a CSV file."""

    if not corrections_csv:
        return {}

    csv_path = Path(corrections_csv)
    if not csv_path.exists():
        return {}

    try:
        df = pd.read_csv(csv_path)
    except Exception as err:  # pragma: no cover - defensive logging
        print(f"[WARN] フィードバックの読み込みに失敗しました: {err}")
        return {}

    corrections: dict[str, str] = {}
    for _, row in df.iterrows():
        raw_text = str(row.get("RawText", "")).strip()
        corrected = str(row.get("Corrected", "")).strip()
        if raw_text and corrected:
            corrections[raw_text] = corrected

    if corrections:
        print(f"[INFO] フィードバック {len(corrections)} 件を適用します")

    return corrections


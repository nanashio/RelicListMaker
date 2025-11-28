# OCRとマッチングの条件・フローまとめ

本ドキュメントでは、RelicListMaker における OCR 前処理、OCR 実行、辞書マッチング、CSV 生成までのフローをコード準拠で整理する。

## クロップ範囲とパラメーター生成
- 1920x1080 を前提に、効果欄 3 枠を `BASE_CROP_BOXES` で定義している（`(188, 78, 768, 128)` など）。スケール指定がある場合は `scale_crop_boxes` で等倍拡縮して利用する。
- CLI/GUI からの指定値を受け取り、`build_processing_parameters` が以下をまとめた `ProcessingParameters` を構築する。
  - `OCRSettings`: エンジン、リサイズ倍率、前処理有無、Vision 認証パスなど。
  - `ExportOptions`: スロット数、列表示フラグ、遺物色・種別、レベルマップ（辞書由来）を保持。
- `MatchingSettings`: 辞書本体とスコアラー（デフォルトは `rapidfuzz.fuzz.WRatio`）、補正 CSV を反映した `corrections` をセット。補正ヒット時のスコアは固定で `100.0`。
- 種別が「深層」の場合はデメリット辞書もロードし、全スロットをデメリット対象として初期化する。

## 全体フロー（マーメイド図）
```mermaid
flowchart TD
    A[入力 PNG 群] --> B[build_processing_parameters で\nクロップ設定/辞書/補正を集約]
    B --> C[process_images で PNG をソート]
    C --> D[各 PNG を BASE_CROP_BOXES\nまたは scale_crop_boxes でクロップ]
    D --> E{OCRSettings.preprocess?}
    E -- Yes --> F[prepare_for_ocr\n・リサイズ\n・グレースケール\n・ガウシアン→Otsu\n・メディアンブラー]
    E -- No --> G[必要に応じて\nリサイズ+グレースケールのみ]
    F --> H[OCR 実行\n・tesseract(--oem 3 --psm 6)\n・または Google Vision]
    G --> H
    H --> I[clean_ocr_text で改ページ\nや余分な空白を除去]
    I --> J[ocr_and_match で\nスロット単位にマッチング]
    J --> K{MatchingSettings.corrections\nに一致?}
    K -- Yes --> L[score 100.0,\nsource=feedback]
    K -- No --> M[rapidfuzz WRatio で\n辞書最良一致\nsource=dictionary]
    L --> N[深層なら 2 行目を\ndemerit_matching]
    M --> N
    N --> O[build_row で列を\nExportOptions に従い組み立て]
    O --> P[CSV 出力\n(RawText/Score/Source など)]
```

## OCR 前処理と実行
- `OCRSettings.preprocess=True` のとき、`prepare_for_ocr` が以下を実施する。
  1. `resize_scale`（既定 1.5 倍）でバイキュービック拡大
  2. グレースケール変換
  3. ガウシアンブラー → Otsu の二値化
  4. メディアンブラーによるノイズ除去
- 前処理を無効化した場合でも、拡大とグレースケール変換は `resize_scale` が設定されていれば適用される。
- OCR エンジンは `tesseract` がデフォルトで、`--oem 3 --psm 6 -c preserve_interword_spaces=1` を付与して実行する。`vision`/`google` を指定した場合は Google Cloud Vision API を利用し、同梱/指定の認証ファイルを探索する。
- `batch_recognize` はクロップ済み画像ごとに前処理を掛けた上で OCR を実行し、改ページ文字や余分な空白を `clean_ocr_text` で除去したテキストを返す。

## OCR テキストのマッチング条件
- `ocr_and_match` はスロットごとに OCR したテキストを取得し、先頭行（なければ全行トリム）を効果名候補として扱う。
- マッチングは以下の順で評価する。
  1. `MatchingSettings.corrections` に完全一致する補正があれば、`source="feedback"`、`score=100.0` で確定。
  2. 補正がなければ、辞書に対して `rapidfuzz.process.extractOne`（`WRatio`）で最良一致を検索し、`source="dictionary"` で返す。
- `slot_settings` や `slot_sources` を指定するとスロット単位で辞書/ソースを上書きできる。
- OCR が失敗したスロットは `MatchResult(raw_text="", matched_text="No image", source="error")` などで穴埋めし、例外発生時もスロット数に合わせてエラー結果を返す。

## デメリット検出
- 深層種別で `demerit_matching` が設定されている場合、各デメリットスロットについて、OCR 行の 2 行目（なければ空文字）をデメリット候補として取り出す。
- テキストが空でなければ通常の効果と同様に辞書照合し、`source="demerit"` として格納する。空文字のままならスコア 0.0 のまま `source="ocr"` として残す。

## CSV 生成フロー
- `process_images` は PNG をソートして処理し、`ocr_and_match` の結果を `build_row` に渡して行データを組み立てる。`ExportOptions.slot_range` と列表示フラグに従い、RawText/Score/Source/LevelOptions などの列が制御される。
- OCR をスキップする (`engine="none"`) 場合は、空の `MatchResult` を作成しつつ列構成だけ整えた CSV を出力する。
- 辞書未読み込みや出力対象なしの場合は早期リターンし、正常終了時は指定パスへ CSV を書き出す。

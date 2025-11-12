# CSVカラム仕様リファレンス

本ドキュメントでは、RelicListMaker で利用しているマスターCSVと、OCRパイプラインが出力するレビュー用CSVのカラム構成をまとめる。テンプレートの場所や列ごとの役割、動的に生成される列についての注意点を記載する。

## マスターCSVのカラム

### `templates/master_relics.csv`
| カラム名 | 役割 | 現行コード参照 | 備考 |
| --- | --- | --- | --- |
| `EffectBase` | 辞書照合の基準となる効果名。`load_master_csv` や `load_master_effects_and_levels` が既定列として読み込む。 | ○（`DEFAULT_MASTER_COLUMN` として常時読込） | `DEFAULT_MASTER_COLUMN` の定義により標準キーとして扱われる。【F:relic_data.py†L12-L204】 |
| `Category` | 効果を系統別に分類するためのラベル。 | × | 現在のコードからは参照されず、運用メモとして利用する。【F:templates/master_relics.csv†L1-L10】 |
| `Levels` | 効果ごとに許容される段階（+1、+2 など）の候補値。 | ○（レベル候補の構築に利用） | `load_master_effects_and_levels` が候補リストを構築し、`build_row` が `Effect{n}LevelOptions` を生成する際に参照する。【F:relic_data.py†L157-L204】【F:relic_pipeline/io/exporter.py†L164-L174】 |
| `Overlap` | 効果の重複可否などを記録する運用メモ列。 | × | 自動処理では使用されず、テンプレート上で `〇`/`✕` を手入力する想定。【01e9e0†L1-L7】 |
| `note` | 効果に関する自由記述メモ。 | × | テンプレート内に記載されるメモ列で、コードからは参照されない。【F:templates/master_relics.csv†L1-L10】 |

### `templates/master_relics_deep.csv`
| カラム名 | 役割 | 現行コード参照 | 備考 |
| --- | --- | --- | --- |
| `EffectBase` | 深淵遺物向け辞書の基準名。通常版と同様に `EffectBase` がキーになる。 | ○（通常辞書と同等に読込） | 共通テンプレートとして定義される。【F:templates/master_relics_deep.csv†L1-L6】 |
| `Category` | 効果区分のメモ列。 | × | 自動処理では未使用で、テンプレート上のメモとして扱う。【F:templates/master_relics_deep.csv†L1-L6】 |
| `Levels` | 深淵遺物専用のレベル候補。 | ○（レベル候補の構築に利用） | `load_master_effects_and_levels` は列の有無を自動判定する。【F:relic_data.py†L178-L204】 |
| `Overlap` | 重複可否のメモ列。 | × | テンプレート内のみで管理。【0bfb5e†L1-L10】 |
| `Demerit` | デメリットの有無と内容を兼ねる列。〇/✕ 等をブール値に変換しつつ、デメリット欄の文字列からレベル候補を抽出する。 | ○（デメリット抽出に使用） | `_normalize_boolean_flag` や `_extract_level_tokens` を通じて `hasDemerit` と `levels` を算出する。【F:relic_data.py†L74-L126】【F:relic_data.py†L207-L245】 |
| `Existing` | 既存ゲーム内で確認済みの効果などを記録するメモ列。 | × | テンプレートのヘッダーでのみ定義され、コードからは参照されない。【F:templates/master_relics_deep.csv†L1-L6】 |
| `note` | 効果の補足説明。 | × | テンプレート内に記入されるメモでコードは参照しない。【F:templates/master_relics_deep.csv†L1-L6】 |

### `templates/master_relics_demerit.csv`
| カラム名 | 役割 | 現行コード参照 | 備考 |
| --- | --- | --- | --- |
| `EffectBase` | デメリット辞書の基準名。深淵遺物用のデメリット推定に利用される。 | ○（デメリット辞書のキーとして読込） | テンプレートで定義される。【F:templates/master_relics_demerit.csv†L1-L9】【F:relic_data.py†L207-L245】 |
| `Category` | デメリット種別のメモ。 | × | 現状の自動処理では未使用で、テンプレート上の分類メモのみ。【F:templates/master_relics_demerit.csv†L1-L9】 |
| `Overlap` | 重複可否メモ。 | × | 同上。 |
| `note` | デメリット内容の補足メモ。 | × | 同上。 |

## 出力CSV（OCR結果）のカラム

OCRパイプライン（`match_and_export.py` → `relic_pipeline.io.exporter`）は、エクスポートオプションと列表示フラグに応じて結果CSVを生成する。

### 基本メタデータ
| カラム名 | 役割 | 現行コード参照 | 出力条件・備考 |
| --- | --- | --- | --- |
| `Image` | 行の対象となる画像ファイル名。 | ○（常時生成） | `build_row` で必ず設定され、CSVの先頭列として書き出される。【F:relic_pipeline/io/exporter.py†L119-L137】【F:relic_pipeline/io/exporter.py†L229-L241】 |
| `Duplicate` | 同一画像が既に処理済みかどうかを示すフラグ。 | ○（常時生成） | 常に出力され、重複判定は `build_row` が付与する。【F:relic_pipeline/io/exporter.py†L119-L137】【F:relic_pipeline/io/exporter.py†L229-L241】 |
| `ItemColor` | 遺物の色区分。 | ○（列フラグで制御） | 列表示フラグが有効な場合に `ExportOptions.item_color` の値を格納する。選択肢は `red`/`yellow`/`green`/`blue`（未設定時は `none`）。【F:relic_pipeline/io/exporter.py†L122-L123】【F:templates/gallery.js†L8-L19】 |
| `RelicType` | 遺物の種別（通常/深淵など）。 | ○（列フラグで制御） | 列表示フラグが有効な場合に書き出される。ビューアで選択できる値は空文字（未設定）、`normal`、`deep`。【F:relic_pipeline/io/exporter.py†L124-L125】【F:templates/gallery.js†L15-L19】 |

### 効果スロット列
各スロット `n` について以下の列が並ぶ。スロット数はクロップ枚数に応じて `ExportOptions.slot_range` が決まり、`_ensure_effect_slots` が欠損を補完する。【F:match_and_export.py†L315-L334】【F:relic_pipeline/io/exporter.py†L75-L109】【F:relic_pipeline/io/exporter.py†L214-L244】

| カラム名 | 役割 | 現行コード参照 | 出力条件・備考 |
| --- | --- | --- | --- |
| `Effect{n}` | マッチした効果名。 | ○（常時生成） | スロットごとに必ず用意され、未検出時は空文字。【F:relic_pipeline/io/exporter.py†L119-L144】 |
| `Effect{n}Level` | 推定レベル。 | ○（常時生成） | 候補が得られない場合は空文字のまま。【F:relic_pipeline/io/exporter.py†L119-L144】 |
| `Effect{n}LevelOptions` | レベル候補の一覧。 | ○（列フラグで制御） | 列表示フラグ `LevelOptions` が有効な場合のみ出力される。【F:relic_pipeline/io/exporter.py†L164-L174】【F:relic_pipeline/io/exporter.py†L235-L240】 |
| `Effect{n}Status` | レビュー状況。初期値は `pending`。 | ○（常時生成） | 列表示フラグに関わらず生成され、レビュー時に更新される。【F:relic_pipeline/io/exporter.py†L131-L137】【F:relic_pipeline/io/exporter.py†L235-L241】 |
| `Effect{n}Kind` | 列の種別を示す識別子。 | ○（常時生成） | 現状すべて `effect` で初期化される。【F:relic_pipeline/io/exporter.py†L137-L138】【F:relic_pipeline/io/exporter.py†L235-L241】 |
| `Effect{n}LevelCorrection` | レベル訂正入力欄。 | ○（列フラグで制御） | 列表示フラグ `LevelCorrection` が有効なときに空欄で生成される。【F:relic_pipeline/io/exporter.py†L172-L174】【F:relic_pipeline/io/exporter.py†L245-L262】 |
| `RawText{n}` | OCR生テキスト。 | ○（列フラグで制御） | 列表示フラグ `RawText` が有効な場合に出力される。【F:relic_pipeline/io/exporter.py†L139-L144】【F:relic_pipeline/io/exporter.py†L245-L259】 |
| `Effect{n}Score` | マッチスコア。 | ○（列フラグで制御） | 列表示フラグ `Score` が有効な場合に出力される。【F:relic_pipeline/io/exporter.py†L139-L144】【F:relic_pipeline/io/exporter.py†L245-L259】 |
| `Effect{n}Source` | マッチ元情報。 | ○（列フラグで制御） | 列表示フラグ `Source` が有効な場合に出力される。【F:relic_pipeline/io/exporter.py†L139-L144】【F:relic_pipeline/io/exporter.py†L245-L259】 |

### デメリット列
| カラム名 | 役割 | 現行コード参照 | 出力条件・備考 |
| --- | --- | --- | --- |
| `Demerit{n}` | デメリットの効果名。 | ○（列定義あり） | デメリットスロットが指定されている場合に生成される。OCR結果が無い場合も空欄で列が維持される。【F:match_and_export.py†L320-L353】【F:relic_pipeline/io/exporter.py†L100-L107】【F:relic_pipeline/io/exporter.py†L146-L162】【F:relic_pipeline/io/exporter.py†L245-L259】 |
| `Demerit{n}Level` など | デメリットに紐づくレベルやスコア等の列。 | ○（列定義あり） | 効果スロット列と同様の命名規則で追加され、`_ensure_effect_slots` が欠損を補完する。【F:match_and_export.py†L320-L353】【F:relic_pipeline/io/exporter.py†L100-L107】【F:relic_pipeline/io/exporter.py†L146-L162】【F:relic_pipeline/io/exporter.py†L245-L259】 |

### 追加メタデータ列
| カラム名 | 役割 | 現行コード参照 | 出力条件・備考 |
| --- | --- | --- | --- |
| `Dataset` | 統合ビューアで利用するデータセット名。 | ○（列フラグで制御） | 列表示フラグで非表示にでき、`merge_results.py` で統合時に値を埋める。【F:relic_pipeline/io/exporter.py†L177-L186】【F:merge_results.py†L320-L353】 |
| `DatasetFolder` | データセットの元フォルダ。 | ○（列フラグで制御） | 同上。【F:relic_pipeline/io/exporter.py†L177-L186】【F:merge_results.py†L320-L353】 |
| `SourceCsv` | 元になったCSVファイルパス。 | ○（列フラグで制御） | 同上。【F:relic_pipeline/io/exporter.py†L177-L186】【F:merge_results.py†L320-L353】 |
| `SourceImage` | 元になった画像ファイルパス。 | ○（列フラグで制御） | 同上。【F:relic_pipeline/io/exporter.py†L177-L186】【F:merge_results.py†L320-L353】 |
| `BaseImage` | ビューアで参照する基準画像。 | ○（列フラグで制御） | 同上。【F:relic_pipeline/io/exporter.py†L177-L186】【F:merge_results.py†L320-L353】 |
| その他の列 | 入力行に存在する追加キー。 | ○（`write_csv` が維持） | `write_csv` がヘッダーに追加して保持する。レビュー担当者のメモなど任意の列を維持できる。【F:relic_pipeline/io/exporter.py†L264-L273】 |

### 列表示フラグ
GUIやCLIから列表示を切り替える場合、`DEFAULT_COLUMN_VISIBILITY` を基準に真偽値を上書きする。初期状態では RawText/Score/Source/LevelOptions/LevelCorrection などがすべて有効になっている。【F:relic_pipeline/settings.py†L15-L64】【F:relic_pipeline/io/exporter.py†L41-L61】


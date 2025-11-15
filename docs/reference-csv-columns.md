# CSVカラム仕様リファレンス

本ドキュメントでは、RelicListMaker で利用しているマスターCSVと、OCRパイプラインが出力するレビュー用CSVのカラム構成をまとめる。テンプレートの場所や列ごとの役割、動的に生成される列についての注意点を記載する。

## マスターCSVのカラム

### `templates/master_relics.csv`
| カラム名 | 役割 | 現行コード参照 | 備考 |
| --- | --- | --- | --- |
| `EffectBase` | 辞書照合の基準となる効果名。`load_master_csv` や `load_master_effects_and_levels` が既定列として読み込む。 | ○（`DEFAULT_MASTER_COLUMN` として常時読込） | `DEFAULT_MASTER_COLUMN` の定義により標準キーとして扱われる。【F:relic_data.py†L12-L204】 |
| `Category` | 効果を系統別に分類するためのラベル。 | × | 現在のコードからは参照されず、運用メモとして利用する。【F:templates/master_relics.csv†L1-L10】 |
| `Levels` | 効果ごとに許容される段階（+1、+2 など）の候補値。 | ○（レベル候補の構築に利用） | `load_master_effects_and_levels` が候補リストを構築し、`build_row` が `Effect{n}LevelOptions` を生成する際に参照する。未設定を表すプレースホルダーは `none` に統一されており、ビューアでは空欄として解釈される。【F:relic_data.py†L157-L204】【F:relic_pipeline/io/exporter.py†L164-L174】【F:templates/master_relics.csv†L1-L27】【F:templates/gallery/render/galleryView.js†L533-L568】 |
| `Overlap` | 効果の重複可否などを記録する運用メモ列。 | × | 自動処理では使用されず、テンプレート上で `〇`/`✕` を手入力する想定。【01e9e0†L1-L7】 |
| `Demerit` | デメリットの有無と発生段階を兼ねる列。 | ○（デメリット抽出に使用） | `_normalize_boolean_flag` と `_extract_level_tokens` を通じて `hasDemerit` と対応レベルを算出する。現状のテンプレートではすべて `FALSE` で常時デメリット無しとして扱われるが、`TRUE` や `＋１` などを指定すれば深淵版と同様に解釈される。【F:relic_data.py†L74-L126】【F:relic_data.py†L207-L245】【F:templates/master_relics.csv†L1-L35】 |
| `note` | 効果に関する自由記述メモ。 | × | テンプレート内に記載されるメモ列で、コードからは参照されない。【F:templates/master_relics.csv†L1-L10】 |

### `templates/master_relics_deep.csv`
| カラム名 | 役割 | 現行コード参照 | 備考 |
| --- | --- | --- | --- |
| `EffectBase` | 深淵遺物向け辞書の基準名。通常版と同様に `EffectBase` がキーになる。 | ○（通常辞書と同等に読込） | 共通テンプレートとして定義される。【F:templates/master_relics_deep.csv†L1-L6】 |
| `Category` | 効果区分のメモ列。 | × | 自動処理では未使用で、テンプレート上のメモとして扱う。【F:templates/master_relics_deep.csv†L1-L6】 |
| `Levels` | 深淵遺物専用のレベル候補。 | ○（レベル候補の構築に利用） | `load_master_effects_and_levels` は列の有無を自動判定し、未設定を表すプレースホルダーは `none` に統一されてビューアでは空欄として扱われる。【F:relic_data.py†L178-L204】【F:templates/master_relics_deep.csv†L1-L6】【F:templates/gallery/render/galleryView.js†L533-L568】 |
| `Overlap` | 重複可否のメモ列。 | × | テンプレート内のみで管理。【0bfb5e†L1-L10】 |
| `Demerit` | デメリットの有無と内容を兼ねる列。〇/✕ 等をブール値に変換しつつ、デメリット欄の文字列からレベル候補を抽出する。 | ○（デメリット抽出に使用） | `_normalize_boolean_flag` や `_extract_level_tokens` を通じて `hasDemerit` と `levels` を算出する。値は `TRUE` で常時デメリット有り、`FALSE` で常時無し、`＋１` などのレベル表記でその段階のみデメリット有りとする。【F:relic_data.py†L74-L126】【F:relic_data.py†L207-L245】【F:templates/master_relics_deep.csv†L1-L35】 |
| `Existing` | 通常版テンプレート（`templates/master_relics.csv`）にも同名効果が存在することを示すメモ列。 | × | テンプレートのヘッダーでのみ定義され、コードからは参照されない。【F:templates/master_relics_deep.csv†L1-L60】 |
| `note` | 効果の補足説明。 | × | テンプレート内に記入されるメモでコードは参照しない。【F:templates/master_relics_deep.csv†L1-L6】 |

### `templates/master_relics_demerit.csv`
| カラム名 | 役割 | 現行コード参照 | 備考 |
| --- | --- | --- | --- |
| `EffectBase` | デメリット辞書の基準名。深淵遺物用のデメリット推定に利用される。 | ○（デメリット辞書のキーとして読込） | テンプレートで定義される。【F:templates/master_relics_demerit.csv†L1-L9】【F:relic_data.py†L207-L245】 |
| `Category` | デメリット種別のメモ。 | × | 現状の自動処理では未使用で、テンプレート上の分類メモのみ。【F:templates/master_relics_demerit.csv†L1-L9】 |
| `Overlap` | 重複可否メモ。 | × | 同上。 |
| `note` | デメリット内容の補足メモ。 | × | 同上。 |

`templates/master_relics_demerit.csv` は効果名やカテゴリなどのメモ用途を中心としたテンプレートであり、デメリット列は存在しない。【F:templates/master_relics_demerit.csv†L1-L9】

## 出力CSV（OCR結果）のカラム

OCRパイプライン（`match_and_export.py` → `relic_pipeline.io.exporter`）は、エクスポートオプションと列表示フラグに応じて結果CSVを生成する。

### 基本メタデータ
| カラム名 | 役割 | 現行コード参照 | 出力条件・備考 | ビューア表示 |
| --- | --- | --- | --- | --- |
| `Image` | 行の対象となる画像ファイル名。 | ○（常時生成） | `build_row` で必ず設定され、CSVの先頭列として書き出される。【F:relic_pipeline/io/exporter.py†L119-L134】【F:relic_pipeline/io/exporter.py†L247-L300】 | 画像カードのサムネイルとファイル名表示に利用。【F:templates/gallery/render/itemFactory.js†L92-L192】【F:templates/gallery/render/itemFactory.js†L270-L288】 |
| `Duplicate` | 同一画像が既に処理済みかどうかを示すフラグ。 | ○（常時生成） | 常に出力され、重複判定は `build_row` が付与する。【F:relic_pipeline/io/exporter.py†L128-L144】【F:relic_pipeline/io/exporter.py†L247-L300】 | アイテム左側の重複トグルと重複表示切替に反映。【F:templates/gallery/render/itemFactory.js†L194-L211】【F:templates/gallery/render/galleryView.js†L618-L645】 |
| `ItemColor` | 遺物の色区分。 | ○（列フラグで制御） | 列表示フラグが有効な場合に `ExportOptions.item_color` の値を格納する。選択肢は `red`/`yellow`/`green`/`blue`（未設定時は `none`）。【F:relic_pipeline/io/exporter.py†L131-L134】【F:templates/gallery/gallery.js†L8-L19】 | アイテム左側の色セレクトと色別ハイライトに利用。【F:templates/gallery/render/itemFactory.js†L222-L245】【F:templates/gallery/render/galleryView.js†L547-L655】 |
| `RelicType` | 遺物の種別（通常/深淵など）。 | ○（列フラグで制御） | 列表示フラグが有効な場合に書き出される。未設定値は `none` としてCSVに保持し、ビューアでは空欄表示に変換される。選択肢としては `none`（未設定）、`normal`、`deep` を利用する。【F:relic_pipeline/io/exporter.py†L133-L134】【F:templates/gallery/gallery.js†L15-L19】【F:templates/gallery/render/galleryView.js†L533-L590】 | 種別セレクトと種別フィルターに利用。【F:templates/gallery/render/itemFactory.js†L248-L266】【F:templates/gallery/render/galleryView.js†L533-L663】 |

### 効果スロット列
各スロット `n` について以下の列が並ぶ。スロット数はクロップ枚数に応じて `ExportOptions.slot_range` が決まり、`_ensure_effect_slots` が欠損を補完する。【F:match_and_export.py†L313-L329】【F:relic_pipeline/io/exporter.py†L75-L117】【F:relic_pipeline/io/exporter.py†L232-L301】

| カラム名 | 役割 | 現行コード参照 | 出力条件・備考 | ビューア表示 |
| --- | --- | --- | --- | --- |
| `Effect{n}` | 最新の効果名。 | ○（常時生成） | スロットごとの最終確定値を保持する。OCR直後はマッチ結果で初期化され、ビューアでのレビュー後は補正済みの内容に更新される。未検出時は空文字。【F:relic_pipeline/io/exporter.py†L140-L151】【F:templates/gallery/render/effectFactory.js†L181-L221】【F:templates/gallery/events/recordActionHandlers.js†L404-L503】 | 効果カードの推定欄に表示。【F:templates/gallery/render/effectFactory.js†L612-L707】 |
| `Effect{n}Level` | 最新のレベル。 | ○（常時生成） | スロットごとの最終確定値を保持する。OCR直後はマッチ結果で初期化され、ビューアでのレビュー後は補正済みの内容に更新される。未設定時は `none` が記録され、空欄は使用しない。レベルを持たない効果についても `Effect{n}Level` 自体は `none` を保持し続ける。【F:relic_pipeline/io/exporter.py†L153-L165】【F:templates/gallery/render/effectFactory.js†L204-L221】 | レベルバッジとレベルセレクトの初期値として表示。【F:templates/gallery/render/effectFactory.js†L612-L779】【F:templates/gallery/render/effectFactory.js†L780-L835】 |
| `Effect{n}LevelSource` | レベルのマッチ元情報。 | ○（列フラグで制御） | OCR照合で得た原本テキストから段階を復元した値を保持し、未設定時は `none` に正規化される。レビュー後も初期マッチ値を参照でき、ビューア側で保存する際も `none` へ揃えられる。【F:relic_pipeline/io/exporter.py†L161-L188】【F:viewer_server/storage.py†L30-L88】 | 推定欄（`.prediction`）で `Effect{n}LevelSource` のラベル付きテキストとして表示され、`none` や空値は `--` に置き換えられる。【F:templates/gallery/render/effectFactory.js†L705-L759】 |
| `Effect{n}LevelOptions` | レベル候補の一覧。 | ○（列フラグで制御） | 列表示フラグ `LevelOptions` が有効な場合のみ出力される。候補が検出できなかった場合でも空欄は使わず、必ず `none` を書き出す。ビューア上では `templates/gallery/render/effectViewModel.js` が `none` を候補から除外し、`templates/gallery/render/effectFactory.js` が `none` しかない場合にセレクトを無効化するため、CSVの値は `none` を保持したまま UI 上では入力欄が空欄として扱われる。【F:relic_pipeline/io/exporter.py†L89-L107】【F:relic_pipeline/io/exporter.py†L158-L165】【F:relic_pipeline/io/exporter.py†L253-L285】【F:templates/gallery/render/effectViewModel.js†L2-L195】【F:templates/gallery/render/effectFactory.js†L63-L137】【F:templates/gallery/render/effectFactory.js†L722-L751】 | レベルセレクトの候補リストとバッジ表示に利用。【F:templates/gallery/render/effectFactory.js†L612-L779】【F:templates/gallery/render/effectFactory.js†L780-L835】 |
| `Effect{n}Status` | レビュー状況。初期値は `pending`。 | ○（常時生成） | `build_row` が必ず `pending` で初期化し、ビューア読み込み時は訂正欄が埋まっている行を `corrected` として扱う。【F:relic_pipeline/io/exporter.py†L140-L170】【F:templates/gallery/render/effectViewModel.js†L24-L159】 効果名やレベルの訂正を入力すると `corrected` に更新され、訂正が空に戻れば `pending` に戻る。【F:templates/gallery/events/recordActionHandlers.js†L432-L620】 パスボタンで `pass` を付与・解除でき、承認時には補正値やレベル抑制をクリアして保存をスケジュールする。各更新は `recordStatusChange` がCSV行に反映し保存キューへ積む。【F:templates/gallery/gallery.js†L2195-L2214】 | ステータスインジケーターと合致/保留ボタンの選択状態に反映。【F:templates/gallery/render/effectFactory.js†L612-L650】【F:templates/gallery/render/effectFactory.js†L842-L855】 |
| `Effect{n}Kind` | 列の種別を示す識別子。 | ○（常時生成） | 現状すべて `effect` で初期化される。【F:relic_pipeline/io/exporter.py†L87-L116】【F:relic_pipeline/io/exporter.py†L140-L170】【F:relic_pipeline/io/exporter.py†L253-L259】 | 表示なし |
| `RawText{n}` | OCR生テキスト。 | ○（列フラグで制御） | 列表示フラグ `RawText` が有効な場合に出力される。【F:relic_pipeline/io/exporter.py†L146-L188】【F:relic_pipeline/io/exporter.py†L269-L285】 | 効果カードの「OCR: ～ / 一致度 ～」行に表示。【F:templates/gallery/render/effectFactory.js†L711-L718】 |
| `Effect{n}Score` | マッチスコア。 | ○（列フラグで制御） | 列表示フラグ `Score` が有効な場合に出力される。【F:relic_pipeline/io/exporter.py†L148-L188】【F:relic_pipeline/io/exporter.py†L275-L278】 | 効果カードの「OCR: ～ / 一致度 ～」行に表示。【F:templates/gallery/render/effectFactory.js†L711-L718】 |
| `Effect{n}Source` | マッチ元情報。 | ○（列フラグで制御） | OCR照合で得た原本テキストを保持する列。レビューで `Effect{n}` が更新された後も初期マッチ値を参照できる。列表示フラグ `Source` が有効な場合に出力される。【F:relic_pipeline/io/exporter.py†L150-L188】【F:relic_pipeline/io/exporter.py†L279-L285】 | 推定欄（`.prediction`）で `Effect{n}Source` のラベル付きテキストとして表示され、`none` や空値は `--` に置き換えられる。【F:templates/gallery/render/effectFactory.js†L705-L759】 |

### デメリット列
| カラム名 | 役割 | 現行コード参照 | 出力条件・備考 | ビューア表示 |
| --- | --- | --- | --- | --- |
| `Demerit{n}` | 最新のデメリット名。 | ○（列定義あり） | デメリットスロットが指定されている場合に生成される。OCR直後はマッチ結果で初期化され、ビューアでのレビュー後は補正済みの内容に更新される。デメリットが存在しない場合は空欄のまま保持され、未設定プレースホルダーには `none` を用いる。【F:match_and_export.py†L348-L371】【F:relic_pipeline/io/exporter.py†L101-L188】【F:relic_pipeline/io/exporter.py†L279-L285】【F:templates/gallery/render/effectFactory.js†L238-L356】 | デメリットカードの推定欄に表示。【F:templates/gallery/render/effectFactory.js†L612-L707】【F:templates/gallery/render/effectViewModel.js†L44-L104】 |
| `Demerit{n}Level` など | デメリットに紐づくレベルやスコア等の列。 | ○（列定義あり） | 効果スロット列と同様の命名規則で追加され、`_ensure_effect_slots` が欠損を補完する。【F:match_and_export.py†L348-L371】【F:relic_pipeline/io/exporter.py†L101-L117】【F:relic_pipeline/io/exporter.py†L166-L188】【F:relic_pipeline/io/exporter.py†L253-L290】 | 表示なし |
| `Demerit{n}Status` | デメリットのレビュー状況。初期値は `pending`。 | ○（ビューアで更新） | デメリット補正欄に入力が入ると `corrected` が適用され、空に戻すと `pending` へ戻る。【F:templates/gallery/render/effectViewModel.js†L24-L103】【F:templates/gallery/events/recordActionHandlers.js†L432-L620】 パスボタンは `pending`⇔`pass` を切り替え、承認すると関連する訂正値を消去した上で保存をスケジュールする。これらの状態変更は `recordStatusChange` がCSV行に書き戻し、保存キューへ積む。【F:templates/gallery/gallery.js†L2195-L2214】 | デメリットカードのステータス表示とボタン状態に反映。【F:templates/gallery/render/effectFactory.js†L612-L650】【F:templates/gallery/render/effectFactory.js†L842-L855】 |
| `Demerit{n}Source` | デメリット名のマッチ元情報。 | ○（列定義あり） | OCR照合で得た原本テキストを保持する。レビュー後に `Demerit{n}` が更新された後も初期マッチ値を参照できる。列表示フラグ `Source` が有効な場合に出力される。【F:match_and_export.py†L348-L371】【F:relic_pipeline/io/exporter.py†L150-L188】【F:relic_pipeline/io/exporter.py†L279-L285】 | 推定欄（`.prediction`）で `Demerit{n}Source` のラベル付きテキストとして表示され、`none` や空値は `--` に置き換えられる。【F:templates/gallery/render/effectFactory.js†L705-L759】 |
| `Demerit{n}LevelSource` | デメリットレベルのマッチ元情報。 | ○（列定義あり） | デメリットの段階について OCR 照合で得た原本テキストを保持し、未設定時は `none` に正規化される。列表示フラグ `Source` が有効な場合に出力される。【F:match_and_export.py†L348-L371】【F:relic_pipeline/io/exporter.py†L166-L188】【F:relic_pipeline/io/exporter.py†L279-L285】 | 推定欄（`.prediction`）で `Demerit{n}LevelSource` のラベル付きテキストとして表示され、`none` や空値は `--` に置き換えられる。【F:templates/gallery/render/effectFactory.js†L705-L759】 |

### 追加メタデータ列
| カラム名 | 役割 | 現行コード参照 | 出力条件・備考 | ビューア表示 |
| --- | --- | --- | --- | --- |
| `Dataset` | 統合ビューアで利用するデータセット名。 | ○（列フラグで制御） | 列表示フラグで非表示にでき、`merge_results.py` で統合時に値を埋める。【F:relic_pipeline/io/exporter.py†L195-L204】【F:merge_results.py†L320-L352】 | 統合ビューア時のデータセットバッジとして表示。【F:templates/gallery/render/itemFactory.js†L270-L288】 |
| `DatasetFolder` | データセットの元フォルダ。 | ○（列フラグで制御） | 同上。【F:relic_pipeline/io/exporter.py†L195-L204】【F:merge_results.py†L320-L352】 | データセットバッジのツールチップに表示。【F:templates/gallery/render/itemFactory.js†L270-L288】 |
| `SourceCsv` | 元になったCSVファイルパス。 | ○（列フラグで制御） | 同上。【F:relic_pipeline/io/exporter.py†L195-L204】【F:merge_results.py†L320-L352】 | 表示なし |
| `SourceImage` | 元になった画像ファイルパス。 | ○（列フラグで制御） | 同上。【F:relic_pipeline/io/exporter.py†L195-L204】【F:merge_results.py†L320-L352】 | 表示なし |
| `BaseImage` | ビューアで参照する基準画像。 | ○（列フラグで制御） | 同上。【F:relic_pipeline/io/exporter.py†L195-L204】【F:merge_results.py†L320-L352】 | ファイル名表示の優先名称として利用。【F:templates/gallery/render/itemFactory.js†L92-L113】【F:templates/gallery/render/itemFactory.js†L270-L288】 |
| その他の列 | 入力行に存在する追加キー。 | ○（`write_csv` が維持） | `write_csv` がヘッダーに追加して保持する。レビュー担当者のメモなど任意の列を維持できる。【F:relic_pipeline/io/exporter.py†L292-L300】 | 表示なし |

### 列表示フラグ
GUIやCLIから列表示を切り替える場合、`DEFAULT_COLUMN_VISIBILITY` を基準に真偽値を上書きする。初期状態では RawText/Score/Source/LevelOptions などがすべて有効になっている。【F:relic_pipeline/settings.py†L15-L28】【F:relic_pipeline/io/exporter.py†L41-L61】 数値や文字列で指定したオーバーライド（`1`/`0`、`true`/`false`、`yes`/`no` など）も `parse_column_flag_value` が正しく解釈する。【F:relic_pipeline/io/exporter.py†L18-L61】


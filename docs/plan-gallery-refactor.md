# gallery.js リファクタリング設計方針

## 目的
- 巨大な `templates/gallery.js`（約 3,200 行）を責務ごとに分割し、単一責任・高凝集・低結合を実現する。
- UI 表示ロジックと状態／データ処理ロジックを分離し、テスト可能な純粋関数を増やす。
- 今後の拡張（効果スロットの追加、フィルタ条件の増加、ストレージ方式の変更）に備えた柔軟なアーキテクチャを用意する。

## 現状整理（要約）
- IIFE 内に状態管理、データセット解決、DOM 構築、イベント登録、バックエンド連携を集約。
- `state` と `dom` の共有が密で、副作用の把握が困難。
- `buildGallery` / `createItem` / `createEffect` などが 100 行以上となりテストが難しい。
- ユーティリティ関数が散在し、重複処理や似た命名が混在。

## テストと検証
- 各ステップでの修正が完了したら必ず `npm run test:all` を実行し、Python・Node・Playwright の一括テストが全て成功することを確認する。
- 個別調査が必要な場合のみ `pytest` / `npm run test:node` / `npm run test:browser` を使い分ける。
- Playwright が未セットアップの環境では、回帰確認のために `pytest` と `node --test tests/js/gallery_modules.test.mjs` を個別に実行する。

## 進捗ログ

| 日付 | トピック | メモ |
| --- | --- | --- |
| 2025-10-26 | モジュール分割完了 | `templates/gallery/` 配下のモジュール分割を確認し、`index.js` エントリポイントからの依存が解決されていることをレビュー済み。 |
| 2025-10-28 | ドキュメント整理 | フォーカス事項・未解決課題・テストフローを最新化し、後続作業者が参照できるよう整理した。 |
| 2025-10-29 | テスト/フィクスチャ検証 | `npm run test:all` を実行し、Python/Node テストは成功。Playwright はブラウザバイナリ未取得により失敗したため、`docs/guide-testing.md` に従って代替手順（`pytest` + `node --test`）を充足済みであることを記録。合わせて `tests/browser/serve_fixture.py` が `templates/gallery/index.js` の `MODULE_DEPENDENCIES` と同一リストをコピーしていることを再確認し、更新不要と判断。 |
| 2025-11-03 | Python 生成スクリプト調査 | `generate_gallery.py::generate_html` の責務集中を分析し、データ整形・アセットコピー・テンプレート変換の分割計画を本ドキュメントへ追加。今後のテスト方針（`pytest` + `npm run test:node`）と進捗記録手順を整理した。 |
| 2025-11-04 | 生成スクリプト実装・検証 | `gallery_assets.py` を新設してアセット準備を集約し、`build_gallery_payload`・`render_gallery_template` を導入。`pytest` と `npm run test:node` は成功、Playwright はブラウザ未取得のため失敗（代替手順適用済み）と記録。 |
| 2025-11-05 | データセットビルダー導入 | `datasets/builder.py` を追加し、`ProcessedVideoResult` / `DatasetBuildResult` と `build_dataset_entries` を実装。`pipeline/processors.py`・`pipeline/pipeline.py` を更新してビルダー経由でデータセットを生成し、`tests/test_dataset_builder.py` を新設。`pytest` で回帰確認済み。 |

## 実行計画

### ロードマップ概要
| ステップ | 状態 | 主な内容 |
| --- | --- | --- |
| 1 | ✅ 完了 | 設計ドキュメントの整備とビルド手順の検証。 |
| 2 | ✅ 完了 | `createItem` 周辺の描画ロジック分割とヘルパー化。 |
| 3 | ✅ 完了 | `createEffect` 周辺の描画ロジック分割とビューモデル導入。 |
| 4 | ✅ 完了 | DOM/データ処理ユーティリティの再編とレコード管理ヘルパーの共有化。 |
| 5 | ✅ 完了 | 状態・データセット・永続化レイヤの完全分離と API 化。 |
| 6 | ✅ 完了 | エントリポイント刷新とモジュール読込方式の最終統合。 |

### フォーカスすべき次アクション
1. **回帰テストの継続**: 各ステップ完了時に `npm run test:all` を実行し、ES Modules 化後のリグレッションを監視する。Playwright のブラウザ未取得環境では `docs/guide-testing.md` の代替フロー（`pytest` / `node --test`）を用いて最低限の回帰確認を確保する。最新の実行（2025-11-04）は Python/Node が成功し、Playwright はブラウザバイナリ不足で失敗したため、環境差異の記録とフォローアップを継続する。
2. **ブラウザフィクスチャの確認**: Playwright フィクスチャが新しいエントリポイント (`gallery/index.js`) を正しく取り込めているかを今後の変更時にもチェックする。2025-10-29 時点では `tests/browser/serve_fixture.py` の複製対象が `MODULE_DEPENDENCIES` と一致していることを再確認済み。必要に応じて `tests/browser/` 配下のフィクスチャ更新履歴を追記する。
3. **配布バンドルの最適化検討**: モジュール統合が完了したため、必要であればビルド／バンドル戦略（Vite 等）の導入可否を評価し、判断結果を本ドキュメントへ記録する。新しいアセット準備モジュールの導入に伴い、コピー対象とバンドル戦略の見直しを行う際は `gallery_assets.py` の API 更新もセットで検討する。
4. **旧テンプレートの洗い出し**: `gallery.js` を直接読み込むレガシー HTML が残っていないか確認し、新依存構成への移行手順を整理する。
5. **現行構成の確認（2025-10-26）**: `templates/gallery/` 配下の各モジュール（`utils/dom.js`、`render/galleryView.js`、`events/galleryEvents.js` など）が計画通り分割済みであり、`templates/gallery/index.js` から依存解決されていることをレビューで確認した。直近で追加のリファクタリングは不要と判断。
6. **ドキュメント更新の継続**: この計画書と関連ドキュメントに、完了したステップ・新たに発生した課題・対応中のリスクを継続的に反映する。
7. ✅ **データセット生成フローの共通化（2025-11-05）**: `datasets/builder.py` と `build_dataset_entries` を導入し、パイプライン・GUI で共有できるデータセット整形 API を確立。`ProcessVideoResult` は相対パス変換をビルダーへ移譲し、HTML 生成との接続点が単純化された。

### 完了済みハイライト
- **初期化と基盤整備**: `viewer_server.py` を含む読み込み経路を確認し、新規モジュールを `generate_gallery.py` やブラウザフィクスチャへ反映。
- **描画レイヤの再構成**: `render/galleryView.js` から `itemFactory`・`itemEnhancers`・`effectFactory` へ責務を分割し、左右カラムやエフェクト表示を純粋関数へ移行。
- **フィルタ／検索の純化**: `applyFilters` と検索キャッシュを `utils/filter.js` へ切り出し、Node テストを追加して回帰を抑止。
- **イベントとアクション処理の整理**: `events/galleryEvents.js` をハンドラ単位へ再編し、`events/recordActionHandlers.js` に操作ロジックを集約。お気に入り・色分け・レビュー操作のテストを強化。
- **レコード・重複管理の共有化**: `templates/gallery/utils/records.js` と `templates/gallery/storage/utils.js` を新設し、ギャラリー本体からヘルパーを排除。フォールバックスタブを明示して依存を整理。
- **DOM/ストレージユーティリティの統合**: `templates/gallery/utils/dom.js` にファクトリを導入し、`templates/gallery.js` からのフォールバック実装を撤廃。`window.galleryStorageUtils` の API を必須依存として扱い、Node テストで依存注入経路を検証。
- **データ正規化の拡充**: `utils/data.js` に抑制レベル正規化を追加し、旧 CSV/OPFS データの互換性を担保。データセット解析ユーティリティを `dataset/utils.js` へ集約しテストを整備。
- **データセット依存の一本化**: `templates/gallery.js` のデータセットユーティリティ内蔵フォールバックを廃止し、`galleryDatasetUtilsFactory` 提供モジュールを必須依存として採用。重複実装を削除して整合性を向上。
- **データユーティリティの一本化**: `templates/gallery.js` からレベル正規化やマスター候補解析のフォールバック実装を排除し、`galleryDataUtils` が提供する純粋関数を必須依存として扱う。欠落時は明示的に例外を送出し、モジュール実装との乖離を防止。
- **テスト体制の強化**: `tests/js/gallery_modules.test.mjs` でフィルタ・アイテム生成・効果レベル処理などのシナリオを網羅し、保存トリガーや候補リセットを検証。
- **状態管理と永続化の抽象化**: `app/stateApi.js` と `storage/manager.js` を導入し、`gallery.js` から直接状態や OPFS 実装へアクセスしない構造に更新。描画・イベント層へ API を注入し、Node テストでモック差し替えが容易な設計に整えた。
- **ES Modules エントリポイントの整備**: `templates/gallery/index.js` を追加し、HTML テンプレートを `<script type="module">` で読み込む構成に更新。動的 import で `gallery.js` を初期化しつつ依存モジュールの読み込み順序を保証し、`generate_gallery.py` と Playwright フィクスチャを新構成に合わせて更新した。
- **データセット生成のモジュール化**: `datasets/builder.py` を経由して `ProcessedVideoResult` を `build_dataset_entries` で集約し、`pipeline/pipeline.py` から HTML 生成へ渡すデータ構造を統一。Python ユニットテストで相対パス整形とメタデータ統合を検証済み。

### 参考メモ（完了タスク詳細）
- `render/itemFactory.js` で画像列・操作列をコンポーネント分割し、プレースホルダー生成を委譲。
- `render/itemEnhancers.js` を独立モジュール化し、副作用の実行順制御と差し替え容易性を確保。
- `render/effectViewModel.js` を導入して `effectFactory` の純粋ロジックを委譲、レベル候補処理を共有化。
- `events/recordActionHandlers.js` に効果レベル／補正更新のテストシナリオを追加し、CSV 永続化のモック戦略を整理。
- `utils/filter.js`・`dataset/utils.js` の導入に合わせ、テンプレート・生成スクリプト・ブラウザフィクスチャを更新済み。

## 設計ポリシー
### 基本方針
1. **責務ベースでモジュール化**: 状態管理・データセット・描画・永続化・イベントを明確に分割する。
2. **UI とロジックの分離**: DOM 操作を司るレイヤと、データ加工や判定を行うレイヤを分け、後者を純粋関数化。
3. **依存方向の固定化**: 下位モジュール（ユーティリティ／データ処理）から上位モジュール（描画／イベント）へ一方向の依存に制限。
4. **ES Modules 化**: `templates/gallery.js` をエントリポイント (`index.js`) とし、`<script type="module">` で読み込む想定に切り替える。
5. **テスト容易性の向上**: ロジックモジュールは `tests/` 配下から直接 import できる構造に変更し、ユニットテストを追加しやすくする。

### DOM / 状態ユーティリティ統合
- 初期化シーケンスを `templates/gallery/app/controller.js` で受け持ち、ギャラリー側ではファクトリ経由で起動（フォールバックあり）。
- データセット切替ロジックを `templates/gallery/dataset/manager.js` に切り出し、ギャラリー側ではファクトリ経由 + フォールバックで利用。
- CSV 読み込み・結合ローダー・保存マネージャを `templates/gallery/storage/utils.js` として分離し、ギャラリー側では `window.galleryStorageUtils` を必須依存として注入する。
- 状態管理を `templates/gallery/state/store.js` に切り出し、`window.galleryStateStoreFactory` 経由で `createStateStore` を利用できるようにした（ギャラリー本体ではフォールバックを維持）。
- DOM ユーティリティを `templates/gallery/utils/dom.js` に集約し、`window.galleryDomUtilsFactory` から生成して利用する構造へ更新（フォールバックを廃して明示的な依存注入に移行）。
- **DOM ヘルパー再編**: `ensureElement` / `clearChildren` / `applyInlineStyles` などの DOM 操作関数を `templates/gallery/utils/dom.js` に集約し、返り値と副作用を明示的にする。要素の生成 (`createElement`) と属性付与を小さな純粋関数として切り出し、描画モジュールから利用。
- **イベント依存の排除**: DOM ユーティリティはイベント登録を内包しない。イベントモジュールにてユーティリティを組み合わせ、テスト時は仮想 DOM 上で独立検証できるようにする。
- **状態ストア設計**: `state`, `datasetState`, `duplicates`, `favorites` などの管理を `state/store.js` に集約し、読み取り/書き込み API (`getState`, `updateState`, `subscribe`) を提供。直接プロパティへアクセスしないよう呼び出し側を段階的に移行。
- **派生状態の扱い**: 検索キャッシュ・重複フラグなどは selector 的関数を別モジュールに定義し、UI レンダリング時に利用。副作用を持つ更新処理は store 内で完結させる。
- **永続化との境界**: ストレージ層は store 経由で同期し、DOM 側から直接フェッチ/保存を呼び出さない。これによりユニットテストでストレージをモック化しやすくする。
- **移行ステップ**: 既存のユーティリティ関数の利用箇所を調査し、`domUtils` / `stateStore` 相当の即時実行ブロックを廃止。まずは新モジュールを追加し、旧関数をラップする薄い層を用意して互換性を維持しつつ置き換えを進める。

## アーキテクチャ設計
### モジュール構成
| レイヤ | モジュール案 | 主な責務 |
| --- | --- | --- |
| エントリ | `templates/gallery/index.js` | 初期化フロー、依存モジュールの組み上げ、起動。 |
| 状態 | `templates/gallery/state/store.js` | データセット情報、フィルタ、重複フラグなどアプリ状態の読み書き。 |
| データセット | `templates/gallery/dataset/manager.js` | `parseDatasets`・`switchDataset` に相当するデータセット解決ロジック。 |
| データセット | `templates/gallery/dataset/utils.js` | データセット一覧の正規化・ソース比較ユーティリティ。 |
| 永続化 | `templates/gallery/storage/csvPersistence.js` | CSV 読込／保存、OPFS・fetch 連携。 |
| UI 构築 | `templates/gallery/render/galleryView.js` | `buildGallery` の分割版。 |
| UI 部品 | `templates/gallery/render/itemFactory.js` | `createItem` の DOM 組み立て部分（副作用を限定）。 |
| UI 部品 | `templates/gallery/render/effectFactory.js` | `createEffect` の DOM 組み立て部分。 |
| UI 部品 | `templates/gallery/render/itemEnhancers.js` | アイテム生成後の副作用を順序制御するエンハンサ配列の構築。 |
| イベント | `templates/gallery/events/galleryEvents.js`, `templates/gallery/events/recordActionHandlers.js` | クリック・入力イベントの登録とレコード操作ハンドラの委譲。 |
| ユーティリティ | `templates/gallery/utils/dom.js` | DOM 系共通関数（`ensureElement` など）。 |
| ユーティリティ | `templates/gallery/utils/data.js` | 正規化・補助ロジック（`sanitizeLevelList` 等）。 |

> ※ 既存ユーティリティの多くは純粋関数化し、`utils/` 配下へ移動する想定。

### 依存ガイドライン
- `utils/*` は他の全レイヤから利用可能。  
- `dataset/manager` と `storage/*` は `state/store` に依存しない（パラメータで受け取る）。  
- `render/*` は `state`・`dom` に依存するが、DOM生成と状態更新を分け、生成部分は純粋関数を目指す。  
- `events/*` は `render/*` や `state/store` を利用し、最下層ユーティリティへは依存しない。  
- `index.js` は各モジュールを初期化順に呼び出すアプリケーションルートとして振る舞う。

### 依存関係調査（2024-02-14）
#### レンダリング（`buildGallery`〜`createEffect`）
- `templates/gallery.js:1911` `buildGallery` は `state.records` / `duplicates` / `dom.gallery` / `createItem` / `updateSummary` / `applyFilters` に依存し、副作用として `state.items` を再生成する。
- `templates/gallery.js:1957` `createItem` ブロックは `bindImage` / `syncDuplicateState` / `syncFavoriteState` / `syncItemColorState` / `refreshItemCaches` と `datasetState.kind` を参照し、左右カラムを DOM 生成する。
- `templates/gallery.js:2133` `appendItemEffects` 〜 `createEffect` は `state.labelSymbols` / `datasetState.kind` / `applyMasterLevelOptions` / `updateEffectStatus` / `levelChangeHandler` など多数の補助関数を前提に DOM を構築し、マスターデータ取得後の再描画が必要。

#### イベントハンドラ
- `templates/gallery.js:3248` `attachEventHandlers` は `dom.datasetSelect` / `dom.gallery` / `dom.lightbox` 等の参照と `switchDataset` / `handleDuplicateToggle` / `recordStatusChange` / `updateRecordCorrection` 系の状態更新関数に依存する。
- 各イベントハンドラは DOM クエリ (`closest`) と `state` 更新 (`setRecordDuplicate` 等) を組み合わせており、副作用を持つコールバックを注入できる構造が必要。

#### 状態・データユーティリティ
- `templates/gallery/dataset/utils.js` で `parseDatasets` / `resolveDatasetState` / `areSourcesEqual` を提供し、`templates/gallery.js` は `window.galleryDatasetUtils` フォールバックを介して参照する構造に更新した。
- `templates/gallery.js:342` 以降の DOM / データフォールバックは `window.galleryDomUtils` / `window.galleryDataUtils` が未登録の場合に備えているが、モジュール化後は依存を明示して注入する構造に切り替えられる。

## テスト戦略
- ロジック切り出し後に `tests/` 以下でユニットテストを追加。特に以下を対象とする。  
  - データセット解決（`normalizeDatasetEntry` など）。  
  - 文字列正規化／レベル候補処理。  
  - ステータス更新／補正値の適用。  
- DOM 組み立ては Jest + JSDOM などを導入可能な場合、簡易的なスナップショットテストを検討。
- ブラウザ挙動は Playwright による自動テスト（`npm run test:browser`）で主要操作をカバーする。フィクスチャ生成とサーバ起動は `tests/browser/serve_fixture.py` が担い、CI（`.github/workflows/tests.yml`）でも同コマンドを実行する。手動確認が必要なシナリオは README などに追記して補足する。

## リスクと対応
- **ES Modules 化による互換性**: HTML テンプレートとビルドパイプラインを確認し、`type="module"` への切り替えが可能か事前検証する。難しい場合はバンドラ導入（Vite 等）も検討。
- **作業の断続的適用**: 各ステップ後に `gallery.js` から該当責務を切り出し、挙動確認を挟む。常にブラウザでの動作チェックを前提に進める。
- **依存関係の把握不足**: 初期段階で関数一覧と利用箇所を把握し、段階的な分割で副作用を限定する。
- **未完了タスクの可視化不足**: 計画書への更新漏れがあると進捗が把握しづらくなるため、ステップ完了・課題発見の都度「進捗ログ」と「フォーカスすべき次アクション」を更新する。
- **テストフローの分断**: Playwright 未導入環境では `npm run test:all` が失敗するケースがあるため、代替手順（`pytest` + `node --test`）を明示し、`docs/guide-testing.md` との整合を維持する。

## ペンディング課題
- `templates/gallery/storage/manager.js` の OPFS 連携と CSV 保存の両立パスについて、テストデータ不足により長期動作検証が未完。追加のサンプルセットを収集し、検証結果を記録する。
- Playwright フィクスチャのセットアップコスト削減策（ブラウザバイナリの事前キャッシュ等）を検討し、実施する場合は `docs/guide-testing.md` に反映する。

## 生成スクリプトとテンプレートの責務整理（2024-03-12）

### HTML テンプレート処理レイヤ
- `generate_gallery.py::generate_html` は `templates/gallery.html` を `_load_text_asset` で読み込み、`__RESULTS_CSV__` や `__CSS_FILE__` などのプレースホルダーを `json.dumps` 済みの値で順次置換する。
- `gallery_assets.copy_static_asset` と `gallery_assets.cache_bust_reference` を介し、`gallery/index.js`・`gallery.js`・`gallery.css` を出力先へコピーしてから、タイムスタンプに基づくクエリパラメータを付与して参照リンクを書き換える。
- HTML への埋め込みは data-* 属性に集約されており、テンプレート入れ替え時はここで提供するキー（結果 CSV、画像ディレクトリ、マスター定義、データセット一覧、表示範囲など）を互換的に維持する必要がある。

### データ整形レイヤ
- `_normalize_dataset_entries` が `datasets` 引数を正規化し、結果ディレクトリに対する相対パス・推奨ラベル・フォルダ情報を求める。辞書／リスト／タプルの混在入力に対応し、`kind` や `sources` を保持したまま統一スキーマへ変換する。
- `generate_html` 本体ではマスター CSV / JSON の読込を `load_master_csv`・`load_master_json` へ委譲し、空欄時のフォールバックと `_normalize_item_image_view_box` による `object-view-box` の安全化を担う。
- 複数データセットが渡された場合は、暗黙の統合エントリを生成し `sources` を保持することでテンプレート側の merged 表示へ引き渡す。ここがデータ整形レイヤの最終境界となり、以降のテンプレート差し替えでも JSON 形式を維持すれば互換性を保てる。

### ファイル出力レイヤ
- 静的アセット（CSS・JS）は `gallery_assets.copy_static_asset` でコピーし、`ADDITIONAL_GALLERY_SCRIPTS` に列挙したモジュール群を `gallery_assets.copy_gallery_modules` がまるごと複製する。コピー先のディレクトリ作成まで同関数が面倒を見る。
- 最終的な HTML は `generate_html` 末尾で `with open(output_html, "w", encoding="utf-8")` により書き出される。ここではテンプレート置換後のテキストをそのまま出力し、それ以外の副作用（ログ出力のみ）を持たないため、ファイル出力レイヤは純粋に I/O のみを担当している。
- これら 3 つのレイヤが境界として機能し、テンプレート変更時は「データ整形→テンプレート埋め込み→ファイル出力」の順序を壊さないことが、生成パイプラインの保守容易性に直結する。

## データセット構築ユーティリティの実装状況（2025-11-05）

### 実装概要
- `datasets/builder.py` に `ProcessedVideoResult` / `DatasetBuildResult` と `build_dataset_entries` を追加し、動画処理結果からギャラリー向けデータセットを生成する責務を専用モジュールへ集約した。
- `ProcessedVideoResult` は `label`・`csv_path`・`crops_dir`・`output_dir`・`relic_type`・`metadata` を保持し、生成時にパスの絶対化とラベル整形を完了させるデータクラスとして実装。
- `build_dataset_entries` は `base_dir` を基準に相対パスを算出しつつ、`metadata` に含まれる `kind` や `sources` をマージする。`csv` / `img_dir` / `folder` など主要キーは保護し、戻り値としてデフォルト CSV パス・画像ディレクトリ・アクティブインデックスを `DatasetBuildResult` で返却する。
- `pipeline/processors.py` は `ProcessedVideoResult` を返却するよう更新し、相対パス整形はビルダーへ委譲。`pipeline/pipeline.py` では `build_dataset_entries` の結果を `generate_html` に渡す構成へ切り替えた。

### テスト整備
- `tests/test_dataset_builder.py` を新設し、ラベルのトリミング、相対パス整形、メタデータ統合、空結果時のデフォルト値などを検証。
- `tests/pipeline/test_processors.py` を更新し、`ProcessVideoResult` が想定どおりのパス情報とリリックタイプを保持することを確認した。

### 今後の確認ポイント
- GUI や既存結果ディレクトリ再利用パスでの挙動をカバーする追加シナリオテストが必要になった場合は、本節に追記して対応状況を管理する。
- `ProcessedVideoResult.metadata` に `imgDir` など異なるキー表記が渡されるケースが発生した場合、互換マッピングの追加を検討する。

## 追加メモ: generate_gallery.py リファクタリング計画（2025-11-03）

### コード分析
- `generate_html` はマスター辞書読み込み、データセット正規化、静的アセットコピー、テンプレートプレースホルダー置換、HTML 書き出しを単一関数で担っている。
- `_normalize_dataset_entries` の戻り値を加工して `datasets_payload` を生成する過程で、JSON エンコードや `object-view-box` 補正などデータ整形とテンプレート整形が混在している。
- `gallery_assets.copy_static_asset` と `gallery_assets.copy_gallery_modules` は I/O 例外処理や `gallery_assets.cache_bust_reference` の付与ロジックと結びつき、`generate_html` 内に密結合している。
- テンプレート置換は `replace` の多段適用で実装されており、プレースホルダーが増えるたびに可読性が低下する恐れがある。

### 問題点
1. **責務の集中**: データ整形、辞書収集、アセットコピー、テンプレート変換、ファイル出力が 1 関数に集約され単体テストが難しい。
2. **結合度の高さ**: I/O とテンプレート整形が混在しており、モックや例外分類が煩雑。
3. **エラーハンドリングの曖昧さ**: データバリデーションとファイル操作失敗が同一経路で伝播し、呼び出し元のリカバリ設計が困難。

### 優先度
- **最優先 (P0)**: データ整形とテンプレート変換を独立関数に切り出し、`generate_html` をオーケストレーション専用にする。
- **高優先度 (P1)**: 静的アセットコピーとキャッシュバスター処理を別モジュール `gallery_assets.py` へ移し、I/O 責務を分離する。
- **中優先度 (P2)**: マスター辞書収集とデータセット統合をユーティリティ化し、`main.py` やパイプライン構築時に再利用できるようにする。

### 小ステップ
1. `generate_gallery.py` にセクションコメントと docstring を追加し、現行の責務境界を明示する。
2. データ整形処理を純粋関数（例: `build_gallery_payload`）として切り出し、`tests/test_generate_gallery.py` から直接検証可能にする。
3. アセットコピー処理を新モジュールに移管し、`gallery_assets.prepare_gallery_assets` でパス解決とキャッシュバスター付与を一元化する。I/O 例外は `FileNotFoundError` をラップして通知する方針を検討する。
4. テンプレート置換を担うヘルパー（例: `render_gallery_template`）を追加し、プレースホルダー管理を辞書マッピングに変更する。
5. `generate_html` を 1〜4 の関数を順番に呼び出す薄いオーケストレーションに限定し、戻り値を HTML 出力パスへ統一する。
6. リファクタリング後は `pytest tests/test_generate_gallery.py` と `npm run test:node` を実行し、結果を `docs/guide-refactoring-progress-log.md` に記録する。

### テストと周知
- Playwright 未導入環境では `pytest` + `node --test tests/js/gallery_modules.test.mjs` を代替手順とする。
- 進捗とテスト結果は `docs/guide-refactoring-progress-log.md` に追記し、関連チームへ共有する。


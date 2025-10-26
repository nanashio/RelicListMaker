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

## 実行計画

### ロードマップ概要
| ステップ | 状態 | 主な内容 |
| --- | --- | --- |
| 1 | ✅ 完了 | 設計ドキュメントの整備とビルド手順の検証。 |
| 2 | ✅ 完了 | `createItem` 周辺の描画ロジック分割とヘルパー化。 |
| 3 | ✅ 完了 | `createEffect` 周辺の描画ロジック分割とビューモデル導入。 |
| 4 | ✅ 完了 | DOM/データ処理ユーティリティの再編とレコード管理ヘルパーの共有化。 |
| 5 | ✅ 完了 | 状態・データセット・永続化レイヤの完全分離と API 化。 |
| 6 | ⏳ 未着手 | エントリポイント刷新とモジュール読込方式の最終統合。 |

### フォーカスすべき次アクション
1. **エントリポイント刷新（ステップ6）**: `templates/gallery/index.js` を新設し、既存モジュールと `gallery.js` の責務を段階的に移行する。`<script type="module">` 化に合わせて依存注入を整理する。
2. **モジュール読込の一本化（ステップ6継続）**: HTML テンプレートと生成スクリプトの読み込み順序を見直し、ES Modules と互換な構成に更新する。必要に応じて動的 import を採用し、グローバル依存を削減する。
3. **統合テスト強化（ステップ6）**: ESM 化後のブラウザ／Node／Python テストフローを再検証し、`npm run test:all` を中心に回帰確認を行う。Playwright フィクスチャの依存を最新構成へ追従させる。

### 完了済みハイライト
- **初期化と基盤整備**: `viewer_server.py` を含む読み込み経路を確認し、新規モジュールを `generate_gallery.py` やブラウザフィクスチャへ反映。
- **描画レイヤの再構成**: `render/galleryView.js` から `itemFactory`・`itemEnhancers`・`effectFactory` へ責務を分割し、左右カラムやエフェクト表示を純粋関数へ移行。
- **フィルタ／検索の純化**: `applyFilters` と検索キャッシュを `utils/filter.js` へ切り出し、Node テストを追加して回帰を抑止。
- **イベントとアクション処理の整理**: `events/galleryEvents.js` をハンドラ単位へ再編し、`events/recordActionHandlers.js` に操作ロジックを集約。お気に入り・色分け・レビュー操作のテストを強化。
- **レコード・重複管理の共有化**: `templates/gallery/utils/records.js` と `templates/gallery/storage/utils.js` を新設し、ギャラリー本体からヘルパーを排除。フォールバックスタブを明示して依存を整理。
- **DOM/ストレージユーティリティの統合**: `templates/gallery/utils/dom.js` にファクトリを導入し、`templates/gallery.js` からのフォールバック実装を撤廃。`window.galleryStorageUtils` の API を必須依存として扱い、Node テストで依存注入経路を検証。
- **データ正規化の拡充**: `utils/data.js` に抑制レベル正規化を追加し、旧 CSV/OPFS データの互換性を担保。データセット解析ユーティリティを `dataset/utils.js` へ集約しテストを整備。
- **テスト体制の強化**: `tests/js/gallery_modules.test.mjs` でフィルタ・アイテム生成・効果レベル処理などのシナリオを網羅し、保存トリガーや候補リセットを検証。
- **状態管理と永続化の抽象化**: `app/stateApi.js` と `storage/manager.js` を導入し、`gallery.js` から直接状態や OPFS 実装へアクセスしない構造に更新。描画・イベント層へ API を注入し、Node テストでモック差し替えが容易な設計に整えた。

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

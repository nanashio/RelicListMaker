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

## 実行計画
### 完了済み
- [x] ステップ1: 設計ドキュメントの整備とビルド手順の確認。
- [x] ステップ2: `createItem` 周辺の描画ロジックをヘルパーへ分割。
- [x] ステップ3: `createEffect` 周辺の描画ロジックをヘルパーへ分割。
- [x] ステップ4: DOM ユーティリティと CSV/保存処理を外部モジュール (`utils/`, `storage/`) に切り出し。
- [x] ステップ5: 状態ストア・データセット切替をモジュール (`state/store.js`, `dataset/manager.js`) に分離。
- [x] ステップ6: アプリ初期化シーケンスを `app/controller.js` へ分離し、`gallery.js` から呼び出し。
- [x] ステップ7: 描画ファクトリ (`render/effectFactory.js`, `render/galleryView.js`) とイベントレイヤ (`events/galleryEvents.js`) を分離し、テンプレート・ビルドスクリプト・テストに反映。Playwright テストでコンソールエラー検知とスクリーンショット検証を実装。

### 次のステップ
1. **初期化フロー・モジュール構造の下準備**  
   - ビルド／読み込み方法の確認（`viewer_server.py` のテンプレート読み込みを調査）【済】  
   - 新モジュールを `generate_gallery.py` / `serve_fixture.py` / テンプレートへ反映【済】  
2. **ギャラリー描画の分割（`createItem` 周辺）**  
   - DOM 生成と状態同期を別関数へ分け、`render/` 配下を整備。  
   - 可能であれば `DocumentFragment` の組み立てを専用モジュールへ移す。  
3. **効果表示のさらなる最適化**  
   - `effectFactory` で抽出済みのロジックを部品単位で整理し、UI 更新と状態変換を分離。  
   - テストを追加し、効果スロット追加時の回帰を防止。  
4. **共通ユーティリティの追加整理**  
   - DOM 操作・正規化ロジック・CSV パースなどを `utils/` へ移動。  
   - 重複コードを統合しテスト追加。  
5. **状態／データセット／永続化レイヤの独立**  
   - `state` を用途別に分割し、イベントハンドラから直接 `state` を操作しない API を提供。  
   - データセット切替や保存処理を別モジュールから呼び出す形に改修。  
6. **最終統合・エントリポイントの刷新**  
   - `index.js` で各モジュールを組み合わせ、`<script type='module'>` で読み込むようテンプレート更新。  
   - 回帰テスト（ブラウザ UI 動作・CSV 入出力・レビュー保存）を実施。

### 直近のタスク
1. effectFactory/events モジュールのテスト拡充と既存テストの維持管理を継続。
2. `buildGallery`〜`createItem` の純化を進め、描画ファクトリ内の責務分離とテスト追加を検討。
3. 既存 `gallery.js` に残るイベント／描画ロジックを段階的に分割し、`render/`・`events/` へ集約。

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
- CSV 読み込み・結合ローダー・保存マネージャを `templates/gallery/storage/utils.js` として分離し、ギャラリー側ではフォールバックを保持。
- 状態管理を `templates/gallery/state/store.js` に切り出し、`window.galleryStateStoreFactory` 経由で `createStateStore` を利用できるようにした（ギャラリー本体ではフォールバックを維持）。
- DOM ユーティリティを `templates/gallery/utils/dom.js` と `templates/gallery/domUtils.js` に分離し、ブラウザ側では `window.galleryDomUtils` を通して利用する（フォールバック関数を残して段階的に移行）。
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
| 永続化 | `templates/gallery/storage/csvPersistence.js` | CSV 読込／保存、OPFS・fetch 連携。 |
| UI 构築 | `templates/gallery/render/galleryView.js` | `buildGallery` の分割版。 |
| UI 部品 | `templates/gallery/render/itemFactory.js` | `createItem` の DOM 組み立て部分（副作用を限定）。 |
| UI 部品 | `templates/gallery/render/effectFactory.js` | `createEffect` の DOM 組み立て部分。 |
| イベント | `templates/gallery/events/galleryEvents.js` | クリック・入力イベントの登録とハンドラ。 |
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
- `templates/gallery.js:200` 付近の `datasetUtils` は `parseDatasets` / `resolveDatasetState` / `areSourcesEqual` を内包し、`templates/gallery/dataset/manager.js` のファクトリと重複機能を持つ。
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

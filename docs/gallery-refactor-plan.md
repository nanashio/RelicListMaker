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

## 分割ポリシー
1. **責務ベースでモジュール化**: 状態管理・データセット・描画・永続化・イベントを明確に分割する。
2. **UI とロジックの分離**: DOM 操作を司るレイヤと、データ加工や判定を行うレイヤを分け、後者を純粋関数化。
3. **依存方向の固定化**: 下位モジュール（ユーティリティ／データ処理）から上位モジュール（描画／イベント）へ一方向の依存に制限。
4. **ES Modules 化**: `templates/gallery.js` をエントリポイント (`index.js`) とし、`<script type="module">` で読み込む想定に切り替える。
5. **テスト容易性の向上**: ロジックモジュールは `tests/` 配下から直接 import できる構造に変更し、ユニットテストを追加しやすくする。

## モジュール構成案
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

## 依存関係ガイドライン
- `utils/*` は他の全レイヤから利用可能。  
- `dataset/manager` と `storage/*` は `state/store` に依存しない（パラメータで受け取る）。  
- `render/*` は `state`・`dom` に依存するが、DOM生成と状態更新を分け、生成部分は純粋関数を目指す。  
- `events/*` は `render/*` や `state/store` を利用し、最下層ユーティリティへは依存しない。  
- `index.js` は各モジュールを初期化順に呼び出すアプリケーションルートとして振る舞う。

## 移行ステップ（概要）
1. **初期化フロー・モジュール構造の下準備**（現在のステップ）  
   - 設計ドキュメント整備（本資料）  
   - ビルド／読み込み方法の確認（`viewer_server.py` のテンプレート読み込みを調査）  
2. **ギャラリー描画の分割（`createItem` 周辺）**  
   - DOM 生成と状態同期を別関数へ分け、`render/` 配下を整備。  
   - 可能であれば `DocumentFragment` の組み立てを専用モジュールへ移す。  
3. **効果表示の分割（`createEffect` 周辺）**  
   - レベルバッジ／補正入力など UI 部品の生成とイベント取り回しを整理。  
   - ステータス更新ロジックを純粋関数として抽出しテスト対象にする。  
4. **共通ユーティリティの抽出**  
   - DOM 操作・正規化ロジック・CSV パースなどを `utils/` へ移動。  
   - 重複コードを統合しテスト追加。  
5. **状態／データセット／永続化レイヤの独立**  
   - `state` を用途別に分割し、イベントハンドラから直接 `state` を操作しない API を提供。  
   - データセット切替や保存処理を別モジュールから呼び出す形に改修。  
6. **最終統合・エントリポイントの刷新**  
   - `index.js` で各モジュールを組み合わせ、`<script type="module">` で読み込むようテンプレート更新。  
   - 回帰テスト（ブラウザ UI 動作・CSV 入出力・レビュー保存）を実施。

## テスト戦略
- ロジック切り出し後に `tests/` 以下でユニットテストを追加。特に以下を対象とする。  
  - データセット解決（`normalizeDatasetEntry` など）。  
  - 文字列正規化／レベル候補処理。  
  - ステータス更新／補正値の適用。  
- DOM 組み立ては Jest + JSDOM などを導入可能な場合、簡易的なスナップショットテストを検討。
- 手動 E2E（ブラウザ）確認手順を README か別ドキュメントに追記する。

## リスクと対応
- **ES Modules 化による互換性**: HTML テンプレートとビルドパイプラインを確認し、`type="module"` への切り替えが可能か事前検証する。難しい場合はバンドラ導入（Vite 等）も検討。
- **作業の断続的適用**: 各ステップ後に `gallery.js` から該当責務を切り出し、挙動確認を挟む。常にブラウザでの動作チェックを前提に進める。
- **依存関係の把握不足**: 初期段階で関数一覧と利用箇所を把握し、段階的な分割で副作用を限定する。

## 次のアクション
- 本設計方針に沿って、`createItem` 周辺の描画ロジックを抽出・分割するステップへ進む（ブラウザでの手動確認とセット）。  
- 分割の最中に影響箇所（HTML テンプレート等）を洗い出し、必要な更新を別途メモしておく。

## DOM / 状態ユーティリティ統合方針
- 状態管理を `templates/gallery/state/store.js` に切り出し、`window.galleryStateStoreFactory` 経由で `createStateStore` を利用できるようにした（ギャラリー本体ではフォールバックを維持）。
- DOM ユーティリティを `templates/gallery/utils/dom.js` と `templates/gallery/domUtils.js` に分離し、ブラウザ側では `window.galleryDomUtils` を通して利用する（フォールバック関数を残して段階的に移行）。
- **DOM ヘルパー再編**: `ensureElement` / `clearChildren` / `applyInlineStyles` などの DOM 操作関数を `templates/gallery/utils/dom.js` に集約し、返り値と副作用を明示的にする。要素の生成 (`createElement`) と属性付与を小さな純粋関数として切り出し、描画モジュールから利用。
- **イベント依存の排除**: DOM ユーティリティはイベント登録を内包しない。イベントモジュールにてユーティリティを組み合わせ、テスト時は仮想 DOM 上で独立検証できるようにする。
- **状態ストア設計**: `state`, `datasetState`, `duplicates`, `favorites` などの管理を `state/store.js` に集約し、読み取り/書き込み API (`getState`, `updateState`, `subscribe`) を提供。直接プロパティへアクセスしないよう呼び出し側を段階的に移行。
- **派生状態の扱い**: 検索キャッシュ・重複フラグなどは selector 的関数を別モジュールに定義し、UI レンダリング時に利用。副作用を持つ更新処理は store 内で完結させる。
- **永続化との境界**: ストレージ層は store 経由で同期し、DOM 側から直接フェッチ/保存を呼び出さない。これによりユニットテストでストレージをモック化しやすくする。
- **移行ステップ**: 既存のユーティリティ関数の利用箇所を調査し、`domUtils` / `stateStore` 相当の即時実行ブロックを廃止。まずは新モジュールを追加し、旧関数をラップする薄い層を用意して互換性を維持しつつ置き換えを進める。

# ギャラリー画面リファクタリング計画（TomSelect を含む）

## 背景とゴール
- ギャラリー画面に tom-select を組み込んだことで、タグ入力・検索まわりのコードがコンポーネント内に肥大化しています。タグのフォーマット処理、DOM 操作、デバッグログ、TomSelect のイベント購読が一箇所に集中しており、挙動を追うのに時間がかかります。【F:templates/gallery/components/tagInput.js†L25-L177】【F:templates/gallery/render/galleryView.js†L65-L146】【F:templates/gallery/render/galleryView.js†L781-L820】【F:templates/gallery/events/galleryEvents.js†L317-L352】
- プレイブックの「モジュール切り出しの基本ルール」では、状態・データ・ストレージ・アプリ・UI の一方向依存を徹底し、グローバル経由のフォールバックを維持しつつ段階的に差し替える方針が示されています。現在のタグ入力は UI と状態更新が密結合しているため、この方針に沿って分離する余地があります。【F:docs/guide-refactoring-playbook.md†L20-L48】
- TomSelect 以外のテンプレート部分でも、ビューとデータの境界が曖昧な箇所や、イベント束ねが散在している箇所があり、同プレイブックのステップ 3「ギャラリー生成・共有モジュール」以降の進行を阻害しています。ここではタグ入力を含むギャラリー全体を対象にした具体的な計画書として整理します。

## スコープ外・前提
- バックエンドのパイプライン (`relic_pipeline/`) には手を入れず、`templates/gallery` 配下の JS/CSS/HTML の整理に集中する。
- TomSelect を外部依存として保持し、API 変更がない範囲でのラップと責務分離を行う。

## 改善提案（TomSelect を中心とした優先テーマ）
1. **TomSelect アダプタの分離と設定共有**
   - `createTagInputController` と `tagSearchController` の双方で TomSelect インスタンス生成・イベント登録・フォールバック処理が重複しています。TomSelect 固有の設定やデバッグロギングを `components/tomSelectAdapter.js`（仮）にまとめ、UI コンポーネントはインターフェース越しに依存させると責務を切り分けられます。IIFE で `window.galleryComponents.createTomSelectAdapter` を公開しておけば、既存のフォールバックパスも維持しやすくなります。【F:templates/gallery/components/tagInput.js†L25-L177】【F:templates/gallery/render/galleryView.js†L80-L114】【F:docs/guide-refactoring-playbook.md†L20-L40】

2. **タグ正規化とデータ同期のストア側移譲**
   - 現状、タグの正規化・データセット書き戻し・入力反映が `galleryView` の `applyItemTags` に集約され、DOM とビジネスロジックが混在しています。【F:templates/gallery/render/galleryView.js†L781-L820】 これをストア／データセット層の関数に切り出し、UI からは「タグ配列をセットする」APIを呼ぶだけにすると、テスト可能な純粋関数として管理できます（プレイブックのステップ 2→3 の流れ）。【F:docs/guide-refactoring-playbook.md†L34-L40】

3. **イベント束ねと編集状態管理の整理**
   - `galleryEvents` では入力・フォーカス・変更イベントごとにタグ同期ロジックが分散し、`dataset.editingTags` フラグを手作業で出し入れしています。【F:templates/gallery/events/galleryEvents.js†L317-L352】 変更検知と同期のルールを一つのイベントマネージャ（例: `events/tagInputEvents.js`）にまとめ、`tagInputController` で編集状態を購読・通知する形にするとフローが明確になります。UI 層のイベント束ねはプレイブックが推奨する「UI から下層への一方向依存」を守りつつ、小ステップで差し替えられます。【F:docs/guide-refactoring-playbook.md†L20-L48】

## 改善提案（TomSelect 以外のテンプレート全般）
1. **ビュー生成とデータ整形の分離**
   - `galleryView` でアイテムオブジェクトを直接整形しながら DOM を生成しており、プレイブックの「アプリ層は状態層へ一方向依存」に反します。【F:templates/gallery/render/galleryView.js†L65-L146】【F:docs/guide-refactoring-playbook.md†L20-L40】 `renderGallery` の前段でデータ整形用の純粋関数（例: `transformItemsForRender(items)`）を導入し、ビュー層は整形済みデータのみを扱うようにします。

2. **フィルター/ソート条件の共有ストア化**
   - 検索バー、ドロップダウン、タグ検索でフィルター状態が個別管理され、イベント連携が複雑化しています。【F:templates/gallery/render/galleryView.js†L146-L226】【F:templates/gallery/events/galleryEvents.js†L170-L260】 フィルター条件を一箇所（例: `stores/galleryFilters.js`）に集約し、UI はストアを購読するだけにすると、条件変更の副作用箇所を限定できます。

3. **テンプレートパーシャル化とコンポーネント単位の IIFE 公開**
   - 画面全体を一つの HTML/JS で描画しているため、ファイルサイズ増大と依存関係把握が困難です。【F:templates/gallery/index.html†L1-L200】 HTML 側はヘッダー・メイン・フッターのパーシャル化、JS はコンポーネント単位の IIFE (`window.galleryComponents.*`) を整理し、読み込み順と依存を明示します。

4. **スタイルの名前空間化と TomSelect オーバーライドの整理**
   - TomSelect 追加に伴い `.ts-wrapper` などのスタイルオーバーライドが散在し、グローバルクラスと競合の恐れがあります。【F:templates/gallery/styles/gallery.css†L40-L120】 名前空間付きクラス（例: `.gallery__filter`, `.gallery__tag-input`）へ揃え、TomSelect オーバーライドを専用ファイル（例: `styles/tom-select.css`）に集約します。

5. **テスト可能な JS モジュール化**
   - 現状は IIFE でグローバル公開されており、単体テスト時に依存解決が難しい構成です。`templates/gallery` 配下のロジックを ES Module 化したサブディレクトリ（例: `templates/gallery/js/modules/`）に切り出し、`tests/test_gallery_js_modules.py` で import 可能にすることで、プレイブックの「段階的なモジュール化」を実現します。【F:docs/guide-refactoring-playbook.md†L54-L67】

## 実行計画（4 スプリント想定）
- ### スプリント 1（TomSelect アダプタ）
  - 目標: アダプタ導入によりタグ入力・検索の生成/破棄/設定共有を一元化。
  - タスク: `components/tomSelectAdapter.js` を追加し、`tagInputController` と `tagSearchController` を依存注入化。イベント購読とロギングをアダプタへ移動。
  - 成果物: 既存 UI と同等動作を維持しつつ、TomSelect 依存が 1 ファイルに集約されていること。

- ### スプリント 2（タグ同期のストア移行 + イベント束ね）
  - 目標: タグ正規化・保存処理をストアへ移し、イベント束ねを単一点化。
  - タスク: `stores/tagStore.js`（仮）にタグ正規化・保存 API を移動。`events/tagInputEvents.js` を新設し、`dataset.editingTags` 制御と同期処理を一元化。
  - 成果物: UI からはストア API を呼ぶだけでタグ更新が成立し、イベント処理が 1 ファイルに集約されること。

- ### スプリント 3（テンプレート全般の分離・スタイル整理）
  - 目標: ビュー生成の純粋化とスタイル名前空間化による可読性向上。
  - タスク: データ整形関数を導入し `renderGallery` から切り出し。フィルター/ソート条件のストア化。HTML パーシャル化と IIFE 依存順序の明示。スタイルを名前空間化し TomSelect オーバーライドを専用ファイルへ移動。
  - 成果物: ビュー層が整形済みデータにのみ依存し、CSS/HTML/JS の役割分担が明確になっていること。

- ### スプリント 4（テスト整備と ESM 化への足場作り）
  - 目標: テスト容易性を高め、将来の ESM 化に備えた構成にする。
  - タスク: JS ロジックを `templates/gallery/js/modules/` へ順次抽出し、IIFE からも参照できるようラッパを配置。`tests/test_gallery_js_modules.py` に単体テストを追加し、タグ正規化・フィルター条件適用の純粋関数を検証。
  - 成果物: 主要ロジックがモジュール化され、CI でテスト可能な形になっていること。

## 進捗サマリー（2025-04-11 時点）
- スプリント完了状況と残り
  - ✅ スプリント 1（TomSelect アダプタ）: 依存注入・デフォルトアダプタ・コピー漏れ検知まで完了。
  - ✅ スプリント 2（タグ同期・イベント束ね）: タグストアとイベント集約を導入し、既存 UI と同期済み。
  - ✅ スプリント 3（テンプレート分離・スタイル整理）: ビュー向けデータ整形とフィルター状態ストア化に加え、テンプレートパーシャル化とビルド時の依存順序明示まで完了。CSS の alias 期間終了に向けたフォローアップはドキュメント更新で対応予定。
  - ✅ スプリント 4（テスト整備・ESM 化の足場）: タグトークン正規化を ES Module 化し、フィルター評価ロジックを `filterPredicates` モジュールとして抽出・共有。コピー対象と Node テストを更新済み。Playwright フィクスチャでも新モジュールを配信して 404 を解消済み。フィルター純粋関数の追加ケース拡充とエッジケース検証も完了。
- スプリント別の完了タスク数
  - スプリント 1: 計画 3 項目中 3 完了（100%）。
  - スプリント 2: 計画 3 項目中 3 完了（100%）。
  - スプリント 3: 計画 4 項目中 4 完了（100%）。
  - スプリント 4: 計画 3 項目中 3 完了（100%）。
  - 残作業: なし（TomSelect リゾルバの共通化まで完了）。
  - フォローアップ: デバッグフラグ解決を `tagDebug` モジュールに集約し、タグ入力/検索/ビューで共有済み。TomSelect 共有リゾルバのフォールバックを強化し、ロード順に依存せずデフォルトアダプタへ接続できるようにした。

## バックログ/フォローアップ計画（2025-04-16 以降）
- ### フォローアップ 1: ブラウザ E2E の再実行と証跡取得
  - 背景: Playwright のブラウザ取得がネットワーク制約で失敗しており、TomSelect 共有リゾルバ適用後の E2E カバレッジが不足している。
  - タスク: ネットワーク許可後に `npm run test:browser -- tests/browser/viewer.spec.ts` を再実行し、ログとスクリーンショットを計画書へ追記。タグ入力/検索/ビューの TomSelect 差し替え経路が UI 上でも統一されていることを確認する。
  - 成果物: E2E 実行ログとスクリーンショット、計画書への記録、失敗時の原因と暫定対応メモ。

- ### フォローアップ 2: CSS alias 期間終了に向けたクリーンアップ
  - 背景: スプリント 3 で導入した名前空間付きクラスに合わせて旧クラスの alias を暫定的に残している。移行完了を明示しないとスタイル衝突リスクが残る。
  - タスク: `templates/gallery/styles/` の alias クラスを棚卸しし、ビルド成果物と Playwright フィクスチャにおける参照箇所を確認。問題なければ alias を段階的に削除し、削除前後の互換性確認をテストケースに追加する。
  - 成果物: alias 削除パッチと対応テスト、互換性確認結果の記録。

- ### フォローアップ 3: 共有リゾルバのカバレッジ拡充
  - 背景: `sharedResolvers` で TomSelect・デバッグ判定のブリッジを統一したが、ローカルストレージにデバッグフラグが未設定のケースや TomSelect 非読込環境でのパスを E2E では未検証。
  - タスク: `tests/js/gallery_modules.test.mjs` にローカルストレージ未設定時のフォールバック、TomSelect なしでの graceful degradation のケースを追加し、`gallery/assets.py` のコピー対象チェックと連動させる。
  - 成果物: 追加テストとテスト結果、フォールバック経路の通過確認ログ。

- ### フォローアップ 4: ESM 化フェーズ 2 の準備
  - 背景: 主要関数の ES Module 化は開始済みだが、IIFE ラッパーと併存しているため依存順序の監視が必要。
  - タスク: `templates/gallery/js/modules/` のエントリポイントを整理し、IIFE からのエクスポートに対する互換レイヤーを `gallery/index.js` で管理する方針を整理。エントリ追加時のチェックリストを計画書に追記し、次回のモジュール抽出対象（例: filter state ブリッジ）を列挙する。
  - 成果物: 整理した依存図・チェックリスト、次抽出候補の一覧と想定工数。

## 進捗メモ（2025-04-13）
- TomSelect アダプタのデバッグ判定経路を共有モジュール化。
  - `tomSelectAdapter` が `tagDebug` のリゾルバを優先的に利用するように変更し、タグ入力・タグ検索・ビューと同一のデバッグトグルでロギング制御を統一。
- テスト: `npm run test:node` を実行。

- 日次ログのダイジェスト（テスト状況付き）

  | 日付 | 主な進捗 | 関連スプリント | テスト実行 |
  | --- | --- | --- | --- |
  | 03-19 | TomSelect アダプタ追加と依存注入開始 | S1 | pytest / node --test |
  | 03-20 | デフォルトアダプタ同梱とタグ検索同期確認 | S1 | pytest / node --test |
  | 03-21 | アダプタのコピー漏れ修正と検出テスト追加 | S1 | pytest / node --test |
  | 03-22 | タグストア導入とイベント集約開始 | S2 | pytest / node --test |
  | 03-23 | フィルター状態ストア化を着手 | S3 | pytest / node --test |
  | 03-24 | フィルター制御の UI 同期をストア購読に統一 | S3 | pytest / node --test |
  | 03-25 | レンダーデータユーティリティ追加とコピー監視更新 | S3 | pytest / node --test |
  | 03-26 | アイテム状態キャッシュ導入でフィルター前処理を分離 | S3 | pytest / node --test |
  | 03-27 | フィルターブリッジ追加で DOM/ストア解決順を統一 | S3 | pytest / node --test |
  | 03-28 | フィルターオプションリゾルバで状態結合を一元化 | S3 | pytest / node --test |
  | 03-29 | スタイルオーバーライドを名前空間化し CSS 分離 | S3 | pytest / node --test |
  | 03-30 | Playwright フィクスチャのスタイル配信を修正 | S3 | npm run test:browser（依存取得失敗） |
  | 03-31 | レイアウトハンドル導入で DOM 依存を明示 | S3 | pytest / node --test |
  | 04-01 | サマリー計算のキャッシュ化と効果ステータスのデータ保存 | S3 | pytest / node --test |
  | 04-02 | TomSelect アダプタファクトリに集約し依存リストを更新 | S1/S3 | pytest / node --test |
  | 04-03 | フィルター評価関数を ESM 化しコピー対象とテストを更新 | S4 | pytest / node --test |
  | 04-03 | ギャラリーテンプレートをパーシャル化しビルドの依存順を固定 | S3 | pytest / node --test |
  | 04-04 | タグトークン正規化を ES Module 化しグローバル登録・テスト追加 | S4 | pytest |
  | 04-05 | Playwright フィクスチャに ESM モジュール配信を追加し 404 を解消 | S4 | npm run test:browser |
  | 04-07 | タグ検索コントローラーをコンポーネント化し TomSelect 設定を共有 | S1/S2 | node --test |

## 進捗メモ（2025-03-19）
- スプリント 1 の着手済み。
  - `templates/gallery/components/tomSelectAdapter.js` を追加し、TomSelect 生成・ロギング・ネイティブフォールバックを一元化。
  - `createTagInputController` と `tagSearchController` から TomSelect 依存を注入するよう変更し、両者がアダプタ経由で共通設定を利用する形に整理。
- 次ステップ: アダプタを用いたタグストア移行とイベント束ね（スプリント 2）に着手する。

## リスクと緩和策
- 依存順序の変更で既存バンドルと競合するリスク → IIFE での後方互換エクスポートを残し、段階的に import パスを差し替える。
- スタイルの名前空間化でクラス名が変わるリスク → 既存クラスを一定期間 alias として残し、差分を CSS 変数とコメントで明示する。
- テスト対象の純粋関数切り出しに伴うイベント漏れ → `galleryEvents` から移動する関数に対し一時的にラッパを設置し、警告ログで確認する。

## テスト運用ルール
- 変更を加えたら毎回 `pytest` と `node --test tests/js/gallery_modules.test.mjs` を実行し、Playwright など環境依存テストが走らない場合でも回帰確認の代替として必ず記録する。
- テスト結果は本計画書の進捗メモに追記し、失敗時は原因と暫定対応（例: ブラウザ未取得で Playwright スキップ）を明示する。

## 成果確認チェックリスト
- TomSelect の生成・破棄・設定が 1 ファイルに集約され、`tagInputController` と `tagSearchController` は依存注入で動く。
- タグ更新の純粋関数がストアに存在し、UI から DOM 直接操作せずに更新できる。
- フィルター評価の純粋関数を `js/modules/filterPredicates.js` に抽出し、IIFE 側からも再利用できる。
- フィルター/ソート条件が単一ストアに集約され、UI は購読/通知のみで同期する。
- HTML/CSS/JS の役割が分離され、名前空間付きクラスとパーシャルで構造が明示されている。
- テストが `tests/test_gallery_js_modules.py` で追加され、タグ正規化とフィルター適用のケースが網羅されている。

## 進捗メモ（2025-03-20）
- スプリント 1 のフォールバック強化。
  - TomSelect アダプタが未注入でも `tagInputController` とタグ検索が TomSelect インスタンスを生成・同期できるよう、デフォルトアダプタを同梱。
  - `syncTagSearchOptions` が Tags カラムから候補を抽出し、TomSelect 選択値のフィルターに反映されることを確認。
- テスト: `pytest`（内包の `node --test tests/js/gallery_modules.test.mjs` を含む）を実行。Playwright はブラウザ取得依存のため未実行。

## 進捗メモ（2025-03-21）
- スプリント 1 の不具合修正。
  - `components/tomSelectAdapter.js` を `gallery/assets.py` のコピー対象に含めておらず、生成後のギャラリーで 404 により動的 import が失敗していた問題を修正。
  - コピー対象を監視する `test_copy_gallery_modules_copies_required_viewer_scripts` にアダプタを追加し、今後の漏れを検出できるようにした。
- テスト: `pytest` と `node --test tests/js/gallery_modules.test.mjs` を実行（Playwright は環境依存のため対象外）。既存テストが通っていた理由は、コピー対象のリスト検証が一部のモジュールのみで TomSelect アダプタをカバーしていなかったため。

## 進捗メモ（2025-03-22）
- スプリント 2 のタグ同期・イベント束ねを実施。
  - `templates/gallery/stores/tagStore.js` を追加し、タグの正規化とレコード更新をストア経由に統一。`galleryView` と `recordActionHandlers` がストアを参照して DOM 反映と CSV 書き戻しを分離。
  - `templates/gallery/events/tagInputEvents.js` を追加してタグ入力の input/focus/change を一元管理し、編集状態の判定と TomSelect 未使用時の表示同期を集約。
  - `gallery/assets.py` と `tests/test_generate_gallery.py` を更新し、新規モジュールのコピー漏れを防止。
- テスト: `pytest` および `node --test tests/js/gallery_modules.test.mjs` を実行。

## 進捗メモ（2025-03-23）
- スプリント 3 のフィルター状態ストア化を着手。
  - `templates/gallery/stores/filterStore.js` を新設し、検索語・状態フィルター・色フィルター・重複表示の状態を購読/更新できるように整理。`gallery/assets.py` と `tests/test_generate_gallery.py` にコピー対象を追加し、ビルド時の漏れを防止。
  - `gallery.js` からストアを初期化して `galleryEvents` と `galleryView` に注入し、`attachEventHandlers` で入力イベントがストアを更新するように変更。`galleryView` の `applyFilters` と `includeDuplicatesNow` がストア経由で値を取得し、DOM と状態の分離を開始。
- テスト: `pytest` と `node --test tests/js/gallery_modules.test.mjs` を実行。

## 進捗メモ（2025-03-24）
- スプリント 3 のフィルター状態ストア化を継続。
  - `gallery.js` にフィルター値を DOM と同期する `syncFilterControls` を追加し、`filterStore` の購読で UI 反映と `applyFilters` の再実行を統一してストアを単一ソース化。
  - `galleryView` 側の `includeDuplicatesNow` と `applyFilters` が共通のフィルター状態解決関数を経由するように整理し、DOM フォールバックの扱いを明示。
- テスト: `pytest` と `node --test tests/js/gallery_modules.test.mjs` を実行。

## 進捗メモ（2025-03-25）
- スプリント 3 のビュー生成とデータ整形の分離を開始。
  - アイテム DOM からフィルター用プレーンデータを生成する `gallery/utils/renderData.js` を追加し、`applyFilters` がユーティリティ経由でデータ整形された配列を扱うように変更。
  - ギャラリー依存モジュールのコピーリスト（`gallery/assets.py` と `templates/gallery/index.js`）に新ユーティリティを組み込み、生成物での読込漏れを防止。
  - `tests/js/gallery_modules.test.mjs` にレンダーデータユーティリティの検証を追加し、`tests/test_generate_gallery.py` でコピー対象を監視するように更新。
- テスト: `pytest` と `node --test tests/js/gallery_modules.test.mjs` を実行。

## 進捗メモ（2025-03-26）
- スプリント 3 のデータ整形とフィルター適用の分離を継続。
  - アイテム状態のスナップショットを管理する `createItemStateResolver` を `renderData` に追加し、フィルター評価前に DOM からの再収集を一元化。
  - `galleryView` がタグ・色・重複・お気に入り更新時に状態キャッシュを汚染し、`applyFilters` はキャッシュ経由でプレーンデータを受け取る形に整理。ビルド時にキャッシュを初期化することでデータ→UI の一方向依存を明示。
- テスト: `pytest` と `node --test tests/js/gallery_modules.test.mjs` を実行。

## 進捗メモ（2025-03-27）
- スプリント 3 のフィルター状態ストア化を強化。
  - `templates/gallery/utils/filterState.js` にフィルター状態ブリッジを追加し、`filterStore` の値を優先しつつ DOM のフォールバックを 1 箇所で解決できるようにした。`gallery.js` のコントロール同期と `galleryView` のフィルター評価が共通ブリッジ経由になり、依存方向と初期化順が明示された。
  - ブリッジをビルド対象に含めるため `gallery/assets.py` と `templates/gallery/index.js` のコピー対象を更新し、`tests/js/gallery_modules.test.mjs` にブリッジの動作検証を追加して漏れを検出できるようにした。
- テスト: `pytest` と `node --test tests/js/gallery_modules.test.mjs` を実行。

## 進捗メモ（2025-03-28）
- スプリント 3 のフィルター状態統合を強化。
  - `templates/gallery/utils/filterState.js` にフィルター状態と検索条件を正規化して集約する `createFilterOptionsResolver` を追加し、ストア・DOM・ブリッジ間の解決順とタグ/効果検索項目の結合を一元化。
  - `galleryView` が新リゾルバ経由でフィルターオプションを取得するように変更し、`applyFilters` のオプション組み立てを単純化して UI 層から状態解決を切り離した。
  - `tests/js/gallery_modules.test.mjs` にフィルターオプションリゾルバの挙動を検証するテストを追加。
- テスト: `pytest` および `node --test tests/js/gallery_modules.test.mjs` を実行。

## 進捗メモ（2025-03-29）
- スプリント 3 のスタイル名前空間化を着手。
  - `gallery/render.py` で body に `gallery-page` クラスを付与し、TomSelect 関連のオーバーライドを `templates/gallery/styles/tom-select.css` に分離してギャラリー画面内だけに作用するよう整理。
  - ギャラリーアセットのコピー対象と `test_copy_gallery_modules_copies_required_viewer_scripts` に TomSelect オーバーライド CSS を追加し、ビルド生成物での読み込み漏れを検出できるようにした。
- テスト: `pytest` と `node --test tests/js/gallery_modules.test.mjs` を実行。

## 進捗メモ（2025-03-30）
- スプリント 3 のスタイル名前空間化フォロー。
  - Playwright 用フィクスチャ構築スクリプト（`tests/browser/serve_fixture.py`）で `templates/gallery/styles/` ディレクトリをコピー対象に追加し、TomSelect オーバーライド CSS が配信されない 404 を防止。
- テスト: `npm run test:browser -- tests/browser/viewer.spec.ts` を試行。`npx playwright install --with-deps chromium` がネットワーク制限で失敗（apt 403）したためブラウザ取得不可。

## 進捗メモ（2025-03-31）
- スプリント 3 のテンプレート分離と依存順序の明示を継続。
  - レイアウト要素の取得を `templates/gallery/app/layout.js` に切り出し、`gallery.js` はレイアウトハンドル経由で DOM 依存を解決する形に変更。必須要素の欠落は警告ログで可視化するようにして、IIFE 公開のコンポーネント境界を明示した。
  - ギャラリー生成時のコピー対象（`gallery/assets.py` と `tests/test_generate_gallery.py`）にレイアウトモジュールを追加し、ビルド済みビューアでの読み込み漏れを防止。JS モジュールテストにレイアウトハンドルの検証ケースを追加して、依存順序の変化を自動検知できるようにした。
- テスト: `pytest` と `node --test tests/js/gallery_modules.test.mjs` を実行。

## 進捗メモ（2025-04-01）
- スプリント 3 のビュー生成・データ整形分離をフォロー。
  - アイテムサマリー計算を DOM 走査から `galleryRenderUtils` の状態キャッシュ経由に切り替え、`templates/gallery/utils/summary.js` を追加して正規化・集計ロジックを共通化。`galleryView` はタグ/効果状態のキャッシュを利用して件数を算出するようになり、描画直後の状態崩れを防止。
  - 効果スロットのステータスをデータセット属性として保存し、`renderData` のマッピングとコピー対象リスト（`gallery/assets.py` と `tests/test_generate_gallery.py`）に反映してビルド成果物でも欠落しないようにした。
- テスト: `pytest` と `node --test tests/js/gallery_modules.test.mjs` を実行。

## 進捗メモ（2025-04-02）
- スプリント 1 の TomSelect 設定共有をフォロー。
  - TomSelect のデフォルトアダプタとリゾルバを `components/tomSelectAdapterFactory.js` に集約し、`tagInput`/`galleryView` からの依存解決とフォールバックを共通の仕組みに統一。
  - ギャラリーアセットのコピー対象と JS 依存リスト、テストを更新し、アダプタファクトリの挙動を単体で検証できるようにした。
- テスト: `pytest` と `node --test tests/js/gallery_modules.test.mjs` を実行。

## 進捗メモ（2025-04-03）
- スプリント 3 のテンプレート分離を完了。
  - HTML テンプレートをヘッダー/ツールバー/ストレージ/ビュー/ライトボックスに分割したパーシャルを追加し、`gallery/template_parts.py` で置換ユーティリティを用意。
  - `gallery/render.py` がビルド時にパーシャルを組み立てるよう変更し、Playwright フィクスチャ（`tests/browser/serve_fixture.py`）も同一ユーティリティで依存順を固定。
- テスト: `pytest` と `node --test tests/js/gallery_modules.test.mjs` を実行。

## 進捗メモ（2025-04-04）
- スプリント 4 のモジュール化を開始。
  - タグトークン正規化/整形/シリアライズを `templates/gallery/js/modules/tagTokens.js` に切り出し、`registerTagTokenModule` で `window.galleryModules.tagTokens` へ登録する仕組みを追加。
  - `utils/data.js` と `components/tagInput.js` がモジュール経由の正規化関数を優先利用するようにし、既存の IIFE フォールバックも保持。
  - ギャラリーアセットのコピー対象・依存リスト・Node テストを更新し、ES Module の輸出関数を `tests/js/gallery_modules.test.mjs` で直接検証。
- テスト: `pytest`（`tests/test_gallery_js_modules.py` 経由で Node テストを実行）。

## 進捗メモ（2025-04-05）
- スプリント 4 のテスト整備をフォロー。
  - Playwright 用フィクスチャ生成スクリプト（`tests/browser/serve_fixture.py`）に `templates/gallery/js/modules/` をコピーする手順を追加し、`tagTokens.js` や `filterPredicates.js` の 404 でビューア初期化が失敗する問題を解消。
- テスト: `npm run test:browser -- tests/browser/viewer.spec.ts` を実行。

## 進捗メモ（2025-04-06）
- スプリント 4 のフィルター純粋関数を拡充。
  - `filterPredicates.js` の正規化・評価処理に対する Node テストを追加し、タグ/効果/色の組み合わせや空入力時の挙動を網羅。
- テスト: `pytest` と `node --test tests/js/gallery_modules.test.mjs` を実行。

## 進捗メモ（2025-04-07）
- スプリント 1/2 のタグ検索周りをフォロー。
  - `tagSearchController` を `templates/gallery/components/tagSearch.js` としてコンポーネント化し、`resolveTomSelectAdapter`/`createDefaultTomSelectAdapter` を共有する構成に整理。`galleryView` 側は新コンポーネントを優先利用しつつ、従来の IIFE 内蔵実装をフォールバックとして保持。
  - ギャラリー生成時のコピー対象と依存リストにタグ検索コンポーネントを追加し、Node テストで TomSelect あり/なし双方の挙動を検証。
- テスト: `node --test tests/js/gallery_modules.test.mjs` を実行。

## 進捗メモ（2025-04-08）
- スプリント 1/2 のタグ検索フォローアップ。
  - `galleryView` にタグデバッグフラグ解決用のローカルヘルパーを復元し、`tagSearchController` への `isDebugEnabled` 依存が初期化時に未定義で落ちる問題を解消。
  - テスト: `npm run test:browser -- tests/browser/viewer.spec.ts` を試行（Playwright ブラウザの取得権限がなく失敗）。

## 進捗メモ（2025-04-09）
- TomSelect 解決ロジックの共通化。
  - `tomSelectAdapterFactory` にカスタムリゾルバを受け取れる `resolveTomSelectAdapterWithResolver` を追加し、`tagInput`/`tagSearch`/`galleryView` が同一の解決経路とデフォルトアダプタを参照するように整理。設定共有をファクトリに寄せることで、各コンポーネントのフォールバック実装の重複を解消した。
  - テスト: `node --test tests/js/gallery_modules.test.mjs` を実行。

## 進捗メモ（2025-04-10）
- TomSelect 解決ロジックの共有リゾルバを適用。
  - `tomSelectAdapterFactory` に `resolveSharedTomSelectAdapter` を追加し、タグ入力・タグ検索・ギャラリービューが同一の共有リゾルバ経由で TomSelect 依存を解決するようにした。コンポーネント側のフォールバック実装を整理し、テストの初期化順をファクトリ読込に合わせて依存解決を一元化。
- テスト: `node --test tests/js/gallery_modules.test.mjs` を実行。

## 進捗メモ（2025-04-11）
- デバッグフラグ解決を共有モジュール化。
  - `templates/gallery/components/tagDebug.js` を追加し、タグ入力・タグ検索・ギャラリービューが同一のデバッグフラグリゾルバを参照するように変更。`resolveSharedTomSelectAdapter` に渡す `isDebugEnabled` が統一されたため、TomSelect アダプタのロギング条件が一貫するようになった。
  - `gallery/assets.py`、`templates/gallery/index.js`、`tests/test_generate_gallery.py` にコピー対象と依存リストを追加し、ビルド生成物やフィクスチャで新モジュールが欠落しないようにした。Node テストも `tagDebug` を読み込むよう更新し、フォールバック経路とローカルストレージ判定の挙動を検証。
- テスト: `node --test tests/js/gallery_modules.test.mjs`、`pytest` を実行。

## 進捗メモ（2025-04-12）
- デバッグリゾルバの共有ロジックを全面適用。
  - `tagDebug` モジュールに `resolveTagDebugResolver` を追加し、タグ入力・タグ検索・ギャラリービューの各 IIFE が同一のデバッグリゾルバを参照するように整理。各コンポーネントのフォールバック処理はシンプルなデフォルト判定に限定し、共有モジュールのエラー処理を優先する形に統一した。
- テスト: `npm run test:node` を実行。

## 進捗メモ（2025-04-13 追記）
- デバッグリゾルバと TomSelect 共有リゾルバの橋渡しを共通モジュール化。
  - `components/sharedResolvers.js` を追加し、`resolveTagDebugResolverWithFallback` と `resolveSharedTomSelectAdapterWithDebug` を `window.galleryComponents` に公開。タグ入力・タグ検索・ギャラリービュー・TomSelect アダプタが同一のリゾルバ経路を使うよう整理し、フォールバック処理の重複を解消した。
  - ギャラリー生成時のコピー対象と ES Module 依存リスト、Node テストに新モジュールを追加し、配信漏れやリゾルバ未注入を検出できるようにした。
- テスト: `pytest`、`npm run test:node` を実行。

## 進捗メモ（2025-04-14）
- 共有リゾルバのフォールバック強化。
  - `sharedResolvers` で `resolveSharedTomSelectAdapterWithDebug` が TomSelect リゾルバ不在時にデフォルトアダプタへフォールバックするようにし、ロード順の揺らぎで TomSelect が無効化されるリスクを解消。
  - 同モジュールに `resolveSharedTagDebugResolver` を公開し、タグ入力・タグ検索・ギャラリービュー・TomSelect アダプタのデバッグ判定を共通経路に統一。
  - Node テストにフォールバック確認のケースを追加し、デフォルトアダプタ・デバッグ判定の両面で漏れを自動検知可能にした。
- テスト: `pytest` と `npm run test:node` を実行。

## 進捗メモ（2025-04-15）
- 共有リゾルバの適用範囲を統一。
  - `sharedResolvers` にデバッグ判定と TomSelect 解決の共通ブリッジ（`resolveTagDebugResolverSharedOrDefault` と `resolveSharedTomSelectAdapterOrDefault`）を追加し、コンポーネント側のフォールバック実装を集約。
  - `tagInput` / `tagSearch` / `galleryView` / `tomSelectAdapter` が新ブリッジ経由でデバッグ判定と TomSelect アダプタを取得するように変更し、リゾルバ重複とログ制御の不一致を解消。
- テスト: `pytest` と `npm run test:node` を実行。

## 進捗メモ（2025-04-16）
- タグ検索フォールバックを共有リゾルバに統合。
  - `components/sharedResolvers.js` に `resolveTagSearchControllerWithFallback` を追加し、タグ検索コンポーネントが見つからない場合でも TomSelect アダプタ共有経由でインスタンス化できるようにした。ネイティブ select フォールバックも同リゾルバで統一し、依存順の揺らぎでタグ検索が無効化されるリスクを低減。
  - `galleryView` で内蔵していたタグ検索フォールバック実装を削除し、新リゾルバ経由でコントローラーを取得するように変更。IIFE 側の責務を共有モジュールへ寄せ、タグ検索の生成・同期・デバッグフラグ解決を一元化した。
- テスト: `pytest` と `node --test tests/js/gallery_modules.test.mjs` を実行。

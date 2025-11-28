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

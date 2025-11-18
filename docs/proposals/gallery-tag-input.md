# ギャラリーのタグ入力改善提案（Tom Select 風 UI）

## 背景
- 現状のタグ入力は `<input type="text">` を直接利用し、スペース区切りでトークン化している。
- 入力中に正規化が走るためスペースで区切りながら追加入力する際に違和感があり、複数タグを直感的に管理しづらい。
- ユーザーからは Tom Select のようなトークン化 UI（タグをピル表示し、Enter・区切りキーで確定できるコンポーネント）を求める声がある。

## 現状の制約
1. ビューワはバンドルレス構成で、`templates/gallery/**/*.js` をそのまま `<script>` で読み込む設計。
2. 既存のタグシリアライザー（`templates/gallery/utils/data.js` の `parseTagTokens`）はスペース／カンマ等の区切り文字を許容しつつ、保存時はセミコロン連結へ正規化している。
3. 依存ライブラリの追加は慎重に行う必要があり、軽量なモジュールか CDN からのスタンドアロン配信が望ましい。

## 提案: 軽量トークン入力レイヤーの導入
1. **モジュール構成**
   - `templates/gallery/components/tagInput.js`（新規）を作成し、DOM 上の `input.item-tags-input` を Tom Select 風に拡張する薄いアダプタを実装。
   - ピル表示やバックスペース操作は純粋な DOM 操作で再現し、依存は最小限（`requestAnimationFrame` と `Element` API のみ）に抑える。
2. **イベント駆動**
   - `focusin`／`keydown` でタグ確定ロジック（スペース／Enter／カンマなどを `parseTagTokens` に委譲）を実行し、確定済みタグは `<span class="item-tag-pill">` としてリストに反映。
   - 未確定テキストは `contenteditable` なシャドウ要素、あるいは input の `value` を維持しつつ見た目はピルの後ろに配置する二層構造で表現する。
3. **アクセシビリティ**
   - ライブリージョンや `aria-label` を追加して「タグ X を追加」「タグ X を削除」のアナウンスを行う。
   - キーボードのみでピルを削除できるよう、`Backspace` 2 回で最後のタグを削除／`Delete` でフォーカス中のタグを除去する操作をサポート。
4. **スタイル調整**
   - 既存の `.item-tags-list`／`.item-tag-pill` スタイルを流用しつつ、編集中の入力カーソルをピル列の末尾に配置するため `display: flex; flex-wrap: wrap;` を採用。
   - `Tom Select` で一般的な `max-width` 超過時の折り返しや `hover` 状態を Sass なしで実現するユーティリティクラスを追加。
5. **ステート同期**
   - 内部状態は既存の `applyItemTags`／`setRecordTags` を引き続き利用し、トークン更新時にこれらの API を呼び出す。
   - ローカルでの未確定入力は data 属性（`data-editing-tags="true"`）で管理し、ビュー側とイベント側の責務を分離。

## 実装ステップ
1. `tagInput.js` を追加してタグ入力向けのクラス（`TagInputController`）を定義。
2. `itemFactory.js` でタグコントロールを生成する際にコントローラを初期化し、`galleryView.applyItemTags` と `galleryEvents` の `updateItemTags` を渡して同期。
3. `gallery.css` にトークン UI のためのスタイル（ピル行のスクロール、フォーカスリング等）を追加。
4. Node テストへ `TagInputController` のユニットテストを追加し、複数タグの追加・削除・CSV 正規化が期待通りかを検証。
5. ブラウザ上での回帰を `npm run test:node`／`pytest` と手動確認で担保し、必要に応じてスクリーンショットを撮影。

## 期待される効果
- スペース区切りでのタグ追加が視覚的に分かりやすくなり、既存 CSV 仕様とも整合。
- 依存追加なしで Tom Select に近い操作感を提供できるため、デプロイ環境の制約に抵触しない。
- 将来的に `Tom Select` 本体や別ライブラリへ差し替える際もアダプタ層があるため最小限の変更で済む。

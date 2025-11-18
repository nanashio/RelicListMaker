# ギャラリーのタグ入力改善提案（Tom Select 本体採用）

## 背景
- 現状のタグ入力は `<input type="text">` を直接利用し、スペース区切りでトークン化している。
- 入力中に正規化が走るためスペースで区切りながら追加入力する際に違和感があり、複数タグを直感的に管理しづらい。
- ユーザーからは Tom Select のようなトークン化 UI（タグをピル表示し、Enter・区切りキーで確定できるコンポーネント）を求める声がある。

## 現状の制約
1. ビューワはバンドルレス構成で、`templates/gallery/**/*.js` をそのまま `<script>` で読み込む設計。
2. 既存のタグシリアライザー（`templates/gallery/utils/data.js` の `parseTagTokens`）はスペース／カンマ等の区切り文字を許容しつつ、保存時はセミコロン連結へ正規化している。
3. 依存ライブラリの追加は慎重に行う必要があり、軽量なモジュールか CDN からのスタンドアロン配信が望ましい。

## 主要候補ライブラリの比較と選定理由
| 項目 | Tom Select | Choices.js | Select2 (jQuery) |
| --- | --- | --- | --- |
| パッケージ形態 | Vanilla JS, `dist/tom-select.complete.js` をそのまま読み込み可能 | Vanilla JS だが ES Module を前提とするビルドが主流で、バンドルレスでの利用には追加ビルドが必要 | jQuery 依存であり、既存ビューアに新規依存を追加する必要がある |
| 複数タグ UI | 標準でトークナイズ（ピル表示、remove ボタン等）が揃っている | トークン機能あり。ただし Remove ボタンはプラグイン頼りで DOM カスタマイズ量が多い | Tagging プラグインはあるが jQuery プラグイン同士の競合に注意 |
| i18n/アクセシビリティ | `render.option_create` 等を通じてメッセージを直接差し替え可能。WAI-ARIA 属性も素の JS から制御できる | 多言語化には CSS/テンプレのオーバーライドが必要で、アクセシビリティ調整の hook が限定的 | jQuery のイベント層を経由するため、キーボード操作の通知を細かく制御しづらい |
| 追加依存とバンドル | JS/CSS/フォントのみで完結し、PyInstaller の `datas` へそのまま追加可能 | Sass コンパイル済み CSS を同梱する必要があり、現行パイプラインへ追加するビルドステップが増える | jQuery + Select2 をまとめて同梱する必要があり、サイズと保守コストが増大 |
| メンテナンス状況 | 2024-2025 時点でも活発に更新されており、`remove_button` 等の公式プラグインが整備されている | Issue の応答はあるが v10 以降は breaking change が続いており、既存ビューアへの適用が難しい | 長期安定しているが、jQuery 依存を新規に持ち込むのは本プロジェクトの方針と合致しない |

Choices.js や Select2 も実績のあるライブラリだが、**既存ビューアはバンドルレス構成であり PyInstaller／GitHub Actions による exe へ依存資産を追加するコスト**を最小化したい。本プロジェクトでは既にバニラ JS ベースのテンプレートが確立しており、新規ビルドツールや jQuery を導入するのは避けたい。一方 Tom Select は `dist` 直下の完成済みアセットをコピーするだけで利用でき、アクセシビリティ向上やローカルストレージ同期の hook も揃っているため、最も適合すると判断した。

## 提案: Tom Select 本体の導入とオフライン対応
1. **モジュール構成**
   - `templates/gallery/components/tagInput.js`（新規）を作成し、DOM 上の `input.item-tags-input` に Tom Select のインスタンスを直接アタッチする薄いアダプタを実装。
   - `node_modules/tom-select/dist/js/tom-select.complete.js` をバンドルし、`requestAnimationFrame` や `Element` API による個別再実装は行わない。
2. **Tom Select 設定**
   - `delimiter: ";"` としつつ、`createFilter`／`persist` で `parseTagTokens` の正規化ロジックに合わせたセミコロン連結へ統一。
   - `plugins: ["remove_button", "restore_on_backspace"]` を有効化してタグ削除 UX を Tom Select 本来の操作系で提供し、アクセシビリティ用 `render.option_create` をカスタムしてライブリージョン通知を行う。
3. **アクセシビリティ**
   - ライブリージョンや `aria-label` を追加して「タグ X を追加」「タグ X を削除」のアナウンスを行う。
   - Tom Select の `onDelete` フックで `Backspace`／`Delete` 操作をハンドリングし、キーボードのみでもタグ削除が完結するようにする。
4. **スタイル調整**
   - 既存の `.item-tags-list`／`.item-tag-pill` スタイルを Tom Select の `.ts-wrapper`／`.ts-control` に適用できるよう調整し、ピル列の折り返しは Tom Select の `plugins.dropdown_input` ではなく CSS 側で `display: flex; flex-wrap: wrap;` を設定。
   - `Tom Select` 付属の `tom-select.css` をインポートしつつ、テーマ上書き用のユーティリティクラスを追加して `hover`／フォーカスリングを統一。
5. **ステート同期**
   - Tom Select インスタンスの `onChange` イベントで `applyItemTags`／`setRecordTags` を呼び出し、CSV ストレージと UI を同期。
   - ローカルでの未確定入力は Tom Select の `input` を信頼し、`data-editing-tags="true"` などの属性でビューとの責務を明示。
6. **オフライン配布**
   - Tom Select の JS/CSS/フォントを `templates/gallery/vendor/tom-select/` にコピーするビルドステップを `package.json` の `build:gallery` スクリプトへ追加し、CDN へ依存しない構成とする。
   - PyInstaller で作成する exe の `datas` 設定および GitHub Actions 上のビルドジョブに Tom Select アセットを含め、オフライン環境でもビューアが完全動作するようにする。

## 実装ステップ
1. `tagInput.js` を追加してタグ入力向けのクラス（`TagInputController`）を定義。
2. `itemFactory.js` でタグコントロールを生成する際にコントローラを初期化し、`galleryView.applyItemTags` と `galleryEvents` の `updateItemTags` を渡して同期。
3. `gallery.css` に Tom Select のテーマを読み込む記述と、既存クラスを上書きする調整スタイル（ピル行のスクロール、フォーカスリング等）を追加。
4. Node テストでは `TagInputController` ではなく Tom Select ラッパーの初期化ユーティリティをモックし、複数タグの追加・削除・CSV 正規化が期待通りかを検証。
5. ブラウザ上での回帰を `npm run test:node`／`pytest` と手動確認で担保し、必要に応じてスクリーンショットを撮影。
6. PyInstaller ビルドと GitHub Actions の exe 生成ワークフローに Tom Select アセットを含めた結果を CI ログで確認し、オフライン配布が壊れていないことを証明する。

## 期待される効果
- スペース区切りでのタグ追加が視覚的に分かりやすくなり、既存 CSV 仕様とも整合。
- Tom Select 本体を採用しつつもオフライン配布向けに exe へバンドルするため、ネットワーク制限下でも既存 CSV 仕様と UX を維持できる。
- GitHub Actions で生成する exe でも同じ Tom Select アセットを組み込み、配布物間の挙動差異をなくせる。

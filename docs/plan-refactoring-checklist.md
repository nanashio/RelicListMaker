# リファクタリング進行チェックリスト

このドキュメントは、RelicListMaker の主要モジュールを段階的にリファクタリングする際の進め方を整理したものです。各ステップ終了時に必ず実施するコマンドと、追加検証・ペンディング事項の管理テンプレートをまとめています。

## 1. ステップ概要と検証コマンド
| ステップ | 主な作業内容 | 完了後に必ず実施するコマンド |
| --- | --- | --- |
| ステップ0: ベースライン確認 | 既存コードの読解、対象範囲の洗い出し、事前の課題整理。 | `python -m venv .venv && source .venv/bin/activate`<br>`pip install -r requirements.txt`<br>`python main.py` ※サンプル動画で基本フローを確認 |
| ステップ1: 抽出・前処理レイヤのリファクタリング | `extract_frames.py` / `preprocess.py` 付近の責務分割と共通ユーティリティの整備。 | `python preprocess.py path/to/sample.png --out preprocessed/`<br>`pytest tests/test_merge_results.py` |
| ステップ2: OCR と照合ロジックの整理 | `match_and_export.py` を中心に OCR 設定、辞書照合、CSV 出力のモジュール化。 | `pytest tests/test_relic_placeholders.py`<br>`pytest tests/test_gallery_js_modules.py` |
| ステップ3: ギャラリー生成・共有モジュール | `generate_gallery.py` や `templates/gallery/` 配下の分離と依存注入の見直し。 | `pytest tests/test_generate_gallery.py`<br>`npm run test:node` |
| ステップ4: ビューワーとブラウザ確認 | `viewer_server.py` や Playwright フィクスチャの検証、ブラウザ挙動の確認。 | `pytest tests/test_viewer_server.py`<br>`npm run test:browser` (CI 不可の場合は `npm run test:browser:headed` や `pytest -k browser` など代替手順を検討) |

> **補足:** 各ステップ完了時には `git status` で差分を確認し、必要であれば部分的に `pytest <path>` で対象テストのみ再実行してください。

## 2. 追加テスト候補と参考資料
- 詳細なテスト運用手順は [docs/guide-testing.md](./guide-testing.md) を参照してください。
- リファクタリング後に優先して追加したいテスト例:
  - **新規モジュール単体テスト**: 分離した純粋関数（例: 正規化ユーティリティ、DOM ビルダー）を `tests/unit/` などに追加。
  - **OCR 設定の回帰テスト**: サンプル画像を用いた `pytest tests/ocr/`（必要に応じて新設）で `match_and_export.py` の推論結果を検証。
  - **ブラウザ操作の拡張シナリオ**: Playwright で色分け、レビュー操作、フィルタ組み合わせのシナリオを増やし、`npm run test:browser` で回帰防止。
  - **統合パイプラインのスモークテスト**: 小規模動画を使った `python main.py --limit N` などのモード（未実装の場合はタスク化）を整え、全フローの健全性を継続確認。

## 3. ペンディング事項テンプレート
未着手や調査中の項目は、以下のフォーマットで追記します。進行中に状態を更新し、次アクションを明確にしてください。

| 発見日 | 項目 | 概要 | 現状ステータス | 次のアクション | 担当 | 備考 |
| --- | --- | --- | --- | --- | --- | --- |
| YYYY-MM-DD | 例: OCR 閾値調整 | サンプル動画で低コントラストが残存。閾値/リサイズの最適化が必要。 | 調査中 | `preprocess.py` に試験オプション追加 → `pytest tests/ocr/` で検証 | @owner | 追加データ取得待ち |

コピーして使いやすいように、同じテーブルをコードブロックでも用意しています。

```markdown
| 発見日 | 項目 | 概要 | 現状ステータス | 次のアクション | 担当 | 備考 |
| --- | --- | --- | --- | --- | --- | --- |
| YYYY-MM-DD |  |  |  |  |  |  |
```

- **現状ステータス** 例: `未着手` / `調査中` / `対応中` / `完了` / `保留`。
- **次のアクション** 例: 「`match_and_export.py` の新アルゴリズムを AB テスト」「Playwright シナリオにレビュー操作を追加」など、具体的な一手を記載。
- **備考** にはリスクや関連 Issue、参考リンクを残し、後続メンバーが追跡できるようにします。

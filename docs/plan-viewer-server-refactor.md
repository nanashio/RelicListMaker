# viewer_server.py リファクタリング計画

## 0. コード分析
- `viewer_server.py` は HTTP サーバーの起動・結果ディレクトリ探索・ギャラリーインデックス生成・レビュー保存 API を単一ファイルで実装している。
- `GalleryRequestHandler` が `SimpleHTTPRequestHandler` を継承しつつ、HTML テンプレート生成、CSV 読み書き、フィールド順序推論、バリデーション、JSON レスポンス生成をすべて内包している。
- `_handle_save_request` は 150 行規模で、Content-Length 解析→JSON デコード→パス検証→CSV 入力→フィールド順序計算→CSV 書き戻し→レスポンス生成までを一括で行っている。
- `ServerContext` がサーバー管理とブラウザ起動 (`_open_browser`) までを担い、GUI からの制御と CLI 実行を同じフローで処理する構造になっている。

## 1. 問題点
1. **HTTP ハンドラの肥大化**: `GalleryRequestHandler` のメソッドが複数責務（静的配信・HTML インデックス・API 保存）を同居させ、テストや差し替えが困難。
2. **データ永続化ロジックの散在**: CSV 読み書き、フィールド順序決定、追記ロジックが `_handle_save_request` に直書きされており、再利用もテストもしづらい。
3. **バリデーション・エラーハンドリングの重複**: Content-Length、JSON 形式、パス検証などのエラー応答が ad-hoc な if 文で散在し、コードの見通しが悪い。
4. **サーバーライフサイクルの直接制御**: `create_server` が `ThreadingHTTPServer` の構築、ブラウザ起動、結果ディレクトリ検証をまとめて実装しており、ユニットテストや CLI 拡張が困難。
5. **設定・テンプレートのハードコード**: `INDEX_TEMPLATE` がファイル内にベタ書きされ、テンプレート差し替えやローカライズが難しい。

## 2. 優先度提案
- **最優先**: `_handle_save_request` をストレージサービスへ切り出し、HTTP ハンドラから CSV 操作とバリデーションを分離する（問題1〜3）。
- **次優先**: サーバー起動・ブラウザオープンを `viewer_server/app.py`（仮称）に移し、GUI / CLI で共有できるエントリポイントを整備する（問題4）。
- **中期的対応**: インデックス HTML のテンプレート化と設定抽象化を進め、マークアップ変更に備える（問題5）。

## 3. 実施ステップ
1. **ストレージユーティリティの導入**（完了）: `viewer_server/storage.py` を新設し、CSV 読込 (`load_csv_records`)、フィールド順序計算 (`resolve_field_order`)、保存 (`write_records`) を関数化する。単体テストでファイル操作を検証する。
2. **バリデーションレイヤの抽出**（完了）: API 入力検証を `viewer_server/validation.py` に切り出し、Content-Length、JSON 解析、パス検証、payload 検証を責務単位で関数化する。HTTP ハンドラは例外キャッチしてレスポンスに変換する構造へ変更する。
3. **ハンドラの責務再編**（完了）: `GalleryRequestHandler` は静的ファイル配信と API ハンドラのルーティングのみを担い、インデックス生成は `viewer_server/index_page.py` に委譲する。`do_GET` と `do_POST` の分岐を整理し、API 呼び出しは `storage` / `validation` を組み合わせて処理する。
4. **サーバー管理クラスの再構築**（完了）: `create_server` と `_open_browser` を `viewer_server/app.py` に再配置し、`ServerContext` はコンテキストマネージャ化（`__enter__` / `__exit__`）する。テストでは `ThreadingHTTPServer` をモックし、ライフサイクル制御を検証する。
5. **テンプレート抽象化**（完了）: `INDEX_TEMPLATE` を `templates/viewer/index.html`（新設）に移動し、`Template` ではなく `string.Template` or `jinja2` を介したロードに変更。テキストアセット読み込み関数（既存 `generate_gallery` の `_load_text_asset` 相当）を再利用できる構造にする。
6. **リグレッションテスト整備**（完了）: 保存 API 用に `pytest tests/test_viewer_server_api.py` を用意し、正常系・異常系・フィールド順序計算をカバーする。既存ブラウザ確認フローは `npm run test:browser` または `python viewer_server.py --results ./fixtures` で維持する。

## 4. テスト戦略
- ストレージユーティリティは pytest の一時ディレクトリフィクスチャを用いて I/O を検証する。
- API ハンドラは `http.client` もしくは `requests` を使った結合テスト、または `GalleryRequestHandler` の `handle` メソッドを直接呼び出すユニットテストで確認する。
- ブラウザ自動テスト（Playwright）が利用できない環境では、代替として `pytest tests/test_viewer_server_api.py` + `python viewer_server.py --results tests/fixtures/results_demo` の手動確認をログへ残す。

## 5. 進捗ログ
| 日付 | トピック | メモ |
| --- | --- | --- |
| 2025-11-03 | 事前調査 | 保存 API とインデックス生成の責務集中を確認し、ストレージユーティリティ・バリデーション分離・サーバーライフサイクル整理を軸とした計画を策定した。 |
| 2025-11-04 | 実装 | `storage` / `validation` / `index_page` / `app` モジュール導入、`GalleryRequestHandler` 再編、テンプレート外部化、保存 API ユニットテストを完了。 |

## 6. ペンディング課題
- 保存 API が CSV 以外のフォーマット（例: JSON, SQLite）を扱えるよう拡張するかどうか、要件を確認する。
- インデックスページのテンプレート化に伴い、国際化対応やカスタムデザインへの対応範囲を決定する必要がある。

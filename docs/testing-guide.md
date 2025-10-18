# Testing Guide

- Python ユニットテスト: `pytest` を実行。
- Node ベースのテストがある場合、pytest から `tests/test_gallery_js_modules.py` が `node --test` を呼び出し併走する。個別に実行したい場合は `node --test tests/js/gallery_modules.test.mjs`。
- サンプルデータに依存するテストはデータが無い場合にスキップされるよう整備する（例: `tests/data/results`）。
- CI やローカルでテスト対象を絞る場合は `pytest -k <keyword>` 等を活用する。
- ブラウザ挙動テスト: 初回に `npm install` を実行し、以降は `npm run test:browser` で Playwright テストを起動。フィクスチャ生成とサーバ起動は `tests/browser/serve_fixture.py` が自動で行う。
- Playwright テストはページロード時のコンソールエラーを検出しつつ、`test-results/viewer-<timestamp>.png` にフルページスクリーンショットを保存する。`test-results/` は `.gitignore` 済みのため、画像は Git 管理には含まれない。


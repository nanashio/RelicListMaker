# Testing Guide

- Python ユニットテスト: `pytest` を実行。
- Node ベースのテストがある場合、pytest から `tests/test_gallery_js_modules.py` が `node --test` を呼び出し併走する。個別に実行したい場合は `node --test tests/js/gallery_modules.test.mjs`。
- サンプルデータに依存するテストはデータが無い場合にスキップされるよう整備する（例: `tests/data/results`）。
- CI やローカルでテスト対象を絞る場合は `pytest -k <keyword>` 等を活用する。


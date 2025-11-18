# 変更履歴

## 2025-03-05: CLI エントリ統合と互換ラッパー廃止の案内

### 背景
リポジトリ直下に散在していた `main.py` / `extract_frames.py` / `preprocess.py` / `generate_gallery.py` / `merge_results.py`
は、2025-03-04 時点で `python -m relic_cli <command>` を唯一の公式エントリとして置き換え済みです。これに伴い、旧スクリプトを直接
呼び出すフローは動作しなくなり、新しい CLI サブコマンドに移行する必要があります。

### 主な変更点
- `relic_cli/` パッケージを CLI ハブとして採用し、`run-pipeline` / `extract-frames` / `preprocess` / `generate-gallery` /
  `merge-results` / `bundle-tesseract` などのサブコマンドを提供します。
- 互換ラッパーは削除され、GUI・テスト・PyInstaller・ドキュメントを含む全ての起動経路が `python -m relic_cli <command>`
  に統一されました。
- ギャラリー API は `gallery` パッケージから再エクスポートされ、従来 `generate_gallery.py` が持っていた
  `DEFAULT_ITEM_IMAGE_VIEW_BOX` などの定数も `gallery` モジュール経由で参照できます。
- Windows 配布物では `RelicListMaker.exe` から `relic_cli.__main__` を起動するように更新し、同梱 Tesseract の検出・有効化を
  `bundle-tesseract` サブコマンド経由で確認できるようになりました。

### 推奨される移行手順
1. ローカル・CI・自動化スクリプトで `python main.py` や `python extract_frames.py` を呼び出している箇所を検索します。
2. 下表を参考に `python -m relic_cli <command>` へ置き換えます。

| 旧スクリプト | 新しいサブコマンド | 代表的な引数 |
| --- | --- | --- |
| `main.py` | `python -m relic_cli run-pipeline` | `--video-dir` / `--result-dir` / `--ocr-upsample` |
| `extract_frames.py` | `python -m relic_cli extract-frames` | `--frame-dir` / `--crop-dir` / `--stride` |
| `preprocess.py` | `python -m relic_cli preprocess` | `--out` / `--scale` / `--threshold` |
| `generate_gallery.py` | `python -m relic_cli generate-gallery` | `--results-csv` / `--image-dir` / `--output-html` |
| `merge_results.py` | `python -m relic_cli merge-results` | `--include-unreviewed` / `--target-name` |
| `tesseract_bundle.py` (スクリプト実行) | `python -m relic_cli bundle-tesseract` | `--require` / `--activate` |

3. GUI や PyInstaller ビルドで追加の設定を行っている場合は、`relic_cli.__main__` を実行対象に指定します。
4. `README.md` の CLI 手順や `docs/guide-refactoring-playbook.md` などのドキュメントを参照し、新しいコマンドの詳細や
   `--help` に記載されたオプションを確認します。

### 参考テスト
- `python -m relic_cli --help`
- `pytest tests/test_generate_gallery.py tests/test_merge_results.py`

同変更に関する詳細な検討プロセスは `docs/plan-script_consolidation.md` を参照してください。

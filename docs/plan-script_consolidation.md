# ルート直下のPythonスクリプト統廃合検討メモ

## 背景
`main.py`・`extract_frames.py` などのスクリプトがリポジトリ直下に散在しており、利用目的が重なって見えるためエントリーポイントを整理したい。

## 現状の役割整理
- `main.py` (66行): パイプライン設定を組み立てて `pipeline.run_pipeline` を呼び出す実行エントリーポイント。【F:main.py†L1-L44】
- `extract_frames.py` (68行): 動画からフレームを間引き抽出し、クロップも行うシンプルな単機能スクリプト。【F:extract_frames.py†L1-L51】
- `preprocess.py` (88行): OCR向けの前処理を個別画像に適用するユーティリティ CLI。【F:preprocess.py†L1-L48】
- `generate_gallery.py` (58行): ギャラリー生成のエントリーポイント兼、テンプレート関連の公開シンボル集約。【F:generate_gallery.py†L1-L45】
- `merge_results.py` (463行): 複数の結果ディレクトリを統合するロジックを持つ大きめのユーティリティ。レビューCSVの優先順位や既存統合結果のメタ収集など責務が多い。【F:merge_results.py†L1-L77】
- その他 (`gallery_assets.py` など): テンプレート資材の配置やバンドル生成など補助的な CLI が点在している。

## 現行配置の課題
- 役割ごとに単一ファイルが増え、ルート直下の見通しが悪い。
- CLIごとに引数パースや定数が重複しやすく、共通ヘルパーが生まれにくい。
- `merge_results.py` のような大きいユーティリティは、さらに他機能と同居させると可読性が低下する。

## 推奨統合方針
1. **CLIハブを新設**: `cli/` もしくは `relic_cli/` パッケージを追加し、`python -m relic_cli <command>` の形式でサブコマンドを提供する (`extract-frames` / `preprocess` / `generate-gallery` / `merge-results` / `bundle-tesseract` など)。
2. **既存エントリーポイントの薄型化**: 現在のルートスクリプトはサブコマンド起動用の薄いモジュールに置き換え、実装は `relic_cli/commands/` や既存の `relic_pipeline` 配下へ移す。これによりルート直下のファイル数を削減しつつ、テストしやすい分割を保てる。
3. **共通ユーティリティの抽出**: 引数パーサ、パス解決、進捗表示などの共通処理を `relic_cli/utils.py` としてまとめ、重複を避ける。
4. **段階的移行**: 互換性維持のため、当面は旧スクリプト名で `__main__` を残しつつ内部で新CLIを呼び出すシュラップを置き、READMEの実行例を順次差し替える。

## 統合が難しい/避けたいケース
- `merge_results.py` は 463 行と大きく、多数の補助関数を含むため、他スクリプトと安易に結合すると1ファイルが肥大化し保守性が下がる。サブコマンド化して責務単位でモジュールを分割する方が現実的。
- `generate_gallery.py` や `main.py` はパイプラインの公開インターフェースとして利用されている可能性があり、モジュールパス変更はツール利用者の呼び出しを破壊するリスクがある。移行期は既存パスをエイリアスとして残すか、リリースノートで周知する必要がある。

## 次のステップ案
- `relic_cli/` パッケージと `__main__.py` を追加し、最低限 `extract-frames` と `preprocess` をサブコマンド化して動作確認する。✅ 本コミットで実装済み（`python -m relic_cli` で呼び出し可能）。
- READMEの実行手順をサブコマンド形式に更新し、旧コマンドは互換レイヤーとして一定期間サポートする。⬅️ 未着手（旧スクリプトからは `relic_cli` に委譲するシュラップを追加済み）。
- 段階的に `merge_results.py` の関数群を `relic_cli/commands/merge_results.py` へ移し、ユニットテストを追加してリグレッションを防ぐ。

## 直近の実施内容
- `relic_cli/` パッケージを新規追加し、`extract-frames` / `preprocess` サブコマンドを提供。
- 既存の `extract_frames.py` / `preprocess.py` からは `python -m relic_cli` に委譲する互換レイヤーを用意し、旧CLI利用者の導線を維持。
- サブコマンド共有ヘルパー（`relic_cli.utils`）を用意し、今後のコマンド追加に備えて土台を整備。

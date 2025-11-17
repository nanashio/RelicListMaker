# ルート直下のPythonスクリプト統廃合検討メモ

## 背景
`main.py`・`extract_frames.py` などのスクリプトがリポジトリ直下に散在しており、利用目的が重なって見えるためエントリーポイントを整理したい。

## 現状の役割整理
- `main.py` (66行): パイプライン設定を組み立てて `pipeline.run_pipeline` を呼び出す実行エントリーポイント。【F:main.py†L1-L44】
- `extract_frames.py` (68行): 動画からフレームを間引き抽出し、クロップも行うシンプルな単機能スクリプト。【F:extract_frames.py†L1-L51】
- `preprocess.py` (88行): OCR向けの前処理を個別画像に適用するユーティリティ CLI。【F:preprocess.py†L1-L48】
- `generate_gallery.py` (58行): ギャラリー生成のエントリーポイント兼、テンプレート関連の公開シンボル集約。【F:generate_gallery.py†L1-L45】
- `merge_results.py` (463行): 複数の結果ディレクトリを統合するロジックを持つ大きめのユーティリティ。レビューCSVの優先順位や既存統合結果のメタ収集など責務が多い。【F:merge_results.py†L1-L77】
- その他 (`gallery/assets.py` など): テンプレート資材の配置やバンドル生成など補助的な CLI が点在している。

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
- READMEの実行手順をサブコマンド形式に更新し、旧コマンドは互換レイヤーとして一定期間サポートする。✅ `README.md` に `python -m relic_cli` の解説を追加し、`preprocess.py`/`extract_frames.py` は互換レイヤーである旨を明記した。
- 段階的に `merge_results.py` の関数群を `relic_cli/commands/merge_results.py` へ移し、ユニットテストを追加してリグレッションを防ぐ。
  - ✅ `python -m relic_cli merge-results` サブコマンドを追加し、既存の `merge_results.merge_results` を呼び出す形で CLI 入口を整備した。
  - ✅ `merge_results.py` 本体の実装を `relic_cli/commands/merge_results.py` へ移し、ルート直下のモジュールは互換レイヤーとしてエクスポートのみに集約した。
  - ✅ CLI 側へ移したロジックを `relic_cli.commands.merge_results` パッケージ内で責務別モジュール（`datasets.py` / `images.py` / `rows.py` / `viewer.py`）へ分割し、
    CSV 走査や画像コピーといった粒度で再利用可能なヘルパーに整理した。
  - ✅ 新設したヘルパー向けに `tests/cli/test_merge_results_helpers.py` を追加し、データセット収集と画像コピーのユニットテストを実装してリグレッション検知の足場を整備。
- ギャラリー生成コマンドを `relic_cli` に取り込み、テンプレートや辞書のパスを CLI 引数で上書きできるようにする。
  - ✅ `python -m relic_cli generate-gallery` サブコマンドを追加し、旧 `generate_gallery.py` は互換レイヤーとして CLI へ委譲するだけにした。README に実行例も追記済み。
- メインパイプライン (`main.py`) も `relic_cli` から起動できるようにし、動画処理～HTML生成までを一括コマンドに集約する。
  - ✅ `python -m relic_cli run-pipeline` サブコマンドを追加し、動画ディレクトリや OCR 設定、列表示の上書きなどを CLI 経由で渡せるよう整備した。README にも利用例を追記済み。

- バンドル済み Tesseract の配置確認や有効化を CLI から行えるようにする。
  - ✅ `python -m relic_cli bundle-tesseract` サブコマンドを追加し、バンドル済み実行ファイルの検出、`pytesseract` への適用、WSL などでシステム版を優先する際のステータス表示を行えるようにした。
  - ✅ `--require` でバンドル欠如をエラー扱いにでき、`--activate` で `configure_pytesseract()` を明示的に実行するため、CI や配布前チェックで同梱アセットの健全性を確かめやすくなった。
  - ✅ README のセットアップ手順と CLI サンプルに `bundle-tesseract` の説明を追加し、ユーザーが手元の環境でバンドル済みバイナリの存在を確認する導線を用意した。

## 直近の実施内容
- `relic_cli/` パッケージを新規追加し、`extract-frames` / `preprocess` サブコマンドを提供。
- 既存の `extract_frames.py` / `preprocess.py` からは `python -m relic_cli` に委譲する互換レイヤーを用意し、旧CLI利用者の導線を維持。
- サブコマンド共有ヘルパー（`relic_cli.utils`）を用意し、今後のコマンド追加に備えて土台を整備。
- `README.md` に CLI サブコマンドの使い方セクションを追加し、実行例や互換ラッパーの位置づけを明文化。
- `merge_results.py` に対する CLI サブコマンド (`python -m relic_cli merge-results`) を追加し、統合ユーティリティの起動経路を他サブコマンドと揃えた。
- `merge_results.py` の実装を `relic_cli/commands/merge_results.py` に取り込み、既存 CLI から直接ロジックを呼び出す構造に変更。ルートスクリプトは過去互換エントリーポイントとしてエイリアス定義だけを持つようにした。
- ギャラリー生成の CLI 化により、`generate_gallery.py` へ直接依存していたワークフローでも `python -m relic_cli generate-gallery` へ統一できるようにした。互換レイヤーを維持したまま、テンプレート・辞書パスの指定やラベル記号の上書きなどを `--help` から把握可能にしている。
- `main.py` が担っていたパイプライン実行も `run-pipeline` サブコマンド経由で扱えるようにし、動画選択や OCR 設定、ビューアの view-box 上書き等を CLI 引数で完結できるようになった。
- `extract_frames.py` と `preprocess.py` の実装をそれぞれ `pipeline/extraction.py` と `relic_cli.commands.preprocess` に移動し、ルート直下には互換ラッパーだけを残して CLI からもパイプラインからも共通ロジックを参照できるよう整理した。
- ギャラリーアセット準備モジュールを `gallery_assets.py` から `gallery/assets.py` へ移設し、`gallery.render` やテストからの参照も
  パッケージ内のモジュール経由に更新してルート直下の Python ファイル削減をさらに進めた。

## 最新状況（2024-02-21）
- ルート直下の互換ラッパー（`extract_frames.py` / `preprocess.py` / `generate_gallery.py` / `merge_results.py`）がいずれも `relic_cli` サブコマンドへ委譲していることを確認。CLI ハブを通じた起動とモジュール直呼びの双方で同一実装を共有できる状態を維持している。
- `relic_cli/commands/merge_results/` 配下のヘルパー群に対し `pytest tests/cli/test_merge_results_helpers.py` を実行し、データセット収集や画像コピーのユニットテストが引き続き成功することを確認した。

## 次フェーズ計画（互換ラッパー廃止）
`python -m relic_cli` を既定の入口として定着させたため、ルート直下に残る互換ラッパーを段階的に削除し、新しい CLI のみを正式サポートとする。以下の工程を順に進める。

1. **互換ラッパーと参照元の棚卸し**
   - 対象: `extract_frames.py` / `preprocess.py` / `generate_gallery.py` / `merge_results.py` / `main.py` / `gallery_assets.py` など互換目的で残存しているモジュール。
   - README・ドキュメント・テスト・外部ツール（PyInstaller 仕様書など）で旧スクリプトを案内している箇所を洗い出し、削除に伴う差分を一覧化する。

### ステップ1進捗（互換ラッパー参照の棚卸し：2025-11-17）
- ルート互換モジュールを削除する際に同時更新が必要となる参照箇所を整理した。以下の一覧はユーザー向けドキュメント／開発者ドキュメント／コード／テストごとに分類しており、削除タスクをチケット化する際の影響調査メモとして利用できる。

| モジュール | ドキュメントでの参照 | コード・テストでの参照 | 備考 |
| --- | --- | --- | --- |
| `main.py` | `AGENTS.md` の使用例、`README.md` の概要／ツリー表示／実行例、`docs/guide-refactoring-playbook.md` のスモークテスト記述、`docs/plan-reliclist-refactor.md`・`docs/plan-pipeline-module.md` の計画説明 | （直接 import なし、互換ラッパー単体で完結） | ドキュメント群のコマンド表記を `python -m relic_cli run-pipeline` へ置換し、`README` のツリーから `main.py` を除外する必要がある。 |
| `extract_frames.py` | `AGENTS.md` の役割紹介、`README.md` のツリー／互換レイヤー説明、`docs/guide-refactoring-playbook.md` の手順表、`docs/guide-naming-conventions.md` の命名例 | （直接 import なし） | 互換削除後は CLI サブコマンドへの誘導に一本化するため、`python extract_frames.py` の記述を `python -m relic_cli extract-frames` へ更新する。 |
| `preprocess.py` | `AGENTS.md` のコマンド例、`README.md` のツリー／互換レイヤー説明／実行例、`docs/guide-refactoring-playbook.md` の表記、`docs/guide-naming-conventions.md` の例示 | `tests/cli/test_commands.py` が CLI から再利用しているものの、直接モジュール参照は `relic_cli.commands.preprocess` のみ | README 等の `python preprocess.py` 記載を CLI 版へ差し替える。テストは既に新実装を import しているため削除時の影響は限定的。 |
| `generate_gallery.py` | `AGENTS.md`、`README.md`（ツリー・互換説明）、`docs/plan-reliclist-refactor.md`、`docs/guide-refactoring-playbook.md`（ステップ3）、`docs/plan-gallery-refactor.md` | `pipeline/pipeline.py`、`relic_cli/commands/generate_gallery.py`、`relic_cli/commands/merge_results/merge.py`、`tests/test_generate_gallery.py` がモジュールを直接 import | モジュール削除時は `gallery` パッケージ内の正式 API へ import 元を移し替える必要がある。テストや CLI コマンドの import 先をまとめて置換するタスクが必要。 |
| `merge_results.py` | `README.md`（補助列エラーの注意）、`docs/reference-csv-columns.md`、`docs/plan-effect-correction-removal.md`、本ドキュメントの既存説明 | `relic_cli/commands/merge_results/` 配下、`gui/controllers.py` / `gui/services.py`、`tests/test_merge_results.py` が `merge_results` を import | 互換ラッパー削除時は GUI とテストの import を `relic_cli.commands.merge_results` へ切り替える必要がある。README・参照ドキュメントの module path も CLI サブコマンド表記へ更新する。 |
| `gallery_assets.py` | `docs/plan-script_consolidation.md` 内で互換対象として言及されているのみ | （該当ファイルは既に削除済み） | 参照箇所の更新は本メモの記述修正のみで済む。 |

- 上記一覧に含まれない自動化スクリプトや PyInstaller 設定では旧ファイル名を直接参照していないことを確認した。
- 次ステップでは README・各ガイドのコマンド表記を `python -m relic_cli <command>` へ順次書き換えるとともに、`generate_gallery.py` / `merge_results.py` を参照するコードを `relic_cli` パッケージか `gallery` 配下の正式 API に移すリファクタリングを行う。

2. **公式ドキュメントと配布物の更新案内**
   - README や `docs/` 配下のガイドを全面的に `python -m relic_cli <command>` 形式へ書き換え、旧コマンドを使用しないよう明示する。
   - `viewer_server` や GUI など別経路で互換ラッパーを叩いていないか確認し、必要なら `relic_cli` サブコマンドに切り替える手順を追記する。

3. **互換ラッパー削除とエントリーポイント整備**
   - ルート直下の互換モジュールを削除し、`python extract_frames.py` 等の呼び出しを不可にする。
   - 代替として `python -m relic_cli` を呼び出す `console_scripts` エントリーポイントや `.bat` / `.sh` ランチャーが必要であれば `setup.cfg` / `pyproject.toml` / `package.json` に追加する。

4. **テスト・CI・配布パッケージの更新**
   - `pytest` ジョブや GitHub Actions、PyInstaller スクリプトなどで旧スクリプトを実行していないか確認し、`python -m relic_cli ...` へ置き換える。
   - ルート直下ファイル削除後の差分に合わせて `pyinstaller.spec` や `requirements-build.txt` の参照パスを更新し、ビルドが通ることを確認する。

5. **リリースノートと移行ガイドの告知**
   - `README` または `docs/changelog.md`（未作成なら新規）に互換ラッパー廃止の理由と新 CLI への移行手順を記載し、バージョンタグ発行時に周知する。
   - 必要に応じて `python -m relic_cli --help` の出力例や主要サブコマンドのハイライトを添付し、利用者が迷わないようにする。

### 次フェーズのトラッキング方法
- 上記 1〜5 の完了状態をこのドキュメントに反映し、各ステップの完了日と確認済みテストコマンドを追記する。
- 互換ラッパー削除後に発見した外部依存（自動化スクリプト、他プロジェクトなど）があれば、影響範囲と代替策を本メモ内に記録する。

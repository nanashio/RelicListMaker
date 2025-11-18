# ルート直下のPythonスクリプト統廃合検討メモ

## 背景
`main.py`・`extract_frames.py` などのスクリプトがリポジトリ直下に散在しており、利用目的が重なって見えるためエントリーポイントを整理したい。

> **2025-03-04 アップデート**: 互換ラッパーとして残していた `main.py` / `extract_frames.py` / `preprocess.py` / `generate_gallery.py` / `merge_results.py` は削除済みで、`python -m relic_cli <command>` が唯一の公式エントリとなった。以下の「現状の役割整理」は歴史的な位置づけを残すために記載している。

## 現状の役割整理
- `main.py` (66行): パイプライン設定を組み立てて `pipeline.run_pipeline` を呼び出す実行エントリーポイント（現在は削除済み）。
- `extract_frames.py` (68行): 動画からフレームを間引き抽出し、クロップも行うシンプルな単機能スクリプト（現在は削除済み）。
- `preprocess.py` (88行): OCR向けの前処理を個別画像に適用するユーティリティ CLI（現在は削除済み）。
- `generate_gallery.py` (58行): ギャラリー生成のエントリーポイント兼、テンプレート関連の公開シンボル集約（現在は削除済み）。
- `merge_results.py` (463行): 複数の結果ディレクトリを統合するロジックを持つ大きめのユーティリティ。レビューCSVの優先順位や既存統合結果のメタ収集など責務が多い（現在は削除済み）。
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
- 2025-03-04: 互換ラッパー（`main.py` / `extract_frames.py` / `preprocess.py` / `generate_gallery.py` / `merge_results.py`）を削除し、`gallery/__init__.py` でギャラリー API を再エクスポート。GUI・テスト・CLI の import を `relic_cli/commands/` と `gallery` パッケージに統一した。
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

## 最新状況（2025-03-04）
- 互換ラッパーとして残していた `main.py` / `extract_frames.py` / `preprocess.py` / `generate_gallery.py` / `merge_results.py` を削除し、`python -m relic_cli <command>` のみが公式エントリになった。GUI・テスト・CLI は `relic_cli/commands/` 配下を直接 import する構成に統一済み。
- `gallery/__init__.py` でギャラリー用のデフォルト定数・API を再エクスポートし、従来 `generate_gallery.py` から取得していた定数（`DEFAULT_ITEM_IMAGE_VIEW_BOX` など）を `gallery` パッケージ経由で参照できるようにした。
- README・AGENTS・`docs/guide-naming-conventions.md`・`docs/guide-refactoring-playbook.md` などに残っていた旧コマンド表記を `python -m relic_cli ...` へ置き換え、互換ラッパー削除後の導線と実行例を明記した。

## 次フェーズ計画（互換ラッパー廃止）
`python -m relic_cli` を既定の入口として定着させたため、ルート直下に残る互換ラッパーを段階的に削除し、新しい CLI のみを正式サポートとする。以下の工程を順に進める。

1. **互換ラッパーと参照元の棚卸し**
   - 対象: `extract_frames.py` / `preprocess.py` / `generate_gallery.py` / `merge_results.py` / `main.py` / `gallery_assets.py` など互換目的で残存しているモジュール。
   - README・ドキュメント・テスト・外部ツール（PyInstaller 仕様書など）で旧スクリプトを案内している箇所を洗い出し、削除に伴う差分を一覧化する。

### ステップ1進捗（互換ラッパー参照の棚卸し：2025-11-17）
- ルート互換モジュールを削除する際に同時更新が必要となる参照箇所を整理した。以下の一覧はユーザー向けドキュメント／開発者ドキュメント／コード／テストごとに分類しており、削除タスクをチケット化する際の影響調査メモとして利用できる。

| モジュール | ドキュメントでの参照 | コード・テストでの参照 | 備考 |
| --- | --- | --- | --- |
| `main.py`（削除済） | `AGENTS.md` の使用例、`README.md` の概要／ツリー表示／実行例、`docs/guide-refactoring-playbook.md` のスモークテスト記述、`docs/plan-reliclist-refactor.md`・`docs/plan-pipeline-module.md` の計画説明 | （直接 import なし、互換ラッパー単体で完結） | 2025-03-04 に CLI 表記へ更新し、`README` のツリーから `main.py` を除外済み。 |
| `extract_frames.py`（削除済） | `AGENTS.md` の役割紹介、`README.md` のツリー／互換レイヤー説明、`docs/guide-refactoring-playbook.md` の手順表、`docs/guide-naming-conventions.md` の命名例 | （直接 import なし） | 2025-03-04 に CLI サブコマンドへの誘導へ置換済み。旧コマンド記述は `python -m relic_cli extract-frames` に統一。 |
| `preprocess.py`（削除済） | `AGENTS.md` のコマンド例、`README.md` のツリー／実行例、`docs/guide-refactoring-playbook.md` の表記、`docs/guide-naming-conventions.md` の例示 | `tests/cli/test_commands.py` が CLI から再利用しているものの、直接モジュール参照は `relic_cli.commands.preprocess` のみ | 2025-03-04 に README などの `python preprocess.py` 記述をサブコマンド表記へ差し替え済み。 |
| `generate_gallery.py`（削除済） | `AGENTS.md`、`README.md`、`docs/plan-reliclist-refactor.md`、`docs/guide-refactoring-playbook.md`（ステップ3）、`docs/plan-gallery-refactor.md` | `pipeline/pipeline.py`、`relic_cli/commands/generate_gallery.py`、`relic_cli/commands/merge_results/merge.py`、`tests/test_generate_gallery.py` がモジュールを直接 import | 2025-03-04 に `gallery` パッケージ経由へ import 元を移し、テストと CLI を `gallery.generate_html` に切り替え済み。 |
| `merge_results.py`（削除済） | `README.md`（補助列エラーの注意）、`docs/reference-csv-columns.md`、`docs/plan-effect-correction-removal.md`、本ドキュメントの既存説明 | `relic_cli/commands/merge_results/` 配下、`gui/controllers.py` / `gui/services.py`、`tests/test_merge_results.py` | 2025-03-04 に GUI・テスト・README を `relic_cli.commands.merge_results` 表記へ更新し、互換モジュールを廃止。 |
| `gallery_assets.py` | `docs/plan-script_consolidation.md` 内で互換対象として言及されているのみ | （該当ファイルは既に削除済み） | 参照箇所の更新は本メモの記述修正のみで済む。 |

- 上記一覧に含まれない自動化スクリプトや PyInstaller 設定では旧ファイル名を直接参照していないことを確認した。
- 次ステップでは README・各ガイドのコマンド表記を `python -m relic_cli <command>` へ順次書き換えるとともに、`generate_gallery.py` / `merge_results.py` を参照するコードを `relic_cli` パッケージか `gallery` 配下の正式 API に移すリファクタリングを行う。

2. **公式ドキュメントと配布物の更新案内**
   - README や `docs/` 配下のガイドを全面的に `python -m relic_cli <command>` 形式へ書き換え、旧コマンドを使用しないよう明示する。
   - `viewer_server` や GUI など別経路で互換ラッパーを叩いていないか確認し、必要なら `relic_cli` サブコマンドに切り替える手順を追記する。

### ステップ2進捗（CLI 表記の明示: 2025-02-15）
- `AGENTS.md` の基本コマンドを `python -m relic_cli run-pipeline` / `python -m relic_cli preprocess` に更新し、旧 `main.py` や `preprocess.py` は互換レイヤーである旨を明記した。
- README の「基本的なワークフロー」を `run-pipeline` サブコマンド前提へ差し替え、CLI セクションでも新しい書式を正式な入口として案内するよう修正した。
- `docs/guide-refactoring-playbook.md` のステップ別チェックリストとテスト手順を `relic_cli` ベースへ置き換え、調査テンプレートからも旧 `preprocess.py` 参照を排除した。

### ステップ3進捗（互換ラッパー削除: 2025-03-04）
- `main.py` / `extract_frames.py` / `preprocess.py` / `generate_gallery.py` / `merge_results.py` を削除し、GUI・CLI・テストすべてが `relic_cli/commands/` と `gallery` パッケージを直接 import する構成へ移行した。
- `gallery/__init__.py` にデフォルト定数（`DEFAULT_ITEM_IMAGE_VIEW_BOX` など）と `generate_html` を再エクスポートし、`relic_cli/commands/generate_gallery.py` や `tests/test_generate_gallery.py` からは `gallery` パッケージ経由で機能を参照するようにした。
- `gui/controllers.py` / `gui/services.py` / `tests/test_merge_results.py` を `relic_cli.commands.merge_results` へ切り替え、README・AGENTS・`docs/guide-naming-conventions.md`・`docs/guide-refactoring-playbook.md` に残っていた旧スクリプト名を `python -m relic_cli <command>` 表記へ更新した。
- テスト確認: `pytest tests/test_generate_gallery.py tests/test_merge_results.py`

3. **互換ラッパー削除とエントリーポイント整備**
   - ルート直下の互換モジュールを削除し、`python extract_frames.py` 等の呼び出しを不可にする。
   - 代替として `python -m relic_cli` を呼び出す `console_scripts` エントリーポイントや `.bat` / `.sh` ランチャーが必要であれば `setup.cfg` / `pyproject.toml` / `package.json` に追加する。

4. **テスト・CI・配布パッケージの更新**
   - `pytest` ジョブや GitHub Actions、PyInstaller スクリプトなどで旧スクリプトを実行していないか確認し、`python -m relic_cli ...` へ置き換える。
   - ルート直下ファイル削除後の差分に合わせて `pyinstaller.spec` や `requirements-build.txt` の参照パスを更新し、ビルドが通ることを確認する。

### ステップ4進捗（PyInstaller CLI更新: 2025-03-05）
- `pyinstaller.spec` の CLI バンドル対象を `relic_cli/__main__.py` へ更新し、生成される `RelicListMakerCLI.exe` が新しい公式サブコマンドハブを実行するようにした。
- `python -m relic_cli --help` で CLI のエントリポイントを確認し、PyInstaller 向けエントリと一致していることを手元で検証済み。
- 2025-11-18: CLI 統合後の一括テストとして `npm run test:all` を実行し、`pytest` と Node テストは成功したが Playwright はブラウザバイナリ未取得により失敗。`npx playwright install --with-deps` および `npx playwright install chromium` を試行したものの、プロキシ環境下で 403 Forbidden を返して取得できなかったため、代替として Python/Node テストの完了結果のみを記録した。

### ステップ5進捗（リリースノートと移行ガイドの告知: 2025-03-05）
- 互換ラッパー廃止と `python -m relic_cli <command>` への統一方針をまとめた `docs/changelog.md` を新規作成し、背景・移行手順・テストコマンドを列挙して利用者が変更点を把握しやすいようにした。
- リリースノートには旧スクリプトと対応するサブコマンドの対応表を掲載し、CI や自動化スクリプトの置き換えが漏れないようにした。
- README にはユーザー通知向けの変更履歴セクションを追加していたが、まだ未リリースのため一般ユーザー向け告知は不要と判断し、2025-03-05 時点で同セクションは再び削除した。今後は `docs/changelog.md` を開発チーム向けの進捗共有として活用し、公開準備が整うまでは README をシンプルな配布説明に留める方針。

5. **リリースノートと移行ガイドの告知**（2025-03-05 に初回実施済・追記があれば随時更新）
   - `README` または `docs/changelog.md`（未作成なら新規）に互換ラッパー廃止の理由と新 CLI への移行手順を記載し、バージョンタグ発行時に周知する。
   - 必要に応じて `python -m relic_cli --help` の出力例や主要サブコマンドのハイライトを添付し、利用者が迷わないようにする。

### 追加確認（2025-11-19）
- `rg -n "python main.py"` / `rg -n "extract_frames.py"` / `rg -n "generate_gallery.py"` などを実行し、ドキュメント用途を除いて旧 CLI 名を参照するコードや設定ファイルが残っていないことを再確認した。
- `pyinstaller.spec` の CLI エントリが `relic_cli/__main__.py` を指していること、`README.md`・`AGENTS.md`・テストコードがすべて `python -m relic_cli <command>` を前提にしていることを確認し、互換ラッパー削除後の残課題がない状態を維持できていると判断した。
- 本メモ上で定義したステップ 1〜5 はいずれも完了済みで、追加作業が発生した場合のみ追記すればよい状況となった。

### 次フェーズのトラッキング方法
- 上記 1〜5 の完了状態をこのドキュメントに反映し、各ステップの完了日と確認済みテストコマンドを追記する。
- 互換ラッパー削除後に発見した外部依存（自動化スクリプト、他プロジェクトなど）があれば、影響範囲と代替策を本メモ内に記録する。

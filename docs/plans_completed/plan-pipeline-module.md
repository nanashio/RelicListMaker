# pipeline/ モジュール化設計メモ

## 目的
- `main.py` に集中している入出力制御・進行管理ロジックを段階的に分割し、将来的な `pipeline/` パッケージへ移行するための設計指針をまとめる。

> **2025-03-04 メモ:** `main.py` は削除され、パイプラインの起動は `python -m relic_cli run-pipeline` と `pipeline.run_pipeline` API に一本化された。以下の整理は移行前の責務分析として残している。
- 動画ファイル収集から HTML 出力までの依存方向を固定し、責務ごとのモジュール境界を明確にする。
- 既存の `main()` を薄いエントリーポイントとして保ちつつ、再利用可能な `run_pipeline` API を設計する。

## 実装状況サマリー（2025-11-27 現在）

| 領域 | 状態 | メモ |
| --- | --- | --- |
| 入力正規化 (`pipeline/inputs.py`) | ✅ 完了 | `gather_video_files` / `build_override_map` を移設し、Path・文字列・`~` 指定を一貫して絶対パスへ正規化できるよう整理済み。 |
| タスク生成 (`pipeline/tasks.py`) | ✅ 完了 | `VideoTask` dataclass と `create_tasks` / `decide_item_color` を公開し、CLI/GUI 共通で色推定とタスク構築を再利用できる。 |
| 進行管理 (`pipeline/progress.py`) | ✅ 完了 | `ProgressReporter` プロトコルと CLI / コールバック実装を追加し、UI からの進行通知注入を可能にした。 |
| 処理フロー (`pipeline/processors.py`) | ✅ 完了 | 動画単位の抽出→OCR→CSV 化を `process_video` に集約し、進行通知・出力ディレクトリ作成をモジュール化。 |
| オーケストレーション (`pipeline/pipeline.py`) | ✅ 完了 | `PipelineSettings` / `PipelineResult` / `run_pipeline` を実装し、タスク引き渡しと戻り値の構造化を完了。 |
| エントリーポイント (`main.py`) | ✅ 完了 | `run_pipeline` を呼び出す薄いラッパーに置き換え、GUI エントリ（`python -m gui`）との API 共有ができる状態。 |

### 完了済みハイライト
- 入力収集からタスク生成までのパス正規化を統一し、上書き指定と動画パスの突き合わせを絶対パスベースで行えるようになった。
- `ProgressReporter` 抽象を導入したことで、CLI 表示と GUI コールバックを差し替え可能な構成へ移行済み。
- `process_video` が `ProcessedVideoResult` を返却し、`datasets/builder.py::build_dataset_entries` を介して HTML 生成用データセットへ連携できる構成に更新された。
- `tests/pipeline/` に入力正規化とタスク生成のユニットテストを追加し、相対パス指定や `none` 上書きなどの回帰を防止できるようにした。
- README に `run_pipeline` / `create_tasks` の利用例を追記し、CLI 以外からの再利用方法を共有した。
- `process_video` の疎通テストを `tests/pipeline/test_processors.py` に追加し、依存モジュール呼び出しと戻り値整形を検証できるようになった。
- README に色上書き辞書の渡し方を追記し、運用時のケーススタディを参照できるようにした。

## 進捗ログ

| 日付 | トピック | メモ |
| --- | --- | --- |
| 2025-11-20 | Path 正規化の拡充 | `pipeline/inputs.py` / `pipeline/tasks.py` を Path・文字列両対応に見直し、`create_tasks` が常に絶対パスを保持するよう調整した。 |
| 2025-11-27 | 計画書リフレッシュ | 進行状況をテーブル化し、ロードマップと次アクションを `plan-gallery-refactor.md` に倣って整理。 |
| 2025-12-05 | 入力/タスクのユニットテスト整備 | `tests/pipeline/` を新設し、動画列挙・上書き解決・色推定の回帰テストを追加。README に API 使用例を追加し、外部スクリプトからの再利用手順を明確化。 |
| 2025-12-06 | 進行レポーターのユニットテスト追加 | `tests/pipeline/test_progress.py` を追加し、`CallbackProgressReporter` と `CliProgressReporter` の通知回数・例外耐性を検証。 |
| 2025-12-07 | `process_video` 疎通テストとドキュメント整備 | 依存関数をモックして I/O フローと戻り値を検証する `tests/pipeline/test_processors.py` を追加。README に色上書き辞書の具体例を追記し、運用ガイドを拡充。 |

## 実行計画

### ロードマップ概要

| ステップ | 状態 | 主な内容 |
| --- | --- | --- |
| 1 | ✅ 完了 | `_gather_video_files` / `_build_override_map` を `pipeline/inputs.py` へ移行し、Path 正規化を一元化。 |
| 2 | ✅ 完了 | `VideoTask` dataclass と関連ロジックを `pipeline/tasks.py` へ切り出し、色推定とタスク生成を共通化。 |
| 3 | ✅ 完了 | `ProgressReporter` 抽象と CLI / GUI 向け実装を `pipeline/progress.py` に追加し、進行通知の責務を分離。 |
| 4 | ✅ 完了 | 動画処理本体を `pipeline/processors.py` に整理し、進行レポート注入ポイントを固定。 |
| 5 | ✅ 完了 | `run_pipeline` と `PipelineSettings` / `PipelineResult` を実装し、入力→処理→HTML 出力のフローをモジュール結合。 |
| 6 | ✅ 完了 | `main.py` / `python -m gui` を `run_pipeline` 経由の薄いラッパーに刷新し、再利用性を高めた。 |

### フォーカスすべき次アクション
1. ✅ **進行レポーターのカバレッジ拡充**: `tests/pipeline/test_progress.py` で `CliProgressReporter` / `CallbackProgressReporter` の通知と例外ハンドリングを検証済み。
2. ✅ **`process_video` の I/O 疎通テスト**: 依存関数をモックした統合テスト `tests/pipeline/test_processors.py` を追加し、フレーム抽出・OCR 呼び出し・戻り値整形を検証完了。
3. ✅ **タスクオーバーライドのドキュメント化**: README に色上書き辞書のケーススタディを追記し、運用フローに沿ったガイドを提供済み。

現在フォローすべき追加アクションはありません。継続的な改善項目が挙がった際に本計画を更新してください。

## 現状整理（`main.py` の責務）

### ユーティリティ関数と役割
| 関数 | 区分 | 主な責務 |
| --- | --- | --- |
| `_gather_video_files(video_dir, candidates)` | 入力収集 | ディレクトリ走査または明示リストから処理対象の動画ファイルを決定する。 |
| `_build_override_map(item_color_overrides)` | 入力正規化 | UI などから渡される色指定を絶対パス起点へ変換し、動画ごとの上書き設定を保持する。 |
| `_create_video_task(video_path, result_dir)` | タスク生成 | 動画ごとの出力ディレクトリや CSV/HTML の生成先を束ねた `VideoTask` を構築する。 |
| `_decide_item_color(task, overrides)` | タスク属性決定 | 自動推定された色と上書きを突き合わせ、処理時に利用するアイテム色を決定する。 |
| `detect_item_color(name)` | ドメイン補助 | ファイル名から色キーワードを抽出し、HTML 側のフィルタ初期値に利用する。 |
| `_process_single_video(task, ...)` | 処理オーケストレーション | 抽出→OCR→CSV 化のフローをまとめ、処理結果を `generate_html` 用のメタデータへ変換する。 |

### 進行管理ロジック
- `report()` / `advance()` ネスト関数でプログレスコールバックをラップし、ステップ数を算出する仕組みが `main()` に内包されている。
- 各フェーズ（準備→抽出→OCR→HTML 生成）終了時のログ出力とコールバック通知が散在しており、UI 連携や CLI 表示を切り替えにくい構造になっている。
- `_process_single_video` 内で `report` / `advance_report` を直接呼び出しているため、進行管理と処理本体の結合度が高い。

## `pipeline/` 構造案と依存方向
```
pipeline/
  inputs.py       # 動画列挙・パラメータ正規化（_gather_video_files, _build_override_map を移行）
  tasks.py        # VideoTask 定義とタスク派生ロジック（_create_video_task, _decide_item_color を移行）
  progress.py     # ProgressReporter 抽象・report/advance 集約、UI/CLI 連携ポイント
  processors.py   # _process_single_video の分割版。抽出・OCR 呼び出しと結果整形を担当
  pipeline.py     # run_pipeline(settings, reporter, tasks) のエントリーポイント
```
- 依存方向は **入力収集 → タスク生成 → 処理 → HTML 出力** の一方向を維持する。
  - `inputs.py` はファイルシステム情報のみを扱い、下位モジュールに依存しない。
  - `tasks.py` は `inputs.py` の結果を受け取り、処理対象のメタデータを生成する。進行管理への依存は禁止する。
  - `processors.py` は `tasks.VideoTask` と抽象化された進行レポーターを受け取り、`extract_frames` / `relic_pipeline.processing` など既存の処理モジュールを呼び出す。
  - `pipeline.py` は `inputs`・`tasks`・`processors` を組み合わせ、最終的な `generate_html` 呼び出しを担当する。
  - `progress.py` は CLI 表示や GUI コールバックを差し替えられるよう `ProgressReporter` インターフェース（例: `step(message)` / `advance(message)`）を提供し、`pipeline.py` から注入する。

## モジュール切り出し手順
1. **入力段の独立**: `_gather_video_files` と `_build_override_map` を `pipeline/inputs.py` へ移動し、`main()` からの利用を差し替える。
2. **タスク生成の分離**: `VideoTask` dataclass と `_create_video_task` / `_decide_item_color` を `pipeline/tasks.py` へ移し、入力ステップから得た動画リストを `create_tasks()`（仮）でまとめて生成する。
3. **進行レポート抽象化**: `report` / `advance` 関数を `pipeline/progress.py` に抽出し、CLI 用（標準出力）と GUI 用（コールバックラッパー）の 2 実装を用意する。
4. **処理フローの再編**: `_process_single_video` を分割し、抽出／OCR 処理呼び出しと HTML 出力準備を `pipeline/processors.py` に配置する。進行レポートは `ProgressReporter` を介して通知する。
5. **パイプライン統合**: `pipeline/pipeline.py` に `run_pipeline(settings, reporter, tasks=None)` を実装し、入力取得→タスク展開→処理→`generate_html` の流れを記述する。
6. **`main()` の薄型化**: 上記 API を利用するよう `main()` を更新し、CLI 引数や環境設定をまとめて `run_pipeline` に渡すだけの構造へ変更する。GUI 連携も同 API を再利用できるようにする。

## 公開 API 方針
```python
from pathlib import Path

from pipeline.pipeline import PipelineSettings, run_pipeline
from pipeline.progress import CallbackProgressReporter, CliProgressReporter
from pipeline.tasks import create_tasks

settings = PipelineSettings(
    video_dir="videos",
    result_dir="results",
    ocr_upsample=1.5,
    save_full_frames=False,
    csv_column_visibility=None,
    item_image_view_box=None,
)

reporter = CliProgressReporter(callback=optional_progress_callback)
# 標準の入力収集を使う場合
run_pipeline(settings=settings, reporter=reporter)

# 事前にタスクを構築して渡す場合
custom_tasks = create_tasks(
    video_paths=[Path("videos/sample.mp4")],
    result_dir=settings.result_dir,
)
run_pipeline(settings=settings, reporter=reporter, tasks=custom_tasks)
```
- `PipelineSettings` は `main()` が現在受け取っているオプションを集約するデータクラスとし、テストからも再利用しやすくする。
- `run_pipeline(settings, reporter=None, tasks=None)` の形で、事前に生成したタスクを渡せるようにした。タスクを省略した場合は `inputs` → `tasks` の順に生成する。
- 進行レポーターは `CliProgressReporter`（標準出力主体）と `CallbackProgressReporter`（GUI からのコールバック受け入れ）など複数実装を提供し、`run_pipeline` 内では抽象インターフェースのみを参照する。
- `run_pipeline` は最終的に `generate_html` から返ってくる主要成果物（CSV パスや HTML パス）を返値として返却し、外部の UI から結果パスを容易に参照できるようにする。

## 進行管理の再利用指針
- 各処理ステップは `ProgressReporter` に対して `reporter.prepare(total_steps)` → `reporter.step("フレーム抽出中")` → `reporter.advance("完了")` のように呼び出す契約を共有する。
- コールバック失敗や例外は `ProgressReporter` 側で吸収し、パイプライン本体のエラーハンドリングは処理ロジックに集中させる。
- HTML 生成後に返すメタデータ（CSV 相対パス、クロップ画像ディレクトリなど）は `PipelineResult` dataclass として定義し、他モジュールとの連携を明確化する。

## 想定されるメリット
- GUI エントリ（`python -m gui`）からも `run_pipeline` を直接呼び出せるため、進行状況や結果取得を共通化できる。
- タスク生成や進行レポートを単体テストしやすくなり、エッジケース（空ディレクトリ、上書き指定ミス等）を早期検知できる。
- 将来的に並列処理やキューイングを導入する際も、`processors.py` の実装差し替えで対応しやすくなる。


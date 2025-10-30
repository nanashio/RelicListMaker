# pipeline/ モジュール化設計メモ

## 目的
- `main.py` に集中している入出力制御・進行管理ロジックを段階的に分割し、将来的な `pipeline/` パッケージへ移行するための設計指針をまとめる。
- 動画ファイル収集から HTML 出力までの依存方向を固定し、責務ごとのモジュール境界を明確にする。
- 既存の `main()` を薄いエントリーポイントとして保ちつつ、再利用可能な `run_pipeline` API を設計する。

## 実装状況まとめ（2025-10-30 現在）
- `pipeline/inputs.py` に `_gather_video_files` / `_build_override_map` 相当の `gather_video_files` と `build_override_map` を移設し、Path ベースでの正規化を統一した。
- `pipeline/tasks.py` で `VideoTask` dataclass、`create_tasks`、`decide_item_color` を公開し、推定色ロジックを GUI/CLI 共通化した。
- `pipeline/progress.py` で `ProgressReporter` プロトコルを定義し、`CallbackProgressReporter` / `CliProgressReporter` / `NullProgressReporter` を実装して UI との結合度を下げた。
- `pipeline/processors.py` で単一動画処理（フレーム抽出→OCR→CSV 整形）を `process_video` として切り出し、進行通知を引数のレポーターに移譲した。
- `pipeline/pipeline.py` に `PipelineSettings` / `PipelineResult` / `run_pipeline` を実装し、`tasks` 引数で事前生成済みタスクを受け取れるようにした。戻り値には HTML の生成結果と経過時間を含めている。
- `main.py` は `PipelineSettings` を組み立てて `run_pipeline` を呼ぶ薄いエントリーポイントとなり、GUI (`gui_app.py`) も同 API を共有している。

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
  - `processors.py` は `tasks.VideoTask` と抽象化された進行レポーターを受け取り、`extract_frames` / `match_and_export` など既存の処理モジュールを呼び出す。
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
- GUI (`gui_app.py`) からも `run_pipeline` を直接呼び出せるため、進行状況や結果取得を共通化できる。
- タスク生成や進行レポートを単体テストしやすくなり、エッジケース（空ディレクトリ、上書き指定ミス等）を早期検知できる。
- 将来的に並列処理やキューイングを導入する際も、`processors.py` の実装差し替えで対応しやすくなる。

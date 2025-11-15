# RelicListMaker

## はじめに
RelicListMaker は、動画から遺物の文字を読み取って一覧化する Windows 向けアプリケーションです。

## 配布ファイル
- `dist/RelicListMaker-win64.zip`
  - Windows 10/11 (64bit) 向けにビルドされた実行ファイル一式です。
  - ZIP を展開すると、アプリ本体 (`RelicListMaker.exe`) と必要なリソースが同階層に展開されます。フォルダ構成を変更しないでください。

## 必要な動画
- 処理対象の動画ファイル（`.mp4` / `.avi` など）
  - H.264 コーデックを想定
  - 1920×1080・60fps を想定
  - 赤・青・黄・緑の遺物ごとに個別の動画を用意してください。

## 使い方

### インストール
1. `RelicListMaker-win64.zip` を任意の場所に展開します。

### 動画解析
1. 展開先フォルダにある `RelicListMaker.exe` をダブルクリックして起動します。
2. 解析したい動画ファイルを `RelicListMaker.exe` にドラッグ＆ドロップするか、画面の案内に従って選択してください。
3. 解析完了すると、`results/<動画名>/` に解析結果一式(csv、遺物画像)が保存されます。

### 遺物一覧表示&確認
1. アプリ画面の「ビューワを開く」ボタンを押すと、既定のブラウザで解析結果を表示できます。
2. 表示されたビューワ上で解析結果を確認し、必要に応じてレビューを進めてください。
   - 効果名・レベル・デメリットは入力欄を直接編集すると `Effect{n}` / `Effect{n}Level` / `Demerit{n}` 列へ即座に書き込まれ、補助列 (`Effect{n}Correction` など) を経由せずに保存キューへ登録されます。
   - 入力欄を空に戻すと OCR で検出した値へ復元され、値が元と同じ場合はレビュー済みステータス (`Effect{n}Status`) も維持されます。
   - 「合致」ボタンで `pass` を付与・解除でき、承認時には関連する手動入力がリセットされます。マニュアル修正を入力したまま保存するとステータスは自動的に `corrected` へ更新されます。
3. レビュー完了後はブラウザ右上の保存ボタンから CSV を書き出すか、設定で自動保存を有効にしておくと都度 `results/<動画名>/*.csv` に反映されます。

### 遺物一覧のマージ
1. 複数の動画で解析した結果を統合したい場合は、アプリ画面の「遺物一覧をマージ」ボタンを押します。
2. 案内に従って各 `results/<動画名>/` の CSV を選択すると、遺物一覧がマージされた `merged_results.csv` が生成されます。
3. ビューワを更新すると、統合済みの一覧を最新状態で確認できます。

## 出力されるファイル
- `results/<動画名>/`
  - `frames/`: 必要に応じて保存された元フレーム (オプション)
  - `crops/`: OCR 対象のクロップ画像
  - `<動画名>.csv`: 抽出した効果やレベル情報
  - `gallery/index.html`: ブラウザで閲覧できるギャラリー（`RelicListMaker.exe` の「ビューワを開く」から起動）

## 動作確認
- Windows 11 でのみ動作確認済みです。
- Steam ゲームレコーディングでエクスポートした動画でのみ動作確認済みです。

## 開発者向け情報

### 参考ドキュメント
- CSV の列仕様や列表示フラグの挙動は `docs/reference-csv-columns.md` に詳細をまとめている。レビュー CSV のカラム構成を確認・更新する際は同ドキュメントを参照すること。

### 旧フォーマットの CSV について
- 現行バージョンはビューアが `Effect{n}` / `Effect{n}Level` / `Demerit{n}` を直接更新する設計へ移行しており、`Effect{n}Correction` などの補助列は出力しません。
- 過去の試験運用で補助列付き CSV を生成していた場合は、最新のパイプラインでもう一度書き出すか、表計算ソフト等で補助列の値を基列へコピーしてから補助列自体を削除してください。
- `merge_results.py` は補助列が残存しているとエラーを発生させます。メッセージに列名と行番号が表示されるため、該当行の補助列を空にするか削除したうえで再実行してください。

### プロジェクト概要
RelicListMaker は、動画内の遺物情報を自動で抽出・整理し、レビュー可能なギャラリーとして出力するためのツールチェーンです。`main.py` を起点にフレーム抽出、OCR、辞書照合、HTML ギャラリー生成までを一括で実行し、結果は `results/<動画名>/` 以下にまとめられます。

### 主な使用技術
| 技術 | 用途 |
| --- | --- |
| Python 3.10+ | パイプライン全体と GUI ランチャー (`tkinter`) の実装 |
| OpenCV / NumPy | フレーム抽出や画像前処理 (`extract_frames.py`, `preprocess.py`) を支える画像処理基盤 |
| Tesseract OCR + pytesseract | 遺物名・効果文のテキスト認識を担う OCR エンジン |
| RapidFuzz | OCR 結果と `templates/master_relics.csv` を照合して最適な遺物候補を推定 |
| PyInstaller | `RelicListMaker.exe` を含む Windows 向け配布物のパッケージングに使用 |

### ディレクトリ構成
```
.
├── dist/                # Windows 用ビルド成果物 (zip/exe)
├── videos/              # 入力動画を配置
├── results/             # 処理結果 (frames/crops/CSV/HTML)
├── templates/           # ギャラリー用テンプレートと辞書
│   ├── gallery/         # `index.js` をエントリとしてモジュール化されたギャラリー本体
│   │   ├── render/      # DOM 構築やビュー更新を司る純粋関数群
│   │   ├── events/      # クリック・入力などのイベントハンドラ
│   │   ├── state/       # フィルタや選択状態を扱うストア API
│   │   ├── storage/     # CSV/OPFS 永続化の抽象化とユーティリティ
│   │   ├── dataset/     # データセット解決と正規化ロジック
│   │   └── utils/       # DOM・データ処理の共有ユーティリティ
│   └── master_relics.csv  # 遺物名のマスターデータ
├── tesseract/           # バンドル済み Tesseract (同梱環境向け)
├── docs/                # テスト手順やリファクタリング方針などのドキュメント
├── main.py              # フレーム抽出→OCR→HTML 出力まで統括するパイプライン入口
├── extract_frames.py    # フレーム抽出とシーンスキップで効率的にクロップを生成
├── match_and_export.py  # Tesseract OCR と RapidFuzz で効果名・レベルを推定
├── generate_gallery.py  # CSV とクロップから gallery/index.html を生成
├── preprocess.py        # OCR 前処理の検証と調整用スクリプト
├── gui/                # GUI アプリ本体とサービス・アダプタ群
├── gui_app.py           # 互換用の GUI エントリーポイント（`gui.main` を委譲）
└── viewer_server.py     # 結果フォルダをブラウザ閲覧する簡易サーバー
```

### セットアップ
1. **Python 環境**: Python 3.10 以上を推奨します。仮想環境を作成し、依存関係を導入してください。
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```
2. **Tesseract OCR**: システムに日本語データを含む Tesseract がインストールされていることを確認します。付属の `tesseract` ディレクトリを利用する場合は、`tesseract_bundle.py` が自動で `pytesseract` のパスを調整します。Windows 向け配布物には **Tesseract 5.4.0.20240606 (UB Mannheim 版 64bit)** の実行ファイルと DLL が含まれており、アプリは常に同梱版を使用します。GitHub Actions のリリースワークフローがインストーラから実行ファイルと DLL を取得して同梱するため、手動でバイナリをコミットする必要はありません。`tessdata/` には英語 (`eng`)、日本語 (`jpn`)、OSD (`osd`) の学習データのみを含め、縦書き用データはバンドルしていません。WSL などの Linux 開発環境では、ローカルにインストール済みの Tesseract が優先され、同梱版はフォールバックとして扱われます。
3. **テンプレート辞書**: `templates/master_relics.csv` が最新であることを確認し、必要に応じて CSV を更新します。

### 基本的なワークフロー
1. `videos/` ディレクトリに処理対象の動画ファイル (`.mp4`, `.avi`, `.mov`, `.mkv` など) を配置します。
2. 必要であれば `results/` をクリーンアップし、仮想環境を有効化します。
3. メインパイプラインを実行します。
   ```bash
   python main.py
   ```
4. 実行完了後、`results/<動画名>/` に上記の出力が生成されます。静的サーバー経由で閲覧する場合は以下を実行してください。
   ```bash
   python viewer_server.py --root results
   ```

### OCR 前処理の調整
OCR 精度を改善したい場合は、個別の画像に対して前処理パイプラインを試せる `preprocess.py` を利用します。
```bash
python preprocess.py path/to/image.png --out preprocessed/
```
生成された出力を確認し、しきい値やリサイズ係数などの調整に活用してください。

### パイプライン API を直接呼び出す
`pipeline` パッケージでは、CLI や GUI 以外のスクリプトからも解析処理を再利用できるように `run_pipeline` API を公開しています。
標準の入力収集を利用する場合は、動画ディレクトリと結果ディレクトリを `PipelineSettings` へ指定するだけで処理を開始できます。

```python
from pipeline.pipeline import PipelineSettings, run_pipeline
from pipeline.progress import CliProgressReporter

settings = PipelineSettings(
    video_dir="videos",
    result_dir="results",
    ocr_upsample=1.5,
)

reporter = CliProgressReporter()
result = run_pipeline(settings=settings, reporter=reporter)
print("viewer index:", result.viewer_path)
```

既存の動画列挙処理ではなく、任意の動画を明示的に処理したい場合は `pipeline.tasks.create_tasks` でタスクを構築してから `run_pipeline`
へ渡してください。タスクはすべて絶対パスに正規化されるため、上書き色指定（`item_color_overrides`）も絶対パスで渡すと一致判定が確実になります。

```python
from pathlib import Path

from pipeline.pipeline import PipelineSettings, run_pipeline
from pipeline.tasks import create_tasks

settings = PipelineSettings(result_dir="results")
custom_tasks = create_tasks([Path("videos/sample.mp4")], result_dir=settings.result_dir)

run_pipeline(settings=settings, reporter=None, tasks=custom_tasks)
```

### アイテム色の上書き設定を渡す

OCR 推定色を明示的に指定したい場合は、`PipelineSettings.item_color_overrides` に動画パスと色名のマッピングを渡します。色名には `red` / `green` / `blue` / `yellow` など `pipeline.tasks.COLOR_KEYWORDS` で定義された値を使用してください。値を `"none"` にすると、色指定を無効化して HTML 側のフィルタ初期値を未設定にできます。

```python
from pathlib import Path

from pipeline.pipeline import PipelineSettings, run_pipeline

overrides = {
    # 絶対パスで渡すと辞書突き合わせが確実になります
    Path("videos/emerald_run.mp4").resolve(): "green",
    Path("videos/generic_clip.mp4").resolve(): "none",
}

settings = PipelineSettings(
    video_dir="videos",
    result_dir="results",
    item_color_overrides=overrides,
)

run_pipeline(settings=settings)
```

## ライセンス
- 配布物には Tesseract OCR (Apache License 2.0) が同梱されています。再配布時にはリポジトリ直下の `LICENSE` を同梱し、Tesseract OCR のライセンス要件に従ってください。詳細は `docs/reference-third-party-licenses.md` も参照してください。


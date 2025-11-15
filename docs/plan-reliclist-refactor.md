# RelicList リファクタリング計画

## 目的・スコープ
- RelicList の動画→OCR→HTML 出力パイプラインを対象に、既存コードの構造的課題を洗い出し、段階的なリファクタリング計画を策定する。
- 対象範囲は `main.py` を起点としたバッチ処理と、結果閲覧用 HTML を生成する `generate_gallery.py` を中心に、OCR/マッチングを担う `match_and_export.py` を含む。
- GUI (`gui_app.py`) やテストコードは直接のスコープ外とし、必要に応じて別計画を立案する。

## 現状構造（主要ファイルの依存関係）
- `main.py`
  - 動画入力ディレクトリ (`videos/`) を走査し、`extract_frames.extract_and_crop`、`match_and_export.process_images`、`generate_gallery.generate_html` を順に呼び出す統括モジュール。
  - `relic_data.load_master_csv` でマスターデータを読み込み、`resource_paths.templates_path` でテンプレート資産を参照する。
- `match_and_export.py`
  - `relic_pipeline.ocr.preprocess.prepare_for_ocr` で前処理し、`pytesseract` と RapidFuzz (`rapidfuzz.process`) を用いて OCR と一致検索を行う。
  - `relic_data` からマスター効果/レベル情報を受け取り、`tesseract_bundle` でバンドル済み Tesseract を初期化する。
- `generate_gallery.py`
  - `relic_data` 経由でマスター CSV/JSON を読み込み、テンプレート (`gallery.html`, `gallery/gallery.css`, `gallery/gallery.js` 等) を `resource_paths.templates_path` からコピーする。
  - 処理結果 CSV 群を集約して HTML ビューアを生成する。

## フェーズ別の責務整理
### `main.py`（動画処理フロー）
- 動画ファイルの探索と処理対象の決定 (`_gather_video_files`)。
- 出力ディレクトリ構造の構築と `VideoTask` データクラスによるパス管理。
- フレーム抽出 (`extract_and_crop`)・OCR/マッチング (`process_images`)・HTML 生成 (`generate_html`) の逐次実行。
- アイテム色推定 (`detect_item_color`) とユーザー指定による上書き処理。
- 進捗コールバックの制御と、最終的なデータセット情報の集約。

### `match_and_export.py`（OCR/マッチング処理）
- クロップ領域のスケーリングと前処理 (`prepare_for_ocr`) による画像整形。
- Tesseract 設定 (`configure_pytesseract`) と外部バイナリ選択通知の管理。
- OCR 結果の正規化（レベル検出、補正 CSV の適用、カラム表示制御）。
- RapidFuzz による効果名マッチングとスコア計算、複数スロットの出力行生成。
- CSV 出力および、マスターデータとの照合結果の整形。

### `generate_gallery.py`（HTML 生成）
- 入力 CSV/画像ディレクトリの正規化と複数データセットのハンドリング。
- テンプレート HTML/CSS/JS 資産のコピーと、動的パラメータの埋め込み。
- マスターデータ (CSV/JSON) の読み込みとエフェクト辞書の前処理。
- 画像ビュー設定やシンボル整形など、UI 表示向けのサニタイズ処理。
- 出力ディレクトリ内のアセット再配置とキャッシュバスティング用タイムスタンプ付与。

## 現状のボトルネックと優先度候補
### ファイル肥大化と責務過多
- `main.py` 254 行、`match_and_export.py` 424 行、`generate_gallery.py` 434 行と、大型スクリプトにロジックが集中している。
- `_process_single_video`（`main.py`）や `process_images`（`match_and_export.py`）などの関数が I/O、状態管理、集計を兼ねており単体テストが困難。
- **優先度: 高** — パイプライン単位でモジュール分割・関数抽出を行い、ユニットテスト可能な境界を作る。

### 設定値・依存関係の散在
- OCR 係数 (`OCR_UPSAMPLE`, `DEFAULT_UPSAMPLE`) やビュー設定 (`DEFAULT_ITEM_IMAGE_VIEW_BOX`) が複数ファイルに散在し、統一的に変更しづらい。
- Tesseract バンドル判定やテンプレートパス解決が各所で行われており、設定の一元管理ができていない。
- **優先度: 中** — 設定モジュールの新設、もしくは dataclass ベースの設定オブジェクト導入を検討。

### 出力フォーマットの複雑化
- CSV カラム表示制御や複数データセットのメタ情報構築が `match_and_export.py` / `generate_gallery.py` に散在し、仕様把握に時間を要する。
- HTML テンプレートとの整合性チェックが手動で、変更時の副作用が不透明。
- **優先度: 中** — CSV/HTML のスキーマ定義を文書化し、型ヒントや dataclass で構造を表現する。

### テストと再利用性の不足
- 進捗コールバックや色推定ロジックなどを再利用したい場面でも、現状は直接関数呼び出しに依存しモックが困難。
- OCR 前処理やマッチングのアルゴリズムを個別に検証する仕組みが整っていない。
- **優先度: 低** — リファクタリング後、pytest ベースのテスト整備とモジュール化されたユーティリティ群の導入を進める。

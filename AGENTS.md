# Repository Guidelines

## 言語設定 (Language Configuration)
このプロジェクトは日本語環境での動作を前提とする。
基本的な受け答えは、全て日本語で行うこと。

## プロジェクト構成とモジュール配置
リポジトリ 直下 に 主要 スクリプト が あり `main.py` が パイプライン を 統括 します。`extract_frames.py` は フレーム 抽出、`match_and_export.py` は OCR と 辞書 照合、`generate_gallery.py` は HTML 出力、`preprocess.py` は 任意 前処理 を 担当 します。素材 動画 は `videos/` へ 配置 し、処理 生成 物 は `results/<video名>/` 配下 に `frames/` `crops/` `*.csv` `*_viewer.html` として まとまり、サムネイル を クリック すると 拡大 でき、フィルター で 対象 を 絞れます。各 エフェクト 行 に 推定・一致 度・OCR 文字列 が 表示 され、○/× で レビュー できます。辞書 `master_relics.csv` は ルート に 置き 相対 パス を 守って ください。

## ビルド・テスト・開発コマンド
- `python -m venv .venv && source .venv/bin/activate`: 仮想 環境 を 作成 して 依存 を 分離。
- `pip install -r requirements.txt`: OpenCV NumPy Tesseract 連携 など 必須 パッケージ を 範囲 指定 で 導入。
- `python main.py`: `videos/` を 処理 し `results/<video名>/` に クロップ・CSV・HTML を 出力 (HTML では 拡大・検索・ソート・○/× レビュー が 可能)。
- `python preprocess.py <path/to/image.png> --out preprocessed/`: 画像 の 前処理 を 試し 調整。
- `tesseract --version`: システム バイナリ と 日本語 データ の 認識 状態 を 確認。

## コーディング規約と命名
PEP 8 準拠 の 4 スペース インデント と snake_case を 基本 に します。画像 処理 や OCR ロジック は 小さく 分割 し 再利用 と テスト を 容易 化 してください。設定 定数 は スクリプト 冒頭 に 集約 し、`CROP_BOX` や `BASE_CROP_BOXES` 変更 時 は コメント や Docstring で 根拠 を 明記 します。ファイル・フォルダ・ドキュメントの命名規則は `docs/guide-naming-conventions.md` を参照し、必要に応じて更新してください。

## テスト方針と実行
テストの方針や個別コマンドの扱いは `docs/guide-testing.md` に集約しています。常に同ファイルを参照して最新の手順を確認してください。

## コミットとプルリクエスト
コミット メッセージ は 命令 形・現在 形（例 `Add OCR scale flag`）で 簡潔 に まとめ、パイプライン フェーズ ごと に 変更 を 分割。PR では 目的、ユーザー 影響、検証 コマンド、関連 Issue、成果 物 を 箇条書き し、OCR 定数 や 出力 パス を 触った 場合 は 再現 手順 を 明示。

## OCR とアセット管理
`pytesseract` が 参照 する Tesseract 日本語 データ と `master_relics.csv` を 常に 最新 状態 に 保ち、更新 理由 と Diff を 残して ください。`match_and_export.py` は ガウシアン ブラー + Otsu 二値化 + メディアン ブラー と `--oem 3 --psm 6 -c preserve_interword_spaces=1` 設定 で OCR 精度 を 向上 させ、レビュー CSV で得た NG 例 から 辞書 を 見直す 運用 を 想定 しています (`results/<video名>/corrections.csv` を用意 すれば RawText 対応 の 修正 を 優先 可能)。前処理 や パイプライン を 変更 した 場合 は 1920x1080 基準 の クロップ 座標 と `results/<video名>/` に 出力 された 生成 物 を レビュー 時 に 共有 してください。

## エージェント作業ポリシー
コミットやプッシュは、ユーザーから明示的な指示があるまで実行しないこと。
そのほかの作業ディレクトリ内での操作は許可なく実施してよい。
nl や sed などの閲覧系コマンドは許可なく実行してよい。


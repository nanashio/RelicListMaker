# Repository Guidelines

## プロジェクト構成とモジュール配置
リポジトリ 直下 に 主要 スクリプト が あり `main.py` が パイプライン 全体 を 管理 します。`extract_frames.py` は フレーム 抽出 と クロップ、`match_and_export.py` は OCR と 辞書 照合、`generate_gallery.py` は HTML ギャラリー 生成、`preprocess.py` は 任意 の 前処理 を 担当 します。素材 動画 は `videos/` に 配置 し、抽出 フレーム は `results/<video名>/frames/`、クロップ 画像 は `results/<video名>/crops/`、生成 された CSV と HTML は `results/<video名>/` に 集約 されます。辞書 ファイル `master_relics.csv` は ルート に 常駐 させ 相対 パス を 維持 してください。

## ビルド・テスト・開発コマンド
- `python -m venv .venv && source .venv/bin/activate`: 仮想 環境 を 準備 し 依存 を 分離 します。
- `pip install -r requirements.txt`: OpenCV や NumPy など 固定 範囲 の 依存 関係 を 一括 導入 します。
- `python main.py`: `videos/` 内 の 動画 を 処理 し `results/<video名>/` に クロップ・CSV・HTML を 出力 します。
- `python preprocess.py <path/to/image.png> --out preprocessed/`: OCR 前処理 の 調整 や デバッグ に 使います。
- `tesseract --version`: Tesseract 日本語 データ が 認識 されている か 事前 確認 します。

## コーディング規約と命名
PEP 8 準拠 の 4 スペース インデント と snake_case を 基本 に します。画像 処理 や OCR ロジック は 小さな 関数 に 切り出し 再利用 性 と テスト 容易 性 を 高めて ください。設定 値 は スクリプト 冒頭 の 定数 に 集約 し、`CROP_BOX` や `BASE_CROP_BOXES` を 変更 した 場合 は 根拠 を コメント や Docstring で 補足 します。

## テスト方針
テスト フレームワーク は pytest を 推奨 し `tests/` 配下 に モジュール 対応 の テスト (`tests/test_match_and_export.py` など) を 配置 します。サンプル 画像 や CSV を フィクスチャ で 共有 し、Tesseract 呼び出し は モック 化 して CI でも 安定 する よう に します。OCR マッチング、CSV スキーマ、HTML 生成 は 決定 論的 な アサーション で 検証 し、手動 チェック が 必要 な 項目 は PR で 手順 を 明記 してください。

## コミットとプルリクエスト
コミット メッセージ は 命令 形・現在 形（例 `Add OCR scale flag`）で 簡潔 に 記述 し、変更 点 を パイプライン の フェーズ ごと に まとめます。プルリクエスト では 目的、ユーザー 影響、検証 コマンド、関連 Issue、成果 物 の スクリーンショット や CSV 抜粋 を 箇条書き で 添えて ください。OCR 定数 や 出力 パス を 変更 した 場合 は レビュアー が 同じ 環境 で 再現 できる よう 注意 喚起 します。

## OCR とアセット管理
`pytesseract` が 参照 する Tesseract 日本語 データ と `master_relics.csv` の 整合 性 を 常に チェック し、辞書 更新 時 は UTF-8 (BOM) を 維持 して 差分 と 理由 を 記録 します。クロップ 座標 や 辞書 を 追加 する とき は 1920x1080 基準 の 座標 を 検証 し、`results/<video名>/` に 生成 された CSV・HTML を レビュアー と 共有 して 品質 を 追跡 してください。

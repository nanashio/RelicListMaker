# Windows向けPyInstallerビルド手順

## 前提条件
- Windows 10/11 (64bit)
- Python 3.11 系推奨 (64bit)
- Microsoft Visual C++ 再頒布可能パッケージ (既に OpenCV を利用している環境なら導入済みのことが多い)
- Tesseract OCR 同梱用のファイル（ハッシュ確認済みの配布物から取得）
  - 例: [UB Mannheim 版インストーラ](https://github.com/UB-Mannheim/tesseract/wiki) から `tesseract.exe` と `tessdata` を展開し、`tesseract/windows-x64/` 配下に配置する。
  - 少なくとも `eng.traineddata` と `jpn.traineddata` を含める。

## プロジェクトの取得と仮想環境
```powershell
# 任意の作業ディレクトリで
PS> git clone <このリポジトリURL>
PS> cd nightreign-relic
PS> python -m venv .venv
PS> .\.venv\Scripts\Activate.ps1
PS> pip install --upgrade pip
PS> pip install -r requirements-build.txt
```

## Tesseract の同梱方法
- リポジトリ直下の `tesseract/` に OS ごとのフォルダを作成し、実行ファイルと `tessdata/` を配置する。
  - 例) `tesseract/windows-x64/tesseract.exe`、`tesseract/windows-x64/tessdata/jpn.traineddata`
  - 共通で利用したい `tesseract/tessdata/` があればそちらも探索対象になる。
- `match_and_export.py` では起動時に同梱ディレクトリを自動検出し、見つかった場合は環境変数 `TESSDATA_PREFIX` を設定した上で `pytesseract` をバンドル済みバイナリに向ける。
- バンドルが見つからない場合のみ、システムにインストールされた Tesseract を利用する。

## PyInstaller ビルド
```powershell
# 生成物をクリアしつつ onedir 構成でビルド
PS> pyinstaller --clean --noconfirm pyinstaller.spec
```

- 出力は `dist/nightreign-relic/` に配置される。
- `templates/` 配下の HTML/CSS/JS と `master_relics.csv`、および `tesseract/` 以下のファイルは自動でバンドルされる。

## 配布フォルダの整備
- `dist/nightreign-relic/` を配布単位として扱う。
- 実行時には以下の構成を想定している。
  - `nightreign-relic.exe`
  - `templates/` (PyInstaller が展開)
  - `videos/` : ビルド時に空フォルダを自動生成。入力動画を配置する（手動でコピー）
  - `results/` : 実行時に自動生成される
- 配布時に同梱したいサンプル動画があれば `videos/` に配置しておく。

## 実行方法
```powershell
PS> cd dist/nightreign-relic
PS> .\nightreign-relic.exe
```

- 進捗ログはコンソールに表示される。処理完了後、`results/<video名>/` に CSV / HTML / 画像が出力される。
- Tesseract が見つからない場合は、同梱フォルダの配置を確認するか、`tesseract/` に必要なファイルを追加する。

## よくあるトラブルと対処
- **DLL が見つからない / OpenCV エラー**: Visual C++ 再頒布可能パッケージをインストールする。
- **Tesseract の日本語データが見つからない**: `tesseract/.../tessdata` に `jpn.traineddata` が含まれているか確認する。外部環境のデータを利用する場合は `TESSDATA_PREFIX` を明示的に指定する。
- **実行フォルダから動画を認識しない**: `videos/` ディレクトリが exe と同じ階層に存在するか確認する。

## ライセンス注意
- Tesseract OCR は Apache License 2.0 です。同梱する際は upstream の `LICENSE` と `NOTICE` を配布物に含めてください。
- 詳細や追加のサードパーティー情報は `docs/THIRD_PARTY_LICENSES.md` を参照してください。


# Windows向けPyInstallerビルド手順

## 前提条件
- Windows 10/11 (64bit)
- Python 3.11 系推奨 (64bit)
- Microsoft Visual C++ 再頒布可能パッケージ (既に OpenCV を利用している環境なら導入済みのことが多い)
- Tesseract OCR 同梱用のファイル（ハッシュ確認済みの配布物から取得）
  - 例: [UB Mannheim 版インストーラ](https://github.com/UB-Mannheim/tesseract/wiki) から **5.4.0.20240606 (64bit)** を展開し、`tesseract.exe`・`tessdata`・`.dll` を `tesseract/windows-x64/` 配下に配置する。
  - GitHub Actions のリリースワークフローでは、このインストーラを自動でダウンロードして `tesseract/windows-x64/` に同期してから PyInstaller を実行するため、CI では追加作業は不要。
  - 少なくとも `eng.traineddata` と `jpn.traineddata` を含め、必要であれば `osd.traineddata` を追加する。縦書き用の `jpn_vert.traineddata` は含めない。

## プロジェクトの取得と仮想環境
```powershell
# 任意の作業ディレクトリで
PS> git clone <このリポジトリURL>
PS> cd RelicListMaker
# `python` エイリアスが未設定な環境があるため `py` を使用する
PS> py -m venv .venv
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

- 出力は `dist/RelicListMaker/` に配置される。
- `templates/` 配下の HTML/CSS/JS と `master_relics.csv`、および `tesseract/` 以下のファイルは自動でバンドルされる。
- 既存の `dist/RelicListMaker/videos/` はビルド前後でバックアップ・復元されるため、同梱したサンプル動画が消えることはない。

### PowerShell スクリプトでの自動化
Windows 環境ではリポジトリ同梱の `docs/build_windows.ps1` を使うと、仮想環境の作成～依存インストール～PyInstaller 実行までを一括で実行できる。

```powershell
PS> cd RelicListMaker
PS> powershell -ExecutionPolicy Bypass -File .\docs\build_windows.ps1
```

主なオプション:

- `-SkipVenv` : 既存の `.venv` を再作成せずに利用する。
- `-SkipRequirements` : `pip install` をスキップしたい場合に指定。
- `-Quiet` : 進捗ログを最小限に抑える。

ビルド完了後、配布フォルダのパスが `[RESULT]` 行で表示される。

## 配布フォルダの整備
- `dist/RelicListMaker/` を配布単位として扱う。
- 実行時には以下の構成を想定している。
  - `RelicListMaker.exe`：GUI ランチャー。本体の解析処理とビューワサーバーが統合されている。
  - `templates/` (PyInstaller が展開)
  - `videos/` : ビルド時に自動生成。入力動画を配置する（手動でコピー／差し替え可）
  - `results/` : 実行時に自動生成される
- 配布時に同梱したいサンプル動画があれば `videos/` に配置しておく。

## 実行方法
```powershell
PS> cd dist/RelicListMaker
PS> .\RelicListMaker.exe
```

- GUI 上で動画フォルダ・結果フォルダを設定し、「動画処理を実行」でパイプラインを起動できる。
- フォルダ欄は既定で相対パス（`videos` / `results`）が入力済み。必要に応じて相対・絶対パスを上書きでき、内部で自動的に解決される。
- 「結果ビューワ一覧」には `results` 配下の `*_viewer.html` が列挙され、選択すると `サーバー起動` の初期表示対象にセットされる。「ブラウザで開く」を押せばサーバーなしでも直接 HTML を表示可能。
- 「サーバー起動」を押すとローカル HTTP サーバーが立ち上がり、ブラウザでビューワを開ける（既定で自動起動）。
- `results/<動画名>/viewer_server_error.log` が生成された場合は、サーバー側で例外が発生しているためログを確認する。
- Tesseract が見つからない場合は、同梱フォルダの配置を確認するか、`tesseract/` に必要なファイルを追加する。

## よくあるトラブルと対処
- **DLL が見つからない / OpenCV エラー**: Visual C++ 再頒布可能パッケージをインストールする。
- **Tesseract の日本語データが見つからない**: `tesseract/.../tessdata` に `jpn.traineddata` が含まれているか確認する。外部環境のデータを利用する場合は `TESSDATA_PREFIX` を明示的に指定する。
- **実行フォルダから動画を認識しない**: `videos/` ディレクトリが exe と同じ階層に存在するか確認する。
- **ブラウザが「データが送信されませんでした」と表示する**: GUI ログに表示されるビューワルートと `viewer_server_error.log` を確認し、エラー詳細に従って対処する。
- **GUI ログに「この環境ではドラッグ＆ドロップを利用できません」と出る**: `tkinterdnd2` もしくは `tkdnd` が同梱されていない状態です。ビルド用仮想環境で `pip install tkinterdnd2` を実行した上で PyInstaller を再実行すると、`pyinstaller.spec` の `TKDND_DATAS` 収集処理によりライブラリがバンドルされます。

## ライセンス注意
- Tesseract OCR は Apache License 2.0 です。同梱する際は upstream の `LICENSE` と `NOTICE` を配布物に含めてください。
- 詳細や追加のサードパーティー情報は `docs/THIRD_PARTY_LICENSES.md` を参照してください。

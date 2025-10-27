# Tesseract バンドル配置

このディレクトリ以下に同梱したい Tesseract 実行ファイルと `tessdata/` を配置します。
アプリ起動時に `match_and_export.py` が最初に以下の順序で探索します。

1. 実行中プラットフォーム名を含むサブディレクトリ（例: `windows-x64`, `linux-x64`, `macos-arm64`）
2. そのほかのサブディレクトリ
3. `tesseract/` 直下

各ディレクトリの中で `tesseract.exe` もしくは `tesseract` を探し、`bin/` 配下も走査対象になります。
`jpn.traineddata` と `eng.traineddata` など必要な言語データは同じ階層の `tessdata/` に配置してください。

## 言語データの優先度
- 必須: `eng.traineddata`, `jpn.traineddata`
- 任意追加: `jpn_vert.traineddata` (縦書き素材向け), `osd.traineddata` (向き検出), `equ.traineddata` (数式認識) など


## 例: Windows x64 向け
```
RelicListMaker/
  tesseract/
    windows-x64/
      tesseract.exe
      tessdata/
        eng.traineddata
        jpn.traineddata
```

## 例: 共通 tessdata を使う場合
```
RelicListMaker/
  tesseract/
    linux-x64/
      bin/
        tesseract
    tessdata/
      eng.traineddata
      jpn.traineddata
```

PyInstaller ビルド時には `tesseract/` ディレクトリ全体がそのままバンドル対象になります。

## Windows ビルドでの取り扱い
Windows 向けに配布する際は、このディレクトリに配置したバンドル済みの Tesseract 実行ファイルと DLL をそのまま同梱します。アプリは Windows 環境で常に同梱版を使用するため、配布物から外部インストールにフォールバックすることはありません。

### DLL の取り扱い
- GitHub Actions のビルドでは追加で DLL を取得する処理を行っていないため、**必要な DLL はリポジトリにコミットした状態で `tesseract/windows-x64/` に置く**必要があります。
- 現在同梱している Tesseract は **UB Mannheim 版 64bit Tesseract 5.5.0.20241111** を前提にしています。`C:\Program Files\Tesseract-OCR\`（もしくは展開先フォルダ）に並ぶ `.dll` をすべて `tesseract/windows-x64/` へコピーしてください。代表的なファイルは以下のとおりです。
  - `libtesseract-5.dll`
  - `libleptonica-6.dll`
  - `libarchive-13.dll`
  - `libbrotlicommon.dll`, `libbrotlidec.dll`, `libbrotlienc.dll`
  - `libbz2-1.dll`
  - `libcrypto-3-x64.dll`
  - `libcurl-4.dll`
  - `libdeflate.dll`
  - `libffi-8.dll`
  - `libgcc_s_seh-1.dll`, `libstdc++-6.dll`, `libwinpthread-1.dll`
  - `libgif-7.dll`
  - `libiconv-2.dll`
  - `libintl-9.dll`
  - `libjpeg-62.dll`
  - `liblzma-5.dll`
  - `libopenjp2-7.dll`
  - `libpng16-16.dll`
  - `libtiff-6.dll`
  - `libwebp-7.dll`
  - `libzstd.dll`
  - `zlib1.dll`
- バージョン更新で DLL 名が変わった場合も同じ手順で「`Tesseract-OCR` フォルダ内の DLL を丸ごとコピーする」運用にしておけば不足が発生しません。更新時は README のバージョン表記も忘れずに変更してください。

## 開発環境での扱い
WSL など Linux ベースの開発環境では、システムにインストールされた Tesseract を優先的に利用します。ローカルに Tesseract が無い場合のみ、ここに配置したバンドル版がフォールバックとして使用されます。

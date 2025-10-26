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

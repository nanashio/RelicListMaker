# サードパーティーライセンスリファレンス

このドキュメントは、RelicListMaker 配布物に同梱されるサードパーティーコンポーネントと、再配布時に必要となるライセンスファイルの所在を整理したものです。PyInstaller で生成したバンドルには Python ランタイムやライブラリのライセンスも含めて配布する必要があるため、ビルド成果物を配布する前に本ページを必ず確認してください。

## バンドル済みコンポーネント一覧
- **Tesseract OCR** — Apache License 2.0。バイナリと `tessdata/` をバンドルしており、`LICENSE` と `NOTICE` を同梱します。
- **PyInstaller ブートローダー** — GPLv2 (with exception)。`PyInstaller` 配布物に含まれる `COPYING.txt` と `COPYING.GPL` を成果物へ含めてください。
- **Python ライブラリ**
  - `opencv-python` — Apache License 2.0 (`cv2/LICENSE.txt` を含める)
  - `numpy` — BSD 3-Clause (`site-packages/numpy/LICENSE.txt`)
  - `pandas` — BSD 3-Clause (`site-packages/pandas/LICENSE`)
  - `pillow` — HPND (PIL License) (`site-packages/PIL/LICENSE`)
  - `pytesseract` — MIT License (`site-packages/pytesseract/LICENSE`)
  - `rapidfuzz` — MIT License (`site-packages/rapidfuzz/LICENSE`)
  - `tkinterdnd2` — MIT License (`site-packages/tkinterdnd2/LICENSE`)
  - `pyinstaller-hooks-contrib` — MIT License (`site-packages/pyinstaller_hooks_contrib/COPYING.txt`)
- **Node.js 依存ライブラリ** — ギャラリーのビルドで使用する npm パッケージについては `package.json` / `package-lock.json` の SPDX 表記に従い、必要に応じて `licenses/` フォルダにまとめてください。

## 配布物へのライセンス同梱
- `dist/RelicListMaker/` 配下に `licenses/` ディレクトリを作成し、上記コンポーネントのライセンスファイルをすべて格納する運用を推奨します。
- PyInstaller ビルド後に `python -m pip show <package>` を実行すると、`Location` の下にライセンスファイルを含む `site-packages` のパスが表示されます。該当フォルダから `LICENSE*`, `COPYING*`, `NOTICE*` をコピーしてください。
- 新しい Python パッケージを追加した場合は、仮想環境内で `pip-licenses --from=mixed --format=markdown` などを実行して差分を確認し、ライセンス表記を最新化します（`pip-licenses` が未導入の場合は `pip install pip-licenses` で追加）。

## 各コンポーネントの注意点

### Tesseract OCR
- 配布元: https://github.com/tesseract-ocr/tesseract
- ライセンス: Apache License 2.0
- `tesseract/` 以下にバンドルするバイナリと学習データに対して、Apache License 2.0 の写し（`LICENSE` ファイル）と NOTICE を配布物へ同梱してください。
- ライセンス全文は上記リポジトリの `LICENSE` にあります。配布物には `NOTICE` ファイルも含めることが推奨されています。

### PyInstaller ブートローダー
- 配布元: https://pyinstaller.org/
- ライセンス: GPLv2 with a special exception
- `dist/RelicListMaker/` に含まれる `pyi_rth_*.py`、`pyimod*.py` などは PyInstaller のライセンスの下で提供されています。`PyInstaller` リポジトリにある `COPYING.txt` と `COPYING.GPL` をまとめて同梱してください。
- ブートローダーの改変を行った場合は、変更点をドキュメント化し、GPL の要件に従ってソース配布方法を案内してください。

### Python ライブラリ
- `requirements.txt` / `requirements-build.txt` に記載されたライブラリは PyInstaller の成果物にまとめて含まれます。各ライブラリの `LICENSE` や `COPYING` を `licenses/` ディレクトリへコピーし、バージョン更新のたびに差し替えてください。
- `numpy`, `pandas`, `opencv-python` などは複数のサードパーティーコンポーネントを同梱する場合があります。Wheel 内の `LICENSE` ディレクトリを確認し、必要なファイルを漏れなくコピーしてください。

## 更新ポリシー
- このドキュメントに記載されていないコンポーネントを新たに配布物へ含める際は、ライセンス情報を調査のうえ必ず追記してください。
- ライセンス条項に変更があった場合は、該当バージョンのリリースノートやリポジトリを確認し、ここに反映します。

# 後方互換向けコード整理計画（2025-11-16 更新）

## 文書の目的と扱い
- 本計画書は、後方互換用に残存しているラッパーや CLI を段階的に整理するための実行メモです。命名規約に沿うようファイル名を `plan-` プレフィックスへ統一し、参照元と混在しないようにしました。【F:docs/guide-naming-conventions.md†L23-L37】
- 想定読者はリファクタリング担当者およびビルド担当者であり、互換レイヤーが提供する API を廃止する際の確認ポイントを提供します。

## 互換レイヤーの整理状況
- 外部タスクスケジューラの差し替え完了を受けて、旧 CLI ラッパー `match_and_export.py` を削除し、クロップ済み画像の CLI 実行は `relic_pipeline.cli.main` のみを提供する形に統一した。【F:relic_pipeline/cli/main.py†L1-L115】【F:relic_pipeline/cli/commands.py†L1-L108】
- OCR/マッチング処理の窓口は `relic_pipeline.processing` へ一元化し、互換レイヤー依存だったテストは同モジュール前提に整理済み。【F:relic_pipeline/processing.py†L1-L200】【F:tests/pipeline/test_processing.py†L1-L178】

## 直近の進捗
- OCR/マッチング実装を `relic_pipeline.processing` に集約し、後方互換レイヤーを経由せずに新 API を直接利用する形へ移行した。【F:relic_pipeline/processing.py†L1-L200】
- パイプライン側の呼び出しを `relic_pipeline.processing` に付け替え、互換ラッパー経由の依存を取り除いた。【F:pipeline/processors.py†L7-L88】
- CLI コマンドのデフォルト実装を `relic_pipeline.processing.process_images` ベースに変更し、`process_images_command` から直接呼び出す構成を維持した。【F:relic_pipeline/cli/commands.py†L51-L98】
- `relic_pipeline/cli/main.py` を唯一の CLI エントリポイントとして運用し、README でも新エントリの利用例に一本化した。【F:relic_pipeline/cli/main.py†L1-L115】【F:README.md†L118-L134】
- PyInstaller 出力の役割を整理し、GUI 版を `RelicListMaker.exe`、CLI 版を `RelicListMakerCLI.exe` として生成するように変更した。PyInstaller ではコンソール表示の有無をビルド時に固定する必要があるため 1 実行ファイルへの統合は不可と判断し、タスクスケジューラ設定は CLI 版へ張り替える方針で進める。【F:pyinstaller.spec†L75-L147】【F:relic_pipeline/cli/__main__.py†L1-L8】【F:docs/guide-pyinstaller-windows.md†L38-L76】
- ビルドスクリプトと配布ガイドを確認し、PyInstaller 出力の既定が GUI/CLI 分割構成に統一されていること、タスクスケジューラの案内も `RelicListMakerCLI.exe` 呼び出し前提に更新済みであることを確認した。リポジトリ内に旧 CLI 固有の自動化設定は残っていない。【F:docs/build_windows.ps1†L201-L214】【F:docs/guide-pyinstaller-windows.md†L34-L76】

## 現状評価（2025-11-16 確認）
- リポジトリ内の CLI エントリポイントは `relic_pipeline/cli/main.py` に一本化され、README でもクロップ済み画像の処理手順が同エントリポイント前提に整理されている。PyInstaller 配布ガイドも `RelicListMakerCLI.exe` を後方互換経路の代替として案内しており、互換ラッパーを経由する導線は残っていない。【F:relic_pipeline/cli/main.py†L1-L115】【F:README.md†L118-L134】【F:docs/guide-pyinstaller-windows.md†L38-L76】【F:pyinstaller.spec†L75-L147】
- Windows 向けの自動化スクリプトでは、ビルド完了時の案内を GUI/CLI の 2 実行ファイル体制で統一済みであり、旧 `match_and_export.py` に紐づくパスや呼び出しは含まれていないことを再確認した。【F:docs/build_windows.ps1†L201-L214】

## 削除に向けた計画
1. ✅ パイプラインから互換レイヤー経由の呼び出しを排除し、`relic_pipeline.processing` 直呼びに統一した。テストもスタブを整理し、新 API 前提のフィクスチャへ更新済み。【F:pipeline/processors.py†L7-L88】【F:tests/pipeline/test_processors.py†L1-L138】【F:tests/pipeline/test_processing.py†L1-L178】
2. ✅ CLI 側を `relic_pipeline/cli/main.py` に一本化し、README でも新エントリの利用を案内する形に揃えた。【F:relic_pipeline/cli/main.py†L1-L115】【F:README.md†L118-L134】
3. ✅ 外部環境の差し替え確認を終えて `match_and_export.py` を削除し、ドキュメント・ビルド手順・テストからの参照を解消した。CLI 実行は `RelicListMakerCLI.exe` 前提で配布する方針に固定している。【F:docs/guide-pyinstaller-windows.md†L38-L76】【F:docs/build_windows.ps1†L201-L214】【F:tests/conftest.py†L1-L17】【F:README.md†L118-L134】

## 残タスク
- なし。互換レイヤーに紐づく呼び出しやビルド導線はすべて新経路へ移行済みのため、後続作業が発生した場合のみ本計画を再開する。

## 運用メモ
- ファイル名変更に伴い、参照リンクやタスク管理ツールでは `docs/plan-backward-compatibility-audit.md` を使用してください。旧ファイル名への参照が残っている場合は順次置き換えます。
- 互換レイヤー削除を進める際は、本計画書と合わせて `docs/plan-ocr-pipeline-refactor.md` のタイムラインを見直し、リリースノート用の変更概要を随時追記してください。

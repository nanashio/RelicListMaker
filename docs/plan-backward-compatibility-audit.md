# 後方互換向けコード整理計画（2025-11-16 更新）

## 文書の目的と扱い
- 本計画書は、後方互換用に残存しているラッパーや CLI を段階的に整理するための実行メモです。命名規約に沿うようファイル名を `plan-` プレフィックスへ統一し、参照元と混在しないようにしました。【F:docs/guide-naming-conventions.md†L23-L37】
- 想定読者はリファクタリング担当者およびビルド担当者であり、互換レイヤーが提供する API を廃止する際の確認ポイントを提供します。

## 残存している互換レイヤー
- `match_and_export.py` 内の `ocr_and_match` / `process_images` は、既存 API の引数・戻り値を維持したラッパーとして残されています。内部実装は `relic_pipeline` 配下のモジュールへ委譲する形に置き換わっており、段階的移行のフォールバックとして機能しています。【F:docs/plan-ocr-pipeline-refactor.md†L116-L138】【F:match_and_export.py†L244-L420】
- 上記ラッパーを CLI から呼び出すため、`match_and_export.py` には旧来の `build_arg_parser` や CLI エントリーポイント (`main`) も残存しています。計画では CLI 層を `relic_pipeline/cli/commands.py` へ移す前提になっており、現状は互換アダプタとして維持されています。【F:docs/plan-ocr-pipeline-refactor.md†L116-L144】【F:match_and_export.py†L421-L470】

## 直近の進捗
- `match_and_export` が保持していた OCR/マッチング実装を `relic_pipeline/processing.py` に移し、後方互換の窓口として再公開する構成に切り替えた。CLI や既存コードは従来のインポートを継続しつつ、新しいモジュールを正引きすることで移行フェーズを開始できる。【F:relic_pipeline/processing.py†L1-L230】【F:match_and_export.py†L1-L87】
- パイプライン側の呼び出しを `relic_pipeline.processing` に付け替え、互換ラッパー経由の依存を取り除いた。【F:pipeline/processors.py†L7-L88】
- CLI コマンドのデフォルト実装を `relic_pipeline.processing.process_images` ベースに変更し、今後 `match_and_export.main` を廃止しても呼び出し経路が保たれるようにした。【F:relic_pipeline/cli/commands.py†L51-L98】
- `relic_pipeline/cli/main.py` に CLI エントリーポイントと引数パーサーを移設し、`match_and_export.main` は新しい CLI へ委譲する後方互換ラッパーとした。README にも新エントリの利用例を追記し、`process_images_command` を直接呼び出す経路へ誘導している。【F:relic_pipeline/cli/main.py†L1-L110】【F:match_and_export.py†L1-L63】【F:README.md†L101-L118】
- PyInstaller 出力の役割を整理し、GUI 版を `RelicListMaker.exe`、CLI 版を `RelicListMakerCLI.exe` として生成するように変更した。PyInstaller ではコンソール表示の有無をビルド時に固定する必要があるため 1 実行ファイルへの統合は不可と判断し、タスクスケジューラ設定は CLI 版へ張り替える方針で進める。【F:pyinstaller.spec†L75-L147】【F:relic_pipeline/cli/__main__.py†L1-L8】【F:docs/guide-pyinstaller-windows.md†L38-L76】
- `match_and_export.py` から実行された際に非推奨警告を標準エラーに出すようにし、互換 CLI を経由する運用が残っていても新しいエントリポイントへの移行を促すようにした。【F:match_and_export.py†L1-L46】

## 削除に向けた計画
1. ✅ パイプラインから `match_and_export.process_images` を直接呼んでいる箇所を `relic_pipeline` モジュール直呼びにリライト済み。後続タスクではテストのスタブからも互換経路を削減し、`relic_pipeline.processing` 前提のフィクスチャに統一する。【F:pipeline/processors.py†L7-L88】【F:tests/pipeline/test_processors.py†L13-L77】
2. ✅ CLI 側を `relic_pipeline/cli/main.py` に統一。`match_and_export.py` は互換レイヤーとして CLI を委譲するだけに留め、README では新エントリの利用を案内する。今後は PyInstaller 設定やタスクランナーの呼び出し先を `python -m relic_pipeline.cli.main` へ差し替える。【F:relic_pipeline/cli/main.py†L1-L110】【F:match_and_export.py†L1-L63】【F:README.md†L101-L118】
3. 🚧 CLI 実行は `RelicListMakerCLI.exe` に統一し、GUI は `RelicListMaker.exe` として配布する構成で移行中。PyInstaller の windowed/console 設定が排他的なため 1 本化は行わない方針。互換 CLI から実行された場合は非推奨警告を出すことで移行を促進済み。残作業として、既存のタスクスケジューラや自動化設定が CLI 版へ差し替わったことを確認し、`match_and_export.py` 削除の可否を移行完了後に判断する。【F:pyinstaller.spec†L75-L162】【F:docs/guide-pyinstaller-windows.md†L38-L76】【F:match_and_export.py†L1-L46】

## 運用メモ
- ファイル名変更に伴い、参照リンクやタスク管理ツールでは `docs/plan-backward-compatibility-audit.md` を使用してください。旧ファイル名への参照が残っている場合は順次置き換えます。
- 互換レイヤー削除を進める際は、本計画書と合わせて `docs/plan-ocr-pipeline-refactor.md` のタイムラインを見直し、リリースノート用の変更概要を随時追記してください。

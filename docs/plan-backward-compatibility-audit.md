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

## 削除に向けた計画
1. `pipeline/processors.py` などパイプラインから `match_and_export.process_images` を直接呼んでいる箇所を `relic_pipeline` モジュール直呼びにリライトし、ラッパーを経由しないパスを用意する。動作確認後、テストも新 API ベースへ更新する。【F:pipeline/processors.py†L15-L68】【F:match_and_export.py†L333-L420】
2. CLI 側は `relic_pipeline/cli/commands.process_images_command` を単独エントリとして昇格させ、`match_and_export.py` の `build_arg_parser` / `main` を呼び出すルートを廃止する。`README` やテストの CLI 例も新エントリに合わせて更新する。【F:docs/plan-ocr-pipeline-refactor.md†L116-L144】【F:match_and_export.py†L421-L470】
3. 上記置き換えが完了したら、`match_and_export.py` の互換ラッパーと CLI を削除し、`relic_pipeline` 側に必要な API ドキュメントを移す。削除前にタグを打ち、`RelicListMaker.exe` を含む配布物への影響を確認したうえでリリースする。【F:docs/plan-ocr-pipeline-refactor.md†L137-L147】【F:match_and_export.py†L244-L470】

## 運用メモ
- ファイル名変更に伴い、参照リンクやタスク管理ツールでは `docs/plan-backward-compatibility-audit.md` を使用してください。旧ファイル名への参照が残っている場合は順次置き換えます。
- 互換レイヤー削除を進める際は、本計画書と合わせて `docs/plan-ocr-pipeline-refactor.md` のタイムラインを見直し、リリースノート用の変更概要を随時追記してください。

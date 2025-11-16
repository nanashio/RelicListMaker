# 後方互換向けコードの棚卸し（2025-11-16）

## 残存している互換レイヤー
- `match_and_export.py` 内の `ocr_and_match` / `process_images` は、既存 API の引数・戻り値を維持したラッパーとして残されています。内部実装は `relic_pipeline` 配下のモジュールへ委譲する形に置き換わっており、段階的移行のフォールバックとして機能しています。【F:docs/plan-ocr-pipeline-refactor.md†L116-L138】【F:match_and_export.py†L244-L420】
- 上記ラッパーを CLI から呼び出すため、`match_and_export.py` には旧来の `build_arg_parser` や CLI エントリーポイント (`main`) も残存しています。計画では CLI 層を `relic_pipeline/cli/commands.py` へ移す前提になっており、現状は互換アダプタとして維持されています。【F:docs/plan-ocr-pipeline-refactor.md†L116-L144】【F:match_and_export.py†L421-L470】

## 削除に向けた計画
1. `pipeline/processors.py` などパイプラインから `match_and_export.process_images` を直接呼んでいる箇所を `relic_pipeline` モジュール直呼びにリライトし、ラッパーを経由しないパスを用意する。動作確認後、テストも新 API ベースへ更新する。【F:pipeline/processors.py†L15-L68】【F:match_and_export.py†L333-L420】
2. CLI 側は `relic_pipeline/cli/commands.process_images_command` を単独エントリとして昇格させ、`match_and_export.py` の `build_arg_parser` / `main` を呼び出すルートを廃止する。`README` やテストの CLI 例も新エントリに合わせて更新する。【F:docs/plan-ocr-pipeline-refactor.md†L116-L144】【F:match_and_export.py†L421-L470】
3. 上記置き換えが完了したら、`match_and_export.py` の互換ラッパーと CLI を削除し、`relic_pipeline` 側に必要な API ドキュメントを移す。削除前にタグを打ち、`RelicListMaker.exe` を含む配布物への影響を確認したうえでリリースする。【F:docs/plan-ocr-pipeline-refactor.md†L137-L147】【F:match_and_export.py†L244-L470】

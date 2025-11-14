# Effect{n}Correction 系列段階的削除計画

## 背景
現在のギャラリー UI では `Effect{n}Correction` / `Effect{n}LevelCorrection` / `Demerit{n}Correction` 列に一時的な修正値を保持し、保存時に `Effect{n}` / `Effect{n}Level` / `Demerit{n}` へ転記する設計となっています。ギャラリー側では補助列を通じて訂正候補の提示や入力値の復元を実現していますが、ユーザー要求により補助列を廃止し、直接 `Effect{n}` などの基列のみで運用できる形へ移行する必要があります。プロジェクトはまだ未リリースで既存のレビュー CSV は存在しないため、段階的削除は主に今後作成されるデータと開発中のフローを安全に移行することが目的です。また、`Effect{n}LevelSuppressed` 列についても `Effect{n}LevelOptions` 側で同等の挙動を実現できる運用へ移行後に削除する計画が明記されています。【F:docs/reference-csv-columns.md†L55-L96】【F:templates/gallery/events/recordActionHandlers.js†L205-L301】【F:merge_results.py†L253-L333】

## 進捗状況 (2025-11-14 時点)
- ✅ フェーズ 1-2: `docs/reference-csv-columns.md` で補助列を非推奨化し、レビュー CSV へ値を書き戻さない運用方針を明文化しました。【F:docs/reference-csv-columns.md†L55-L96】
- ✅ フェーズ 1-2: ギャラリー UI の補正入力を常時読み取り専用に変更し、非表示となっていた効果・デメリットを再表示しつつ保存処理では補助列を利用しない挙動に統一しました。【F:templates/gallery/gallery.js†L1-L200】【F:templates/gallery/render/effectFactory.js†L1-L140】
- ✅ フェーズ 1-4: `_apply_corrections` を追加して補助列の値を統合処理で `Effect{n}` / `Demerit{n}` 等へ反映するようにし、補助列が残っていても最終出力では基列へ転記されることを確認しました。レベル補正のみが入力されたケースでも `Effect{n}Status` が `corrected` に更新されるよう調整し、pytest フィクスチャへ確認用データセットを追加しています。【F:merge_results.py†L253-L333】【F:tests/test_merge_results.py†L204-L289】
- ✅ フェーズ 2-1: 既存 CSV が存在しないことを確認済みのため、追加マイグレーションは不要と判断しました。
- ⚠️ フェーズ 2-3, 2-4: 補助列未依存の統合・E2E テスト整備は未完了。pytest のサンプルは整備済みですが、Playwright シナリオと実 CSV での検証が残っています。
- ✅ フェーズ 3-1, 3-2: 補助列 `Effect{n}Correction` / `Effect{n}LevelCorrection` / `Demerit{n}Correction` を正式に廃止し、ドキュメント・バックエンド・フロントエンドから参照を除去しました。ビューアは `Effect{n}` / `Effect{n}Level` を直接更新する実装へ移行済みです。【F:docs/reference-csv-columns.md†L55-L88】【F:merge_results.py†L1-L510】【F:templates/gallery/events/recordActionHandlers.js†L1-L660】

## 段階的削除方針
補助列を即時削除すると既存のレビュー CSV からの復元や未保存データの損失リスクがあるため、段階的な移行を推奨します。以下の 3 フェーズで順次機能を削除します。

### フェーズ 1: 補助列の書き込み停止と UI 非表示化
1. `templates/gallery/events/recordActionHandlers.js` で `updateRecordNameCorrection` `updateRecordLevelCorrection` `updateRecordDemeritCorrection` 等の呼び出しを段階的に無効化し、直接 `Effect{n}` / `Effect{n}Level` / `Demerit{n}` を更新するように変更する。
2. `.correction-input` や `.level-correction-input` など補助列向けの入力 UI を非表示 (または読み取り専用) とし、既存の補助列が空である前提での動作確認を実施する。
3. 併せて `docs/reference-csv-columns.md` の該当列を「非推奨 (deprecated)」扱いと明記し、開発チームに補助列へ値を書き戻さない方針を共有する。
4. `merge_results.py` では補助列を最終 CSV へ書き戻さないようガードを追加し、`Effect{n}` 系列への直接マージ結果を検証する。

### フェーズ 2: データマイグレーションとテスト強化
1. 過去 CSV に残存する補助列値を `Effect{n}` 等へ反映するスクリプト (例: `scripts/migrate_effect_corrections.py`) を追加し、既存資産をクリーニングする。既にレビュー CSV を含む過去資産が存在しないケースでは、このステップは省略可能です。
2. `Effect{n}LevelSuppressed` の出力条件を `Effect{n}LevelOptions` の内容に基づく判定へ段階的に切り替え、レベル非対応効果の抑制挙動が維持されることを確認する。【F:docs/reference-csv-columns.md†L68-L96】
3. 上記マイグレーション後の CSV を用いた統合テストを作成し、補助列が空であってもギャラリー表示・保存・マージが成立することを pytest などで確認する。
4. ギャラリーの E2E テスト (Playwright) が存在する場合、補助列 UI への依存を解消した新シナリオへ更新する。

### フェーズ 3: 補助列および関連コードの完全削除
1. `docs/reference-csv-columns.md` から補助列の記述を削除し、保存形式から正式に廃止することを宣言する。
2. フロントエンド (`templates/gallery/render/effectFactory.js` など) およびバックエンド (`merge_results.py`, `relic_data.py`) から補助列に関するフィールド、定数、バリデーションを削除する。
3. `Effect{n}LevelSuppressed` 列を正式に廃止し、レベル抑制は `Effect{n}LevelOptions` の内容のみで判定するようロジックを整理する。【F:docs/reference-csv-columns.md†L68-L96】
4. 不要となったユーティリティ (`setCorrectionLevelCandidates` など補助列専用ロジック) を整理し、同時に死活テスト・リグレッションテストを再実施する。
5. `datasets/` や `results/` 内の既存 CSV から補助列を削除し、バージョン管理下にあるサンプルデータも更新する。

## ロールバック戦略
- 各フェーズ終了後にタグを切り、問題発生時には直前のタグへ即時戻せるようにしておく。
- マイグレーションスクリプトは冪等にし、実行前に対象ファイルのバックアップ (`*.bak`) を生成する。
- UI 変更は Feature Flag (`ENABLE_EFFECT_CORRECTION_COLUMNS` など) で段階的に切り替えられるようにし、想定外の副作用が発生した場合に即座に補助列運用へ戻せるよう備える。

## コミュニケーション
- ステークホルダー向けに変更スケジュールと影響範囲を共有する Slack アナウンスを行い、フェーズ開始前後で再周知する。
- レビュー担当者にはフェーズ 1 完了後に新しい入力フローのドキュメント (スクリーンショット付き) を配布し、混乱を避ける。
- CSV 出力を参照する外部ツールがある場合は API 互換性の確認と修正依頼のスケジュールを調整する。

## 次のアクション
- フェーズ 1 用の実装タスクを issue 化し、優先度・担当者を設定する。
- マイグレーションスクリプトの要件定義とサンプルデータでの検証計画を策定する。
- Feature Flag による段階的リリース計画をプロダクトオーナーへレビュー依頼する。

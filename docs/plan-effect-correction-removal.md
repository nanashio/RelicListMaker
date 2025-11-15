# Effect{n}Correction 系列段階的削除計画

## 背景
ギャラリー UI とバックエンドはかつて `Effect{n}Correction` / `Effect{n}LevelCorrection` / `Demerit{n}Correction` 列に一時的な修正値を保持し、保存時に基列へ転記する設計でした。現在は補助列を廃止し、ビューアが直接 `Effect{n}` / `Effect{n}Level` / `Demerit{n}` を更新する実装へ移行済みです。プロジェクトは未リリースのため既存レビュー CSV は無く、段階的削除の目的は今後のデータと開発フローの移行安全性を確保することにあります。また `Effect{n}LevelSuppressed` 列は `Effect{n}LevelOptions` の候補有無を参照する実装に置き換え済みで、出力 CSV には生成されません。【F:templates/gallery/render/effectViewModel.js†L1-L188】【F:templates/gallery/render/effectFactory.js†L1-L960】【F:templates/gallery/events/recordActionHandlers.js†L1-L640】【F:merge_results.py†L1-L320】

## 進捗状況 (2025-11-21 時点)
- ✅ フェーズ 1-2: `docs/reference-csv-columns.md` で補助列を非推奨化し、レビュー CSV へ値を書き戻さない運用方針を明文化しました。【F:docs/reference-csv-columns.md†L55-L96】
- ✅ フェーズ 1-2: ギャラリー UI の補正入力を常時読み取り専用に変更し、非表示となっていた効果・デメリットを再表示しつつ保存処理では補助列を利用しない挙動に統一しました。【F:templates/gallery/gallery.js†L1-L200】【F:templates/gallery/render/effectFactory.js†L1-L140】
- ✅ フェーズ 1-4: `_apply_corrections` の互換ガードを撤去し、`merge_results` が補助列を検出した場合はマイグレーション不足として例外を投げるようにしました。これにより旧 CSV のまま統合処理へ進むことを防ぎ、`scripts/migrate_effect_corrections.py` の実行を強制できます。【F:merge_results.py†L266-L321】【F:tests/test_merge_results.py†L258-L305】
- ✅ フェーズ 2-1: 既存 CSV が存在しないことを確認済みで、追加マイグレーションは不要と判断しました。検証用に `scripts/migrate_effect_corrections.py` を試作しましたが、計画上は実行不要ステップとして扱っています。【F:scripts/migrate_effect_corrections.py†L1-L113】
- ✅ フェーズ 2-2: レベル抑制判定を `Effect{n}LevelOptions` の候補有無に集約し、`none` しかない場合はセレクトを無効化することで旧 `Effect{n}LevelSuppressed` の挙動を再現しました。UI の処理と単体テストで `none` の除外や `LevelOptionsDisplay` の更新を確認済みです。【F:templates/gallery/render/effectViewModel.js†L1-L24】【F:templates/gallery/render/effectFactory.js†L117-L135】【F:tests/js/gallery_modules.test.mjs†L1742-L1748】【F:tests/js/gallery_modules.test.mjs†L2237-L2251】
- ✅ フェーズ 2-3: マイグレーション後の CSV を模した pytest シナリオを追加し、補助列を完全に削除したデータでも `merge_results` が補正済み値とステータスを維持することを確認しました。【F:tests/test_merge_results.py†L340-L366】
- ✅ フェーズ 2-4: 補助列未依存の Playwright シナリオを追加し、効果名を直接編集した際に保存 API が補助列を含まないペイロードを送信することと、基列 `Effect{n}` / `Effect{n}Status` が更新されることを検証しました。Playwright をインストール済みのローカル環境でシナリオが成功することも確認済みです。【F:tests/browser/viewer.spec.ts†L100-L160】
- ✅ フェーズ 3-1, 3-2: 補助列 `Effect{n}Correction` / `Effect{n}LevelCorrection` / `Demerit{n}Correction` の参照をフロントエンド・バックエンド双方から削除し、ビューアが基列へ直接書き込む実装へ更新しました。`recordActionHandlers` は補助列を触らずに `Effect{n}` / `Effect{n}Level` / `Demerit{n}` を更新し、`merge_results` と GUI のレビュー判定も基列のみを参照するよう統一しています。【F:templates/gallery/render/effectViewModel.js†L1-L188】【F:templates/gallery/render/effectFactory.js†L90-L1028】【F:templates/gallery/events/recordActionHandlers.js†L240-L660】【F:merge_results.py†L266-L286】【F:gui/handlers.py†L19-L52】【F:tests/js/gallery_modules.test.mjs†L1758-L3404】【F:tests/test_merge_results.py†L232-L324】
- ✅ フェーズ 3-2 フォローアップ: 効果値が既存値から変化していない場合は `Effect{n}Status` のレビュー状態を維持するようにし、手動補正を解除したときのみ未レビューへ戻る挙動を保証しました。これにより補正列廃止後も `only_reviewed=True` の統合作業でレビュー済み行が欠落しないことを確認しています。【F:templates/gallery/events/recordActionHandlers.js†L350-L460】【F:merge_results.py†L266-L286】
- ✅ フェーズ 3-4: 補助列依存のユーティリティとテストシナリオを整理し、レビュー済み CSV が基列のみで成立することを pytest / Node.js テストで検証しました。旧形式 CSV についてはマイグレーションスクリプトを維持しつつ、新しいサンプルデータと統合テストを基列主体に刷新しています。【F:merge_results.py†L266-L286】【F:tests/test_merge_results.py†L40-L324】【F:tests/js/gallery_modules.test.mjs†L1758-L3404】
- ✅ フェーズ 3-4 フォローアップ: 統合データセット（`merged`）の深層遺物がタイプ別デメリットルールを確実に参照するよう `effectFactory` を調整し、Node.js テストで入力プレースホルダーとレビュー操作の可用性を確認しました。【F:templates/gallery/render/effectFactory.js†L160-L214】【F:templates/gallery/render/effectFactory.js†L287-L336】【F:tests/js/gallery_modules.test.mjs†L2118-L2171】
- ✅ フェーズ 3-3: `Effect{n}LevelSuppressed` 列を完全廃止し、出力・マージ・ビューアのいずれでも候補リストの `none` 判定に一本化しました。生成 CSV に列が現れないことと `Effect{n}LevelOptions` の保持をテストで確認済みです。【F:relic_pipeline/io/exporter.py†L150-L159】【F:tests/test_merge_results.py†L244-L269】【F:docs/reference-csv-columns.md†L55-L96】
- ✅ フェーズ 3-5: リポジトリ内のサンプル CSV を再確認し、`templates/master_relics*.csv` のみが管理対象で補助列が残存していないことを確認しました。`datasets/` と `tests/` に CSV は含まれておらず、補助列付きファイルのクリーンアップは不要と結論づけています。【F:templates/master_relics.csv†L1-L6】【F:templates/master_relics_deep.csv†L1-L6】【F:templates/master_relics_demerit.csv†L1-L6】

## 段階的削除方針
補助列を即時削除すると既存のレビュー CSV からの復元や未保存データの損失リスクがあるため、段階的な移行を推奨します。以下の 3 フェーズで順次機能を削除します。

### フェーズ 1: 補助列の書き込み停止と UI 非表示化
1. `templates/gallery/events/recordActionHandlers.js` で `updateRecordNameCorrection` `updateRecordLevelCorrection` `updateRecordDemeritCorrection` 等の呼び出しを段階的に無効化し、直接 `Effect{n}` / `Effect{n}Level` / `Demerit{n}` を更新するように変更する。
2. `.correction-input` や `.level-correction-input` など補助列向けの入力 UI を非表示 (または読み取り専用) とし、既存の補助列が空である前提での動作確認を実施する。
3. 併せて `docs/reference-csv-columns.md` の該当列を「非推奨 (deprecated)」扱いと明記し、開発チームに補助列へ値を書き戻さない方針を共有する。
4. `merge_results.py` では補助列を最終 CSV へ書き戻さないようガードを追加し、`Effect{n}` 系列への直接マージ結果を検証する。

### フェーズ 2: データマイグレーションとテスト強化
1. 過去 CSV に残存する補助列値を `Effect{n}` 等へ反映するスクリプト (例: `scripts/migrate_effect_corrections.py`) を追加し、既存資産をクリーニングする。既にレビュー CSV を含む過去資産が存在しないケースでは、このステップは省略可能です。
2. `Effect{n}LevelSuppressed` の出力条件を `Effect{n}LevelOptions` の内容に基づく判定へ段階的に切り替え、レベル非対応効果の抑制挙動が維持されることを確認する。（2025-11-21 完了）【F:docs/reference-csv-columns.md†L55-L96】
3. 上記マイグレーション後の CSV を用いた統合テストを作成し、補助列が空であってもギャラリー表示・保存・マージが成立することを pytest などで確認する。
4. ギャラリーの E2E テスト (Playwright) が存在する場合、補助列 UI への依存を解消した新シナリオへ更新する。

### フェーズ 3: 補助列および関連コードの完全削除
1. `docs/reference-csv-columns.md` から補助列の記述を削除し、保存形式から正式に廃止することを宣言する。
2. フロントエンド (`templates/gallery/render/effectFactory.js` など) およびバックエンド (`merge_results.py`, `relic_data.py`) から補助列に関するフィールド、定数、バリデーションを削除する。
3. `Effect{n}LevelSuppressed` 列を正式に廃止し、レベル抑制は `Effect{n}LevelOptions` の内容のみで判定するようロジックを整理する。（2025-11-21 完了）【F:docs/reference-csv-columns.md†L55-L96】
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
- レビュー手順書・GUI ドキュメントを刷新し、基列を直接編集する新しいフローとステータス更新ルールを共有する。
- `scripts/migrate_effect_corrections.py` の運用手順をレビュー手順書へ組み込み、補助列付き CSV が投入された際のエラー解消フローを共有する。

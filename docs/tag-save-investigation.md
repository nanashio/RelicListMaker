# タグ保存不具合の調査メモ

## TomSelect 周りのイベント挙動
- `templates/gallery/vendor/tom-select/tom-select.complete.js` では、タグ追加・削除などで `triggerChange()` が呼ばれると、非表示の元 input に対して `input` と `change` イベントがバブリング有効で発火する実装になっている。イベント発火前に `syncInputValue()` で `items.join(delimiter)`（デフォルトは `;`）を `input.value` に書き戻す。結果的に DOM イベント経由で `.item-tags-input` の値が更新される前提。 【F:templates/gallery/vendor/tom-select/tom-select.complete.js†L20-L74】【F:templates/gallery/vendor/tom-select/tom-select.complete.js†L170-L320】
- `createTagInputController` は TomSelect を `delimiter: ';'` などで初期化しつつ、`syncValue()` 経由で `setValue(..., true)` を呼ぶため初期同期時はイベントを発火させない。実際の入力時は TomSelect 側の `triggerChange()` を通じてイベントが流れる想定。 【F:templates/gallery/components/tagInput.js†L39-L99】

## ギャラリー側のイベント処理
- ギャラリー本体は `.gallery` に対する `input`/`change` リスナでタグ用 input を拾い、`updateItemTags` を呼び出す。タグ入力の対象要素判定は、TomSelect 生成時に付与される `data-tag-input-root="true"` を辿って元の `.item-tags-input` を取得するロジック。 【F:templates/gallery/events/galleryEvents.js†L196-L270】
- `updateItemTags` は渡された input の `value` をそのまま正規化してレコードを更新し、変更があれば `scheduleSave()` をかける。したがって TomSelect が `input.value` を更新するかどうかに依存する。 【F:templates/gallery/events/recordActionHandlers.js†L360-L432】【F:templates/gallery/gallery.js†L1553-L1602】

## 保存処理側の挙動
- 保存フロー自体はレコード配列をそのまま OPFS/HTTP 経由で書き戻し、サーバー側でも `Tags` カラムは `_serialize_tags_field()` でセミコロン区切りに正規化して CSV 出力するだけで、特別なフィルタリングや破棄はない。フロント側で `record.Tags` が更新されさえすれば書き込まれる設計。 【F:templates/gallery/storage/utils.js†L424-L560】【F:viewer_server/storage.py†L1-L220】

## 現時点の見立て
- TomSelect は `triggerChange()` 実行時のみ `input`/`change` を元の input に対して発火するため、チップ追加・削除・Enter/Blur でコミットされない限り `input.value` は更新されない。このため「文字を入力しただけで確定操作をしていない」ケースでは `updateItemTags` が実行されず、保存も走らない可能性がある。
- コード上は TomSelect 側のイベント伝搬と `updateItemTags` の呼び出し経路が一致しており、保存 API も `record.Tags` をそのまま CSV に書き出す。実際に `triggerChange()` が呼ばれているか（例えばタグの追加・削除操作で発火しているか）をブラウザ側のデバッグログなどで確認するのが次のステップ。

## デバッグログの有効化
- タグ入力系のデバッグログは既定で無効。`localStorage.setItem('galleryDebugTags', 'true')` または `window.galleryDebugTags = true` を設定してリロードすると、TomSelect の `change`/`item` イベント、ネイティブ `input`/`change`、`updateItemTags` のログが出力される。無効化するには `localStorage.removeItem('galleryDebugTags')` でリロード。

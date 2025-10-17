const assert = require('assert');

const { createRecordUtils } = require('../templates/gallery.js');

const recordUtils = createRecordUtils();

(function testGetRecordByIndex() {
    const records = [{ id: 1 }, { id: 2 }, { id: 3 }];
    assert.strictEqual(recordUtils.getRecordByIndex(records, 0).id, 1);
    assert.strictEqual(recordUtils.getRecordByIndex(records, 2).id, 3);
    assert.strictEqual(recordUtils.getRecordByIndex(records, -1), null);
    assert.strictEqual(recordUtils.getRecordByIndex(records, 5), null);
    assert.strictEqual(recordUtils.getRecordByIndex(() => records, 1).id, 2);
})();

(function testUpdateRecordField() {
    const records = [{}, {}];
    assert.strictEqual(recordUtils.updateRecordField(records, 0, 'note', 'メモ'), true);
    assert.strictEqual(records[0].note, 'メモ');
    assert.strictEqual(recordUtils.updateRecordField(records, 0, 'note', 'メモ'), false);
    assert.strictEqual(recordUtils.updateRecordField(records, 0, 'note', ''), true);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(records[0], 'note'), false);
    assert.strictEqual(recordUtils.updateRecordField(records, 3, 'note', 'x'), false);
})();

(function testFlagManager() {
    const records = [{}, {}];
    const flags = recordUtils.createFlagManager(() => records, 'favorite', ['yes', '1', 'true']);

    assert.strictEqual(flags.isSet(records[0]), false);
    records[0].favorite = 'YES';
    assert.strictEqual(flags.isSet(records[0]), true);
    assert.strictEqual(flags.set(0, true), false);
    assert.strictEqual(flags.set(0, false), true);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(records[0], 'favorite'), false);
    assert.strictEqual(flags.set(1, true), true);
    assert.strictEqual(records[1].favorite, true);
    assert.strictEqual(flags.set(1, false), true);
    assert.strictEqual(flags.isSet(records[1]), false);
    assert.strictEqual(flags.set(5, true), false);
})();

console.log('recordUtils tests passed');

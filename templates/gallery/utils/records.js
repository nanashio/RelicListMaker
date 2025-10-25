(() => {
    function ensureRecords(recordsOrProvider) {
        if (typeof recordsOrProvider === 'function') {
            return ensureRecords(recordsOrProvider());
        }
        return Array.isArray(recordsOrProvider) ? recordsOrProvider : [];
    }

    function getRecordByIndex(recordsOrProvider, index) {
        const records = ensureRecords(recordsOrProvider);
        if (Number.isNaN(index) || index < 0 || index >= records.length) {
            return null;
        }
        const record = records[index];
        return record && typeof record === 'object' ? record : null;
    }

    function updateRecordField(recordsOrProvider, recordIndex, key, value) {
        const record = getRecordByIndex(recordsOrProvider, recordIndex);
        if (!record) {
            return false;
        }
        if (value) {
            if (record[key] === value) {
                return false;
            }
            record[key] = value;
            return true;
        }
        if (Object.prototype.hasOwnProperty.call(record, key)) {
            delete record[key];
            return true;
        }
        return false;
    }

    function createFlagManager(recordsOrProvider, key, truthyTokens) {
        const normalizedTokens = new Set(
            (truthyTokens || []).map((token) => (token || '').toString().toLowerCase())
        );

        const normalize = (value) => {
            if (value === true) {
                return true;
            }
            if (value === false || value == null) {
                return false;
            }
            if (typeof value === 'number') {
                return value === 1;
            }
            if (typeof value === 'string') {
                const text = value.trim().toLowerCase();
                return normalizedTokens.has(text);
            }
            return false;
        };

        const isSet = (record) => {
            if (!record || typeof record !== 'object') {
                return false;
            }
            return normalize(record[key]);
        };

        const set = (recordIndex, nextState) => {
            const record = getRecordByIndex(recordsOrProvider, recordIndex);
            if (!record) {
                return false;
            }
            if (nextState) {
                if (isSet(record)) {
                    return false;
                }
                record[key] = true;
                return true;
            }
            if (Object.prototype.hasOwnProperty.call(record, key)) {
                delete record[key];
                return true;
            }
            return false;
        };

        return { normalize, isSet, set };
    }

    function createRecordUtils() {
        return { getRecordByIndex, updateRecordField, createFlagManager };
    }

    if (!window.galleryRecordUtilsFactory) {
        window.galleryRecordUtilsFactory = {};
    }

    window.galleryRecordUtilsFactory.createRecordUtils = createRecordUtils;

    if (!window.galleryRecordUtils) {
        window.galleryRecordUtils = createRecordUtils();
    }
})();

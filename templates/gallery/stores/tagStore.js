(() => {
    function createTagStore(config = {}) {
        const { parseTagTokens, formatTagTokens, getRecordByIndex, setRecordTags } = config;

        if (typeof parseTagTokens !== 'function') {
            throw new Error('createTagStore: parseTagTokens function is required');
        }
        if (typeof formatTagTokens !== 'function') {
            throw new Error('createTagStore: formatTagTokens function is required');
        }

        const normalizeTokens = (value) => parseTagTokens(value);
        const formatTokens = (value) => formatTagTokens(value);
        const normalizeTags = (value) => formatTokens(normalizeTokens(value));

        function buildEntry(value) {
            const tokens = normalizeTokens(value);
            return {
                normalized: formatTokens(tokens),
                tokens,
                tokenKeys: tokens.map((token) => token.toLowerCase())
            };
        }

        function readRecordTags(recordIndex) {
            const record = typeof getRecordByIndex === 'function' ? getRecordByIndex(recordIndex) : null;
            return buildEntry(record ? record.Tags : '');
        }

        function updateRecordTags(recordIndex, source) {
            const entry = buildEntry(source);
            const changed = typeof setRecordTags === 'function' ? setRecordTags(recordIndex, entry.normalized) : false;
            return { ...entry, changed };
        }

        return {
            normalizeTokens,
            formatTokens,
            normalizeTags,
            buildEntry,
            readRecordTags,
            updateRecordTags
        };
    }

    if (!window.galleryStores) {
        window.galleryStores = {};
    }
    window.galleryStores.createTagStore = createTagStore;
})();

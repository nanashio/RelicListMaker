(() => {
    'use strict';

    const DEFAULT_ITEM_STATE = Object.freeze({
        duplicate: false,
        searchCache: '',
        statusCache: '',
        effectStates: [],
        favorite: false,
        itemColor: '',
        relicType: '',
        effectValues: [],
        tagTokens: []
    });

    function toItemArray(items) {
        if (!items) {
            return [];
        }
        if (Array.isArray(items)) {
            return items;
        }
        if (typeof items === 'object' && typeof items.length === 'number') {
            return Array.from(items);
        }
        return [];
    }

    function mapItemElementsToState(items, helpers = {}) {
        const normalizeItemColor =
            typeof helpers.normalizeItemColor === 'function'
                ? helpers.normalizeItemColor
                : (value) => value;
        const normalizeItemRelicType =
            typeof helpers.normalizeItemRelicType === 'function'
                ? helpers.normalizeItemRelicType
                : (value) => value;
        const readEffectSlots =
            typeof helpers.readEffectSlots === 'function' ? helpers.readEffectSlots : () => [];
        const readTagTokens = typeof helpers.readTagTokens === 'function' ? helpers.readTagTokens : () => [];

        return toItemArray(items).map((item) => {
            if (!item || !item.dataset) {
                return { ...DEFAULT_ITEM_STATE };
            }

            const effectStates = (item.dataset.effectStates || '')
                .split(',')
                .map((value) => (value == null ? '' : String(value).trim()))
                .filter((value) => value !== '');

            return {
                duplicate: item.dataset.duplicate === 'true',
                searchCache: item.dataset.searchCache || '',
                statusCache: item.dataset.statusCache || '',
                effectStates,
                favorite: item.dataset.favorite === 'true',
                itemColor: normalizeItemColor(item.dataset.itemColor || ''),
                relicType: normalizeItemRelicType(item.dataset.relicType || ''),
                effectValues: readEffectSlots(item),
                tagTokens: readTagTokens(item)
            };
        });
    }

    if (!window.galleryRenderUtils) {
        window.galleryRenderUtils = {};
    }
    window.galleryRenderUtils.mapItemElementsToState = mapItemElementsToState;
})();

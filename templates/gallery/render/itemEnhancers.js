(() => {
    function normalizeEnhancer(fn) {
        if (typeof fn !== 'function') {
            return null;
        }
        if (fn.length >= 2) {
            return fn;
        }
        return (item) => {
            fn(item);
        };
    }

    function createItemEnhancers(config = {}) {
        const {
            syncDuplicateState,
            syncFavoriteState,
            syncItemColorState,
            syncItemRelicTypeState,
            refreshItemCaches,
            baseEnhancers = [],
            additionalEnhancers = [],
            includeDefaultEnhancers = true
        } = config;

        const enhancers = [];

        const addEnhancer = (fn) => {
            const normalized = normalizeEnhancer(fn);
            if (normalized) {
                enhancers.push(normalized);
            }
        };

        if (Array.isArray(baseEnhancers)) {
            baseEnhancers.forEach(addEnhancer);
        }

        if (includeDefaultEnhancers !== false) {
            addEnhancer(syncDuplicateState);
            addEnhancer(syncFavoriteState);
            addEnhancer(syncItemColorState);
            addEnhancer(syncItemRelicTypeState);
            addEnhancer(refreshItemCaches);
        }

        if (Array.isArray(additionalEnhancers)) {
            additionalEnhancers.forEach(addEnhancer);
        }

        return enhancers;
    }

    if (!window.galleryRenderFactory) {
        window.galleryRenderFactory = {};
    }
    window.galleryRenderFactory.createItemEnhancers = createItemEnhancers;
})();

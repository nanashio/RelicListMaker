(() => {
    function normalizeToken(value) {
        if (value == null) {
            return '';
        }
        const text = String(value).trim();
        if (!text) {
            return '';
        }
        return text.toLowerCase();
    }

    function normalizeStatus(value) {
        const text = value == null ? '' : String(value).trim().toLowerCase();
        return text || 'pending';
    }

    function buildItemSearchCaches(input = {}) {
        const { baseTokens = [], effects = [] } = input;
        const tokens = [];
        const statuses = new Set();
        const effectStates = [];

        const pushToken = (value) => {
            const token = normalizeToken(value);
            if (token) {
                tokens.push(token);
            }
        };

        baseTokens.forEach(pushToken);

        effects.forEach((effect) => {
            if (!effect || typeof effect !== 'object') {
                return;
            }
            pushToken(effect.prediction);
            pushToken(effect.raw);
            pushToken(effect.correction);
            pushToken(effect.level);
            pushToken(effect.levelOptions);
            pushToken(effect.levelCorrection);
            const status = normalizeStatus(effect.status);
            statuses.add(status);
            effectStates.push(status);
        });

        if (!statuses.size) {
            statuses.add('pending');
        }

        const combined = tokens.join(' ').replace(/\s+/g, ' ').trim();
        const searchCache = combined ? ` ${combined} ` : '';
        const statusCache = `|${Array.from(statuses).join('|')}|`;

        return {
            searchCache,
            statusCache,
            effectStates
        };
    }

    function toEffectStateList(value) {
        if (Array.isArray(value)) {
            return value
                .map((entry) => normalizeStatus(entry))
                .filter((entry) => entry && entry !== '');
        }
        if (value == null) {
            return [];
        }
        return String(value)
            .split(',')
            .map((entry) => normalizeStatus(entry))
            .filter((entry) => entry && entry !== '');
    }

    function evaluateItemVisibility(item = {}, filters = {}) {
        const {
            duplicate = false,
            searchCache = '',
            statusCache = '',
            effectStates = [],
            favorite = false,
            itemColor = ''
        } = item;

        const {
            term = '',
            filter = 'all',
            colorFilter = 'all',
            includeDuplicates = false
        } = filters;

        if (duplicate && !includeDuplicates) {
            return false;
        }

        const normalizedTerm = term ? String(term).trim().toLowerCase() : '';
        if (normalizedTerm) {
            const cache = typeof searchCache === 'string' ? searchCache : '';
            if (!cache || !cache.includes(normalizedTerm)) {
                return false;
            }
        }

        if (filter !== 'all') {
            if (filter === 'resolved') {
                const states = toEffectStateList(effectStates);
                if (states.length < 3) {
                    return false;
                }
                const resolved = states.every((state, index) => {
                    if (index < 3) {
                        return state === 'pass' || state === 'corrected';
                    }
                    return true;
                });
                if (!resolved) {
                    return false;
                }
            } else if (filter === 'with-pending') {
                const cache = typeof statusCache === 'string' ? statusCache : '';
                if (!cache.includes('|pending|')) {
                    return false;
                }
            } else if (filter === 'favorite') {
                if (!favorite) {
                    return false;
                }
            }
        }

        if (colorFilter !== 'all') {
            const color = itemColor ? String(itemColor).trim().toLowerCase() : '';
            if (colorFilter === 'none') {
                if (color) {
                    return false;
                }
            } else if (color !== colorFilter) {
                return false;
            }
        }

        return true;
    }

    function filterItems(items = [], filters = {}) {
        if (!Array.isArray(items)) {
            return [];
        }
        return items.map((item) => evaluateItemVisibility(item, filters));
    }

    const namespace = window.galleryFilterUtils ? { ...window.galleryFilterUtils } : {};
    namespace.buildItemSearchCaches = buildItemSearchCaches;
    namespace.evaluateItemVisibility = evaluateItemVisibility;
    namespace.filterItems = filterItems;
    window.galleryFilterUtils = namespace;
})();

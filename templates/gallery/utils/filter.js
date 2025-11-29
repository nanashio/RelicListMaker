(() => {
    const fallbackModule = (() => {
        const TOKEN_SEPARATOR_PATTERN = /[\s,;、，　；]+/;

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

        function toNormalizedTokenList(value) {
            if (Array.isArray(value)) {
                return value
                    .map((entry) => normalizeToken(entry))
                    .filter((entry) => entry && entry !== '');
            }
            const token = normalizeToken(value);
            return token ? [token] : [];
        }

        function normalizeEffectMatchMode(value) {
            return value === 'or' ? 'or' : 'and';
        }

        function normalizeEffectValues(effectValues) {
            if (Array.isArray(effectValues)) {
                return effectValues
                    .map((value) => normalizeToken(value))
                    .filter((value) => value && value !== '')
                    .slice(0, 3);
            }
            return toNormalizedTokenList(effectValues).slice(0, 3);
        }

        function normalizeEffectSearchTerms(value) {
            if (Array.isArray(value)) {
                return value
                    .map((entry) => normalizeToken(entry))
                    .filter((entry) => entry && entry !== '');
            }
            const text = normalizeToken(value);
            if (!text) {
                return [];
            }
            return text
                .split(TOKEN_SEPARATOR_PATTERN)
                .map((entry) => normalizeToken(entry))
                .filter((entry) => entry && entry !== '');
        }

        function normalizeEffectSearchEntry(entry) {
            if (!entry || typeof entry !== 'object') {
                return null;
            }
            const { terms = [], mode = 'and' } = entry;
            const normalizedTerms = normalizeEffectSearchTerms(terms);
            if (!normalizedTerms.length) {
                return null;
            }
            return {
                terms: normalizedTerms,
                mode: normalizeEffectMatchMode(mode)
            };
        }

        function matchesEffectTerms(effectValues, terms = [], mode = 'and') {
            const normalizedEffects = normalizeEffectValues(effectValues);
            if (!terms.length) {
                return true;
            }
            if (!normalizedEffects.length) {
                return false;
            }
            const termMatches = terms.map((term) => normalizedEffects.some((value) => value.includes(term)));
            return mode === 'or' ? termMatches.some(Boolean) : termMatches.every(Boolean);
        }

        function normalizeTagSearchTerms(value) {
            if (Array.isArray(value)) {
                return value
                    .map((entry) => normalizeToken(entry))
                    .filter((entry) => entry && entry !== '');
            }
            const text = normalizeToken(value);
            if (!text) {
                return [];
            }
            return text
                .split(TOKEN_SEPARATOR_PATTERN)
                .map((entry) => normalizeToken(entry))
                .filter((entry) => entry && entry !== '');
        }

        function matchesTagTokens(tagTokens, terms = []) {
            const normalizedTerms = normalizeTagSearchTerms(terms);
            if (!normalizedTerms.length) {
                return true;
            }
            const normalizedTags = toNormalizedTokenList(tagTokens);
            if (!normalizedTags.length) {
                return false;
            }
            return normalizedTerms.every((term) => normalizedTags.some((tag) => tag.includes(term)));
        }

        function evaluateItemVisibility(item = {}, filters = {}) {
            const {
                duplicate = false,
                searchCache = '',
                statusCache = '',
                effectStates = [],
                favorite = false,
                itemColor = '',
                effectValues = [],
                tagTokens = []
            } = item;

            const {
                term = '',
                filter = 'all',
                colorFilter = 'all',
                includeDuplicates = false,
                effectTerms = [],
                effectMatchMode = 'and',
                effectSearches = [],
                tagTerm = '',
                tagTerms = []
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

            const normalizedEffectSearches = Array.isArray(effectSearches)
                ? effectSearches
                      .map((entry) => normalizeEffectSearchEntry(entry))
                      .filter((entry) => entry !== null)
                : [];

            const normalizedEffectTerms = Array.isArray(effectTerms)
                ? effectTerms.map((value) => normalizeToken(value)).filter((value) => value !== '')
                : [];
            if (!normalizedEffectSearches.length && normalizedEffectTerms.length) {
                normalizedEffectSearches.push({
                    terms: normalizedEffectTerms,
                    mode: normalizeEffectMatchMode(effectMatchMode)
                });
            }
            if (normalizedEffectSearches.length) {
                let effectMatched = null;
                normalizedEffectSearches.forEach((search, index) => {
                    const matches = matchesEffectTerms(effectValues, search.terms, search.mode);
                    if (index === 0 || effectMatched === null) {
                        effectMatched = matches;
                        return;
                    }
                    effectMatched = search.mode === 'or' ? effectMatched || matches : effectMatched && matches;
                });
                if (!effectMatched) {
                    return false;
                }
            }

            const normalizedTagTerms = normalizeTagSearchTerms(tagTerms);
            const normalizedTagFallbackTerms = normalizedTagTerms.length
                ? normalizedTagTerms
                : normalizeTagSearchTerms(tagTerm);
            if (normalizedTagFallbackTerms.length) {
                if (!matchesTagTokens(tagTokens, normalizedTagFallbackTerms)) {
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

        return {
            buildItemSearchCaches,
            evaluateItemVisibility,
            filterItems
        };
    })();

    const root = typeof window !== 'undefined' ? window : globalThis;
    const moduleApi =
        (root.galleryModules && root.galleryModules.filterPredicates) || fallbackModule;

    const namespace = root.galleryFilterUtils ? { ...root.galleryFilterUtils } : {};
    namespace.buildItemSearchCaches = moduleApi.buildItemSearchCaches;
    namespace.evaluateItemVisibility = moduleApi.evaluateItemVisibility;
    namespace.filterItems = moduleApi.filterItems;
    root.galleryFilterUtils = namespace;
})();

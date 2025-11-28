(() => {
    function normalizeDomState(dom = {}) {
        const searchTerm = dom.searchInput && typeof dom.searchInput.value === 'string' ? dom.searchInput.value : '';
        const statusFilter = dom.filterSelect && dom.filterSelect.value ? dom.filterSelect.value : 'all';
        const colorFilter = dom.colorFilter && dom.colorFilter.value ? dom.colorFilter.value : 'all';
        const includeDuplicates = Boolean(dom.showDuplicatesToggle && dom.showDuplicatesToggle.checked);

        return { searchTerm, statusFilter, colorFilter, includeDuplicates };
    }

    function applyDomState(dom = {}, state = {}) {
        if (!state || typeof state !== 'object') {
            return;
        }

        if (dom.searchInput && typeof state.searchTerm === 'string') {
            const normalized = state.searchTerm;
            if (dom.searchInput.value !== normalized) {
                dom.searchInput.value = normalized;
            }
        }

        if (dom.filterSelect && typeof state.statusFilter === 'string') {
            const normalized = state.statusFilter || 'all';
            if (dom.filterSelect.value !== normalized) {
                dom.filterSelect.value = normalized;
            }
        }

        if (dom.colorFilter && typeof state.colorFilter === 'string') {
            const normalized = state.colorFilter || 'all';
            if (dom.colorFilter.value !== normalized) {
                dom.colorFilter.value = normalized;
            }
        }

        if (dom.showDuplicatesToggle && typeof state.includeDuplicates !== 'undefined') {
            const normalized = Boolean(state.includeDuplicates);
            if (dom.showDuplicatesToggle.checked !== normalized) {
                dom.showDuplicatesToggle.checked = normalized;
            }
        }
    }

    function normalizeFilterState(state = {}) {
        return {
            searchTerm: state.searchTerm || '',
            statusFilter: state.statusFilter || 'all',
            colorFilter: state.colorFilter || 'all',
            includeDuplicates: Boolean(state.includeDuplicates)
        };
    }

    function createFilterStateBridge(options = {}) {
        const { filterStore = null, dom = {} } = options;
        const storeApi = filterStore && typeof filterStore.getState === 'function' ? filterStore : null;

        function getState() {
            if (storeApi) {
                return normalizeFilterState(storeApi.getState() || {});
            }
            return normalizeDomState(dom);
        }

        function setState(partial = {}) {
            if (storeApi && typeof storeApi.setState === 'function') {
                storeApi.setState(partial);
                return;
            }
            if (!partial || typeof partial !== 'object') {
                return;
            }
            const current = normalizeDomState(dom);
            applyDomState(dom, { ...current, ...partial });
        }

        function syncDomFromState(nextState = null) {
            const state = nextState && typeof nextState === 'object' ? nextState : getState();
            applyDomState(dom, state);
        }

        function includeDuplicates() {
            const state = getState();
            return Boolean(state.includeDuplicates);
        }

        return {
            getState,
            setState,
            syncDomFromState,
            includeDuplicates
        };
    }

    function createFilterOptionsResolver(options = {}) {
        const {
            filterStateBridge = null,
            filterStore = null,
            resolveDomState = () => normalizeFilterState(),
            collectEffectSearchEntries = () => [],
            getTagSearchTerms = () => []
        } = options;

        const bridgeApi =
            filterStateBridge && typeof filterStateBridge.getState === 'function' ? filterStateBridge : null;
        const storeApi = filterStore && typeof filterStore.getState === 'function' ? filterStore : null;

        function resolveBaseState() {
            if (bridgeApi) {
                return normalizeFilterState(bridgeApi.getState() || {});
            }
            if (storeApi) {
                return normalizeFilterState(storeApi.getState() || {});
            }
            const domState = typeof resolveDomState === 'function' ? resolveDomState() : {};
            return normalizeFilterState(domState || {});
        }

        function resolveOptions() {
            const baseState = resolveBaseState();
            const effectSearches =
                typeof collectEffectSearchEntries === 'function'
                    ? collectEffectSearchEntries()
                    : [];
            const tagTerms = typeof getTagSearchTerms === 'function' ? getTagSearchTerms() : [];

            return {
                ...baseState,
                term: (baseState.searchTerm || '').trim().toLowerCase(),
                filter: baseState.statusFilter || 'all',
                colorFilter: baseState.colorFilter || 'all',
                effectSearches: Array.isArray(effectSearches) ? effectSearches : [],
                tagTerms: Array.isArray(tagTerms) ? tagTerms : []
            };
        }

        function includeDuplicates() {
            const state = resolveBaseState();
            return Boolean(state.includeDuplicates);
        }

        return {
            resolveState: resolveBaseState,
            resolveOptions,
            includeDuplicates
        };
    }

    if (!window.galleryFilterState) {
        window.galleryFilterState = {};
    }
    window.galleryFilterState.createFilterStateBridge = createFilterStateBridge;
    window.galleryFilterState.createFilterOptionsResolver = createFilterOptionsResolver;
})();

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

    function createFilterStateBridge(options = {}) {
        const { filterStore = null, dom = {} } = options;
        const storeApi = filterStore && typeof filterStore.getState === 'function' ? filterStore : null;

        function getState() {
            if (storeApi) {
                const state = storeApi.getState() || {};
                return {
                    searchTerm: state.searchTerm || '',
                    statusFilter: state.statusFilter || 'all',
                    colorFilter: state.colorFilter || 'all',
                    includeDuplicates: Boolean(state.includeDuplicates)
                };
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

    if (!window.galleryFilterState) {
        window.galleryFilterState = {};
    }
    window.galleryFilterState.createFilterStateBridge = createFilterStateBridge;
})();

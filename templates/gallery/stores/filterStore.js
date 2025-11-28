(() => {
    function createFilterStore(initialState = {}) {
        const state = {
            searchTerm: '',
            statusFilter: 'all',
            colorFilter: 'all',
            includeDuplicates: false,
            ...initialState
        };

        const listeners = new Set();

        function getState() {
            return { ...state };
        }

        function notify() {
            listeners.forEach((listener) => {
                if (typeof listener === 'function') {
                    listener(getState());
                }
            });
        }

        function setState(partial) {
            if (!partial || typeof partial !== 'object') {
                return;
            }
            let changed = false;
            Object.keys(partial).forEach((key) => {
                if (!Object.prototype.hasOwnProperty.call(state, key)) {
                    return;
                }
                const nextValue = partial[key];
                if (state[key] === nextValue) {
                    return;
                }
                state[key] = nextValue;
                changed = true;
            });
            if (changed) {
                notify();
            }
        }

        function setSearchTerm(value) {
            setState({ searchTerm: value == null ? '' : String(value) });
        }

        function setStatusFilter(value) {
            setState({ statusFilter: value == null ? 'all' : String(value) });
        }

        function setColorFilter(value) {
            setState({ colorFilter: value == null ? 'all' : String(value) });
        }

        function setIncludeDuplicates(value) {
            setState({ includeDuplicates: Boolean(value) });
        }

        function subscribe(listener) {
            if (typeof listener !== 'function') {
                return () => {};
            }
            listeners.add(listener);
            return () => listeners.delete(listener);
        }

        return {
            getState,
            setState,
            setSearchTerm,
            setStatusFilter,
            setColorFilter,
            setIncludeDuplicates,
            subscribe
        };
    }

    if (!window.galleryStores) {
        window.galleryStores = {};
    }
    window.galleryStores.createFilterStore = createFilterStore;
})();

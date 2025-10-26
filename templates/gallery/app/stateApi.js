(() => {
    function cloneArray(values) {
        if (!Array.isArray(values)) {
            return [];
        }
        return values.slice();
    }

    function createStateApi(config = {}) {
        const { stateStore } = config;
        if (!stateStore || typeof stateStore.getState !== 'function') {
            throw new Error('createStateApi: stateStore with getState is required');
        }

        const view = stateStore.getState();
        const core = view && view.core ? view.core : null;
        const dataset = view && view.dataset ? view.dataset : null;

        if (!core || !dataset) {
            throw new Error('createStateApi: stateStore returned invalid state');
        }

        if (!Array.isArray(core.labelSymbols)) {
            core.labelSymbols = [];
        }

        function setRecords(records) {
            core.records = Array.isArray(records) ? records : [];
        }

        function setItems(items) {
            core.items = Array.isArray(items) ? items : [];
        }

        function clearRecordsAndItems() {
            core.records = [];
            core.items = [];
        }

        function setMasterOptions(options) {
            core.masterOptions = cloneArray(options);
        }

        function markMasterDatalistPrepared(prepared = true) {
            core.masterDatalistPrepared = Boolean(prepared);
        }

        function setMasterLevels(levels) {
            core.masterLevels = levels;
        }

        function setMasterLevelsLoaded(loaded) {
            core.masterLevelsLoaded = Boolean(loaded);
        }

        function setMasterLevelsPromise(promise) {
            core.masterLevelsPromise = promise || null;
            return promise;
        }

        function clearMasterLevelsPromise() {
            core.masterLevelsPromise = null;
        }

        function addLabelSymbol(symbol) {
            if (typeof symbol !== 'string') {
                return;
            }
            const trimmed = symbol.trim();
            if (!trimmed) {
                return;
            }
            core.labelSymbols.push(trimmed);
        }

        function ensureLabelSymbolsLength(targetLength, builder = (slot) => `Slot ${slot}`) {
            const desired = Number.parseInt(targetLength, 10);
            if (!Number.isFinite(desired) || desired <= core.labelSymbols.length) {
                return;
            }
            for (let index = core.labelSymbols.length + 1; index <= desired; index += 1) {
                const value = builder(index);
                if (typeof value === 'string' && value.trim()) {
                    core.labelSymbols.push(value);
                } else {
                    core.labelSymbols.push(`Slot ${index}`);
                }
            }
        }

        function setShowOcr(value) {
            core.showOcr = Boolean(value);
        }

        return {
            state: core,
            datasetState: dataset,
            getCoreState: () => core,
            getDatasetState: () => dataset,
            setRecords,
            setItems,
            clearRecordsAndItems,
            setMasterOptions,
            markMasterDatalistPrepared,
            setMasterLevels,
            setMasterLevelsLoaded,
            setMasterLevelsPromise,
            clearMasterLevelsPromise,
            addLabelSymbol,
            ensureLabelSymbolsLength,
            setShowOcr
        };
    }

    if (!window.galleryAppStateFactory) {
        window.galleryAppStateFactory = {};
    }

    window.galleryAppStateFactory.createStateApi = createStateApi;
})();

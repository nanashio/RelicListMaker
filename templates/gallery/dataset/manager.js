(() => {
    function createDatasetManager(config = {}) {
        const {
            stateStore,
            datasetState,
            state,
            resolveDatasetState,
            areSourcesEqual,
            applyDatasetState,
            clearForReload,
            loadInitialData
        } = config;

        if (!stateStore || !datasetState || !state || typeof applyDatasetState !== 'function') {
            throw new Error('createDatasetManager: invalid configuration');
        }

        const clampDatasetIndex = (index) => stateStore.clampIndex(index);

        const getCurrentDataset = () => {
            if (!datasetState.list.length) {
                return null;
            }
            const index = clampDatasetIndex(datasetState.activeIndex);
            if (index < 0) {
                return null;
            }
            return datasetState.list[index] || null;
        };

        const prepareInitialDataset = () => {
            if (!datasetState.list.length) {
                return;
            }
            const dataset = getCurrentDataset();
            if (!dataset) {
                stateStore.setActiveDatasetIndex(datasetState.list.length ? 0 : -1);
                return;
            }
            stateStore.setActiveDatasetIndex(datasetState.activeIndex);
            const descriptor = resolveDatasetState(dataset);
            applyDatasetState(descriptor);
        };

        const switchDataset = async (index, options = {}) => {
            if (!datasetState.list.length) {
                return;
            }
            const nextIndex = clampDatasetIndex(index);
            const dataset = datasetState.list[nextIndex];
            if (!dataset) {
                return;
            }

            const descriptor = resolveDatasetState(dataset);
            const expectedImageDir = descriptor.kind === 'merged' ? '' : descriptor.imageDir || '.';
            const forceReload = Boolean(options.forceReload);
            const shouldReload =
                forceReload ||
                datasetState.activeIndex !== nextIndex ||
                state.csvPath !== descriptor.csvPath ||
                state.imageDir !== expectedImageDir ||
                datasetState.kind !== descriptor.kind ||
                !areSourcesEqual(datasetState.sources, descriptor.sources);

            stateStore.setActiveDatasetIndex(nextIndex);
            applyDatasetState(descriptor);

            if (!shouldReload) {
                return;
            }

            if (typeof clearForReload === 'function') {
                clearForReload();
            }

            if (typeof loadInitialData === 'function') {
                await loadInitialData();
            }
        };

        return {
            clampDatasetIndex,
            getCurrentDataset,
            prepareInitialDataset,
            switchDataset
        };
    }

    if (!window.galleryDatasetManagerFactory) {
        window.galleryDatasetManagerFactory = {};
    }

    window.galleryDatasetManagerFactory.createDatasetManager = createDatasetManager;
})();

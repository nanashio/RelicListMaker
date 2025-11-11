(() => {
    function createAppController(config = {}) {
        const {
            attachEventHandlers = () => {},
            prepareInitialDataset = () => {},
            setupDatasetSelector = () => {},
            ensureMasterLevels = async () => {},
            ensureMasterOptions = async () => {},
            ensureMasterDemeritOptions = async () => {},
            datasetState = { list: [], activeIndex: -1 },
            switchDataset = async () => {},
            loadInitialData = async () => {}
        } = config;

        async function initialize() {
            attachEventHandlers();
            prepareInitialDataset();
            setupDatasetSelector();
            await ensureMasterLevels();
            await ensureMasterOptions();
            await ensureMasterDemeritOptions();
            if (datasetState && Array.isArray(datasetState.list) && datasetState.list.length) {
                await switchDataset(datasetState.activeIndex, { forceReload: true });
            } else {
                await loadInitialData();
            }
        }

        return { initialize };
    }

    if (!window.galleryAppFactory) {
        window.galleryAppFactory = {};
    }

    window.galleryAppFactory.createAppController = createAppController;
})();

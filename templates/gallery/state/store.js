(() => {
    function createStateStore(initialState = {}) {
        const listeners = new Set();
        const core = {
            records: [],
            items: [],
            labelSymbols: initialState.labelSymbols || [],
            imageDir: initialState.imageDir || '.',
            csvPath: initialState.csvPath || '',
            masterCsvPath: initialState.masterCsvPath || '',
            masterJsonPath: initialState.masterJsonPath || '',
            masterOptions: Array.isArray(initialState.masterOptions) ? initialState.masterOptions.slice() : [],
            masterDatalistPrepared: false,
            masterLevels: initialState.masterLevels,
            masterLevelsLoaded: Boolean(initialState.masterLevelsLoaded),
            masterLevelsPromise: null,
            showOcr: false
        };
        const dataset = {
            list: [],
            activeIndex: -1,
            label: '',
            folder: '',
            kind: '',
            sources: []
        };

        const cloneSources = (sources) => {
            if (!Array.isArray(sources)) {
                return [];
            }
            return sources.map((source) => ({
                label: source && typeof source.label === 'string' ? source.label : '',
                csv: source && typeof source.csv === 'string' ? source.csv : '',
                imgDir: source && typeof source.imgDir === 'string' ? source.imgDir : '',
                folder: source && typeof source.folder === 'string' ? source.folder : '',
                index: source && Number.isFinite(source.index) ? Number(source.index) : 0
            }));
        };

        let suppressNotifications = false;

        function emitChange() {
            if (suppressNotifications) {
                return;
            }
            listeners.forEach((listener) => {
                try {
                    listener({ core, dataset });
                } catch (error) {
                    console.error('state listener error', error);
                }
            });
        }

        function subscribe(listener) {
            if (typeof listener !== 'function') {
                return () => undefined;
            }
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        }

        function getState() {
            return { core, dataset };
        }

        function update(updater) {
            if (typeof updater === 'function') {
                updater({ core, dataset });
            } else if (updater && typeof updater === 'object') {
                if (updater.core && typeof updater.core === 'object') {
                    Object.assign(core, updater.core);
                }
                if (updater.dataset && typeof updater.dataset === 'object') {
                    Object.assign(dataset, updater.dataset);
                }
            }
            emitChange();
        }

        function setDatasetsInternal(nextDatasets) {
            dataset.list = Array.isArray(nextDatasets) ? nextDatasets.slice() : [];
            if (!dataset.list.length) {
                dataset.activeIndex = -1;
                return;
            }
            if (dataset.activeIndex < 0 || dataset.activeIndex >= dataset.list.length) {
                dataset.activeIndex = 0;
            }
        }

        function clampIndex(index) {
            if (!dataset.list.length) {
                return -1;
            }
            const parsed = Number.parseInt(index, 10);
            if (Number.isNaN(parsed) || parsed < 0) {
                return 0;
            }
            if (parsed >= dataset.list.length) {
                return dataset.list.length - 1;
            }
            return parsed;
        }

        function setActiveDatasetIndex(nextIndex) {
            const clamped = clampIndex(nextIndex);
            if (clamped === dataset.activeIndex) {
                return dataset.activeIndex;
            }
            dataset.activeIndex = clamped;
            emitChange();
            return dataset.activeIndex;
        }

        function updateDescriptor(descriptor) {
            const next = descriptor || {};
            dataset.label = next.label || '';
            dataset.folder = next.folder || '';
            dataset.kind = next.kind || '';
            dataset.sources = cloneSources(next.sources);
            if (dataset.kind === 'merged') {
                core.csvPath = next.csvPath || 'merged-dataset.csv';
                core.imageDir = '';
            } else {
                core.csvPath = next.csvPath || '';
                core.imageDir = next.imageDir ? next.imageDir : '.';
            }
            emitChange();
        }

        suppressNotifications = true;
        try {
            setDatasetsInternal(initialState.datasets);
            setActiveDatasetIndex(initialState.activeDatasetIndex);
        } finally {
            suppressNotifications = false;
        }

        return {
            core,
            dataset,
            getState,
            subscribe,
            update,
            setDatasets(nextDatasets) {
                suppressNotifications = true;
                try {
                    setDatasetsInternal(nextDatasets);
                    if (dataset.activeIndex >= dataset.list.length) {
                        dataset.activeIndex = dataset.list.length ? dataset.list.length - 1 : -1;
                    }
                } finally {
                    suppressNotifications = false;
                }
                emitChange();
            },
            setActiveDatasetIndex,
            clampIndex,
            updateDescriptor
        };
    }

    if (!window.galleryStateStoreFactory) {
        window.galleryStateStoreFactory = {};
    }
    window.galleryStateStoreFactory.createStateStore = createStateStore;
})();

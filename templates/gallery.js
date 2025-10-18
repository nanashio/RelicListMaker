(() => {
    'use strict';

    const MASTER_DATALIST_ID = 'master-relic-options';
    const DUPLICATE_KEY = 'Duplicate';
    const FAVORITE_KEY = 'Favorite';
    const ITEM_COLOR_OPTIONS = [
        { key: 'red', label: '赤', className: 'item-color-red' },
        { key: 'yellow', label: '黄', className: 'item-color-yellow' },
        { key: 'green', label: '緑', className: 'item-color-green' },
        { key: 'blue', label: '青', className: 'item-color-blue' }
    ];

    const body = document.body;
    const {
        resultsCsv: initialCsvPath = '',
        imgDir: imageDir = '.',
        labelSymbols: labelSymbolsJson = '[]',
        masterCsv: masterCsvPath = '',
        masterJson: masterJsonPath = '',
        masterOptions: masterOptionsJson = '[]',
        masterLevels: masterLevelsJson = '{}',
        datasets: datasetsJson = '[]',
        activeDataset: activeDatasetAttr = ''
    } = body.dataset || {};

    const datasetUtils = (() => {
        function normalizeDatasetSources(rawSources) {
            if (!Array.isArray(rawSources)) {
                return [];
            }
            const result = [];
            rawSources.forEach((source, index) => {
                if (!source || typeof source !== 'object') {
                    return;
                }
                const csv = typeof source.csv === 'string' ? source.csv.trim() : '';
                if (!csv) {
                    return;
                }
                const imgDir = typeof source.imgDir === 'string' ? source.imgDir.trim() : '';
                const label = typeof source.label === 'string' ? source.label.trim() : '';
                const folder = typeof source.folder === 'string' ? source.folder.trim() : '';
                const sourceIndex = Number.isFinite(source.index) ? Number(source.index) : index;
                result.push({
                    label,
                    csv,
                    imgDir,
                    folder,
                    index: sourceIndex
                });
            });
            return result;
        }

        function normalizeDatasetEntry(entry, index) {
            if (entry == null) {
                return null;
            }

            let label = '';
            let csv = '';
            let imgDir = '';
            let folder = '';
            let kind = '';
            let sources = [];

            if (typeof entry === 'string') {
                csv = entry;
            } else if (Array.isArray(entry)) {
                if (entry.length > 0) {
                    csv = entry[0];
                }
                if (entry.length > 1) {
                    imgDir = entry[1];
                }
                if (entry.length > 2) {
                    label = entry[2];
                }
            } else if (typeof entry === 'object') {
                label = entry.label ?? entry.name ?? '';
                csv = entry.csv ?? entry.results ?? entry.results_csv ?? entry.resultsCsv ?? '';
                imgDir = entry.imgDir ?? entry.img_dir ?? entry.imageDir ?? entry.image_dir ?? entry.images ?? '';
                folder = entry.folder ?? '';
                kind = typeof entry.kind === 'string' ? entry.kind.trim() : typeof entry.type === 'string' ? entry.type.trim() : '';
                if (!kind && entry.merged === true) {
                    kind = 'merged';
                }
                const rawSources = entry.sources ?? entry.merge ?? entry.mergeSources ?? entry.children ?? null;
                sources = normalizeDatasetSources(rawSources);
            } else {
                csv = String(entry);
            }

            label = typeof label === 'string' ? label.trim() : '';
            csv = typeof csv === 'string' ? csv.trim() : '';
            imgDir = typeof imgDir === 'string' ? imgDir.trim() : '';
            folder = typeof folder === 'string' ? folder.trim() : '';
            kind = typeof kind === 'string' ? kind.trim().toLowerCase() : '';

            const hasCsv = Boolean(csv);
            const acceptsEmptyCsv = kind === 'merged' && sources.length > 0;
            if (!hasCsv && !acceptsEmptyCsv) {
                return null;
            }

            return {
                label,
                csv,
                imgDir,
                folder,
                index,
                kind,
                sources
            };
        }

        function parseDatasets(jsonText) {
            if (!jsonText) {
                return [];
            }
            try {
                const parsed = JSON.parse(jsonText);
                if (!Array.isArray(parsed)) {
                    return [];
                }
                return parsed
                    .map((entry, entryIndex) => normalizeDatasetEntry(entry, entryIndex))
                    .filter((entry) => {
                        if (!entry) {
                            return false;
                        }
                        if (entry.csv) {
                            return true;
                        }
                        return entry.kind === 'merged' && Array.isArray(entry.sources) && entry.sources.length > 0;
                    });
            } catch (error) {
                console.warn('dataset listの解析に失敗しました:', error);
                return [];
            }
        }

        function parseDatasetIndex(value, length) {
            const total = Number.isFinite(length) ? Number(length) : 0;
            if (!total) {
                return -1;
            }
            const parsed = Number.parseInt(value, 10);
            if (Number.isNaN(parsed)) {
                return 0;
            }
            if (parsed < 0) {
                return 0;
            }
            if (parsed >= total) {
                return total - 1;
            }
            return parsed;
        }

        function cloneDatasetSources(list) {
            if (!Array.isArray(list)) {
                return [];
            }
            return list.map((source) => ({
                label: source && typeof source.label === 'string' ? source.label : '',
                csv: source && typeof source.csv === 'string' ? source.csv : '',
                imgDir: source && typeof source.imgDir === 'string' ? source.imgDir : '',
                folder: source && typeof source.folder === 'string' ? source.folder : '',
                index: source && Number.isFinite(source.index) ? Number(source.index) : 0
            }));
        }

        function areSourcesEqual(left, right) {
            const a = Array.isArray(left) ? left : [];
            const b = Array.isArray(right) ? right : [];
            if (a.length !== b.length) {
                return false;
            }
            for (let i = 0; i < a.length; i += 1) {
                const leftEntry = a[i] || {};
                const rightEntry = b[i] || {};
                if ((leftEntry.csv || '') !== (rightEntry.csv || '')) {
                    return false;
                }
                if ((leftEntry.imgDir || '') !== (rightEntry.imgDir || '')) {
                    return false;
                }
                if ((leftEntry.label || '') !== (rightEntry.label || '')) {
                    return false;
                }
                if ((leftEntry.folder || '') !== (rightEntry.folder || '')) {
                    return false;
                }
            }
            return true;
        }

        function resolveDatasetState(dataset) {
            if (!dataset) {
                return {
                    label: '',
                    folder: '',
                    kind: '',
                    csvPath: '',
                    imageDir: '',
                    sources: []
                };
            }
            const label = dataset.label || '';
            const folder = dataset.folder || '';
            const kind = dataset.kind || '';
            const sources = cloneDatasetSources(dataset.sources);
            const isMerged = kind === 'merged' && sources.length > 0;
            const csvPath = isMerged ? dataset.csv || 'merged-dataset.csv' : dataset.csv || '';
            const imageDir = isMerged ? '' : dataset.imgDir || '';
            return {
                label,
                folder,
                kind,
                csvPath,
                imageDir,
                sources
            };
        }

        return {
            parseDatasets,
            parseDatasetIndex,
            cloneDatasetSources,
            areSourcesEqual,
            resolveDatasetState
        };
    })();

    const domUtils = (() => {
        function setHidden(element, hidden) {
            if (!element || !element.classList) {
                return;
            }
            element.classList.toggle('hidden', Boolean(hidden));
        }

        function clearChildren(element) {
            if (!element) {
                return;
            }
            element.textContent = '';
        }

        function updateStatusElement(element, message, options = {}) {
            if (!element) {
                return;
            }

            const { isError = false, display = 'block', errorClass = 'error' } = options;
            element.textContent = message || '';
            if (element.classList && errorClass) {
                element.classList.toggle(errorClass, Boolean(isError));
            }
            if (element.style) {
                element.style.display = message ? display : 'none';
            }
        }

        function applyInlineStyles(element, styles) {
            if (!element || !styles || typeof styles !== 'object') {
                return;
            }
            Object.keys(styles).forEach((key) => {
                const value = styles[key];
                if (value != null) {
                    element.style[key] = value;
                }
            });
        }

        function ensureElement(current, options = {}) {
            const {
                selector = '',
                id = '',
                tagName = 'div',
                classNames = [],
                create
            } = options;

            let element = current || null;

            const resolveCandidate = () => {
                if (selector) {
                    const foundBySelector = document.querySelector(selector);
                    if (foundBySelector) {
                        return foundBySelector;
                    }
                }
                if (id) {
                    const foundById = document.getElementById(id);
                    if (foundById) {
                        return foundById;
                    }
                }
                return null;
            };

            if (!element || !element.isConnected) {
                const candidate = resolveCandidate();
                if (candidate) {
                    element = candidate;
                }
            }

            if (!element) {
                element = typeof create === 'function' ? create() : document.createElement(tagName);
            }

            if (id && !element.id) {
                element.id = id;
            }

            if (element.classList) {
                classNames
                    .filter((className) => typeof className === 'string' && className.length > 0)
                    .forEach((className) => {
                        element.classList.add(className);
                    });
            }

            return element;
        }

        return {
            setHidden,
            clearChildren,
            updateStatusElement,
            applyInlineStyles,
            ensureElement
        };
    })();

    const {
        parseDatasets,
        parseDatasetIndex,
        cloneDatasetSources,
        areSourcesEqual,
        resolveDatasetState
    } = datasetUtils;

    const {
        setHidden: setElementHidden,
        clearChildren: clearElementChildren,
        updateStatusElement,
        applyInlineStyles: applyInlineStylesToElement,
        ensureElement: ensureDomElement
    } = domUtils;

    const datasets = parseDatasets(datasetsJson);
    const activeDatasetIndex = parseDatasetIndex(activeDatasetAttr, datasets.length);
    const preloadedMasterLevels = parseMasterLevels(masterLevelsJson);
    const hasPreloadedMasterLevels = preloadedMasterLevels instanceof Map && preloadedMasterLevels.size > 0;

    const dom = {
        gallery: document.getElementById('gallery'),
        datasetSelector: document.getElementById('dataset-selector'),
        datasetSelect: document.getElementById('dataset-select'),
        galleryStatus: document.getElementById('gallery-status'),
        searchInput: document.getElementById('search-input'),
        filterSelect: document.getElementById('filter-status'),
        colorFilter: document.getElementById('filter-color'),
        showDuplicatesToggle: document.getElementById('show-duplicates'),
        showOcrToggle: document.getElementById('show-ocr'),
        lightbox: document.getElementById('lightbox'),
        lightboxImg: document.querySelector('#lightbox img'),
        lightboxClose: document.getElementById('lightbox-close'),
        downloadCsvButton: document.getElementById('download-csv'),
        uploadCsvButton: document.getElementById('upload-csv'),
        uploadCsvInput: document.getElementById('upload-csv-input'),
        storageStatus: document.getElementById('storage-status'),
        summary: document.getElementById('gallery-summary')
    };

    if (dom.uploadCsvButton) {
        dom.uploadCsvButton.disabled = true;
        dom.uploadCsvButton.title = 'ローカルCSVのインポートは無効化されています';
    }

    if (!dom.gallery) {
        return;
    }

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
            dataset.sources = cloneDatasetSources(next.sources);
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

    const stateStore = createStateStore({
        datasets: Array.isArray(datasets) ? datasets.slice() : [],
        activeDatasetIndex: activeDatasetIndex,
        labelSymbols: parseLabelSymbols(labelSymbolsJson),
        imageDir: imageDir || '.',
        csvPath: initialCsvPath,
        masterCsvPath: masterCsvPath || '',
        masterJsonPath: masterJsonPath || '',
        masterOptions: parseMasterOptions(masterOptionsJson),
        masterLevels: preloadedMasterLevels,
        masterLevelsLoaded: hasPreloadedMasterLevels
    });
    const recordUtils = (() => {
        function ensureRecords(recordsOrProvider) {
            if (typeof recordsOrProvider === 'function') {
                return ensureRecords(recordsOrProvider());
            }
            return Array.isArray(recordsOrProvider) ? recordsOrProvider : [];
        }

        function getRecordByIndex(recordsOrProvider, index) {
            const records = ensureRecords(recordsOrProvider);
            if (Number.isNaN(index) || index < 0 || index >= records.length) {
                return null;
            }
            const record = records[index];
            return record && typeof record === 'object' ? record : null;
        }

        function updateRecordField(recordsOrProvider, recordIndex, key, value) {
            const record = getRecordByIndex(recordsOrProvider, recordIndex);
            if (!record) {
                return false;
            }
            if (value) {
                if (record[key] === value) {
                    return false;
                }
                record[key] = value;
                return true;
            }
            if (Object.prototype.hasOwnProperty.call(record, key)) {
                delete record[key];
                return true;
            }
            return false;
        }

        function createFlagManager(recordsOrProvider, key, truthyTokens) {
            const normalizedTokens = new Set(
                (truthyTokens || []).map((token) => (token || '').toString().toLowerCase())
            );

            const normalize = (value) => {
                if (value === true) {
                    return true;
                }
                if (value === false || value == null) {
                    return false;
                }
                if (typeof value === 'number') {
                    return value === 1;
                }
                if (typeof value === 'string') {
                    const text = value.trim().toLowerCase();
                    return normalizedTokens.has(text);
                }
                return false;
            };

            const isSet = (record) => {
                if (!record || typeof record !== 'object') {
                    return false;
                }
                return normalize(record[key]);
            };

            const set = (recordIndex, nextState) => {
                const record = getRecordByIndex(recordsOrProvider, recordIndex);
                if (!record) {
                    return false;
                }
                if (nextState) {
                    if (isSet(record)) {
                        return false;
                    }
                    record[key] = true;
                    return true;
                }
                if (Object.prototype.hasOwnProperty.call(record, key)) {
                    delete record[key];
                    return true;
                }
                return false;
            };

            return { normalize, isSet, set };
        }

        return { getRecordByIndex, updateRecordField, createFlagManager };
    })();

    if (typeof window !== 'undefined') {
        window.galleryRecordUtils = recordUtils;
    }

    const { core: state, dataset: datasetState } = stateStore.getState();

    function getRecordByIndex(index) {
        return recordUtils.getRecordByIndex(state.records, index);
    }

    function resolveItemElement(element) {
        if (!element) {
            return null;
        }
        if (element.classList && element.classList.contains('item')) {
            return element;
        }
        return element.closest ? element.closest('.item') : null;
    }

    function getItemContext(element) {
        const item = resolveItemElement(element);
        if (!item) {
            return null;
        }
        const recordIndex = Number(item.dataset.recordIndex);
        const record = getRecordByIndex(recordIndex);
        if (!record) {
            return null;
        }
        return { item, recordIndex, record };
    }

    const duplicateFlags = recordUtils.createFlagManager(
        () => state.records,
        DUPLICATE_KEY,
        ['true', '1', 'yes', 'duplicate']
    );
    const favoriteFlags = recordUtils.createFlagManager(
        () => state.records,
        FAVORITE_KEY,
        ['true', '1', 'yes', 'favorite']
    );

    function updateRecordField(recordIndex, key, value) {
        return recordUtils.updateRecordField(state.records, recordIndex, key, value);
    }

    function resolveCsvSavePath(csvPath) {
        if (!csvPath) {
            return '';
        }
        const trimmed = csvPath.trim();
        if (!trimmed) {
            return '';
        }
        try {
            const resolved = new URL(trimmed, window.location.href);
            const basePath = window.location.pathname.replace(/[^/]+$/, '');
            let relative = decodeURIComponent(resolved.pathname || '');
            if (basePath && relative.startsWith(basePath)) {
                relative = relative.slice(basePath.length);
            }
            if (!relative) {
                relative = trimmed;
            }
            return relative.replace(/^\/+/, '');
        } catch (error) {
            console.warn('CSVパスの解決に失敗しました:', error);
            return trimmed.replace(/^\/+/, '');
        }
    }

    const duplicates = createDuplicateManager(() => state.csvPath);

    const storage = createOpfsManager(() => state.records);

    function clampDatasetIndex(index) {
        return stateStore.clampIndex(index);
    }

    function getCurrentDataset() {
        if (!datasetState.list.length) {
            return null;
        }
        const index = clampDatasetIndex(datasetState.activeIndex);
        if (index < 0) {
            return null;
        }
        return datasetState.list[index] || null;
    }

    function prepareInitialDataset() {
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
    }

    function setupDatasetSelector() {
        if (!dom.datasetSelector || !dom.datasetSelect) {
            return;
        }
        if (!datasetState.list.length) {
            setElementHidden(dom.datasetSelector, true);
            clearElementChildren(dom.datasetSelect);
            return;
        }

        clearElementChildren(dom.datasetSelect);
        datasetState.list.forEach((dataset, index) => {
            const option = document.createElement('option');
            option.value = String(index);
            option.textContent = datasetOptionLabel(dataset, index);
            dom.datasetSelect.appendChild(option);
        });
        setElementHidden(dom.datasetSelector, false);
        const currentIndex = clampDatasetIndex(datasetState.activeIndex);
        dom.datasetSelect.value = String(currentIndex);
        dom.datasetSelect.title = datasetOptionLabel(getCurrentDataset(), currentIndex);
    }

    function updateDatasetIndicator() {
        if (!dom.datasetSelector || !dom.datasetSelect) {
            return;
        }
        if (!datasetState.list.length) {
            setElementHidden(dom.datasetSelector, true);
            return;
        }
        const currentIndex = clampDatasetIndex(datasetState.activeIndex);
        setElementHidden(dom.datasetSelector, false);
        dom.datasetSelect.value = String(currentIndex);
        dom.datasetSelect.title = datasetOptionLabel(getCurrentDataset(), currentIndex);
    }

    async function switchDataset(index, options = {}) {
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

        updateDatasetIndicator();

        if (!shouldReload) {
            return;
        }

        clearElementChildren(dom.gallery);
        state.records = [];
        state.items = [];

        await loadInitialData();
    }

    const SUMMARY_INLINE_STYLE = {
        textAlign: 'center',
        color: '#333',
        fontSize: '14px',
        margin: '0 auto 12px'
    };

    function ensureSummaryElement() {
        const summary = ensureDomElement(dom.summary, {
            selector: '#gallery-summary',
            id: 'gallery-summary',
            tagName: 'p',
            classNames: ['gallery-summary']
        });

        applyInlineStylesToElement(summary, {
            ...SUMMARY_INLINE_STYLE,
            width: '100%'
        });

        if (!summary.parentNode) {
            const reference = dom.galleryStatus && dom.galleryStatus.parentNode ? dom.galleryStatus : dom.gallery;
            if (reference && reference.parentNode) {
                reference.parentNode.insertBefore(summary, reference);
            } else {
                document.body.insertBefore(summary, document.body.firstChild || null);
            }
        }

        dom.summary = summary;
        return summary;
    }

    function parseLabelSymbols(jsonText) {
        try {
            const parsed = JSON.parse(jsonText || '[]');
            if (Array.isArray(parsed) && parsed.length) {
                return parsed
                    .map((symbol) => (symbol == null ? '' : String(symbol)))
                    .filter((symbol) => symbol !== '')
                    .slice();
            }
        } catch (error) {
            console.warn('label symbolsの解析に失敗しました:', error);
        }
        return ['①', '②', '③'];
    }

    function applyDatasetState(descriptor) {
        stateStore.updateDescriptor(descriptor);
        updateSaveAvailability();
    }

    function updateSaveAvailability() {
        if (datasetState.kind === 'merged') {
            setStorageStatus('統合ビューは読み取り専用です。個別データセットを選択してください。', true);
        } else {
            setStorageStatus('変更は即座にCSVへ保存されます。', false);
        }
    }

    function datasetOptionLabel(dataset, index) {
        if (!dataset) {
            return `データセット ${index + 1}`;
        }
        const baseLabel = dataset.label || `データセット ${index + 1}`;
        const folder = dataset.folder || '';
        if (folder && folder !== baseLabel) {
            const suffix = `(${folder})`;
            if (!baseLabel.endsWith(suffix)) {
                return `${baseLabel} ${suffix}`;
            }
        }
        return baseLabel;
    }

    function showStatus(message, isError) {
        updateStatusElement(dom.galleryStatus, message, { isError, display: 'block' });
    }

    function clearStatus() {
        showStatus('', false);
    }

    function setStorageStatus(message, isError) {
        updateStatusElement(dom.storageStatus, message, { isError, display: 'inline' });
    }

    function updateSummary() {
        const summary = ensureSummaryElement();
        if (!summary) {
            return;
        }
        const items = state.items || [];
        const totalCount = items.length;
        let fullyConfirmedCount = 0;
        let pendingCount = 0;

        items.forEach((item) => {
            if (!item) {
                return;
            }
            const effects = Array.from(item.querySelectorAll('.effect'));
            if (!effects.length) {
                pendingCount += 1;
                return;
            }
            const slotStatuses = new Map();
            let hasPending = false;
            effects.forEach((effect) => {
                const status = normalizeStatus(effect.dataset.status);
                if (status === 'pending') {
                    hasPending = true;
                }
                const slot = Number(effect.dataset.slot);
                if (!Number.isNaN(slot)) {
                    slotStatuses.set(slot, status);
                }
            });
            if (hasPending) {
                pendingCount += 1;
            }
            const targetSlots = [1, 2, 3];
            const allSlotsPresent = targetSlots.every((slot) => slotStatuses.has(slot));
            if (allSlotsPresent) {
                const allReviewed = targetSlots.every((slot) => {
                    const status = slotStatuses.get(slot);
                    return status && status !== 'pending';
                });
                if (allReviewed) {
                    fullyConfirmedCount += 1;
                }
            }
        });

        const datasetName = datasetState.label || '';
        const prefix = datasetName ? `[${datasetName}] ` : '';
        const summaryText = `${prefix}全体 ${totalCount} 件 / 確認済み ${fullyConfirmedCount} 件 / 未レビュー ${pendingCount} 件`;
        summary.textContent = summaryText;
        summary.style.display = 'flex';
        summary.style.justifyContent = 'center';
        summary.style.textAlign = 'center';
    }

    function updateInputValueAttribute(input) {
        if (!input) {
            return;
        }
        const current = input.value == null ? '' : String(input.value);
        input.setAttribute('value', current);
    }

    function createElement(tag, className, text) {
        const element = document.createElement(tag);
        if (className) {
            element.className = className;
        }
        if (text != null) {
            element.textContent = text;
        }
        return element;
    }

    function sanitizeLevelList(values) {
        if (!Array.isArray(values)) {
            return [];
        }
        return values
            .map((value) => (value == null ? '' : String(value).trim()))
            .filter((value) => value !== '');
    }

    function normalizeLevelNumericValue(value) {
        if (value == null) {
            return null;
        }
        const text = String(value).trim();
        if (!text) {
            return null;
        }
        const normalized = text
            .replace(/[＋﹢]/g, '+')
            .replace(/[－﹣−]/g, '-')
            .replace(/\s+/g, '');
        const match = normalized.match(/^[+-]?\d+(?:\.\d+)?$/);
        if (!match) {
            return null;
        }
        const numeric = Number(normalized);
        return Number.isNaN(numeric) ? null : numeric;
    }

    function sortLevelsAscending(values) {
        if (!Array.isArray(values)) {
            return [];
        }
        return values.slice().sort((a, b) => {
            const textA = String(a).trim();
            const textB = String(b).trim();
            const numA = normalizeLevelNumericValue(textA);
            const numB = normalizeLevelNumericValue(textB);
            const hasNumA = numA != null;
            const hasNumB = numB != null;
            if (hasNumA && hasNumB) {
                if (numA !== numB) {
                    return numA - numB;
                }
                return textA.localeCompare(textB, 'ja');
            }
            if (hasNumA) {
                return -1;
            }
            if (hasNumB) {
                return 1;
            }
            return textA.localeCompare(textB, 'ja');
        });
    }

    function setCorrectionLevelCandidates(effect, candidates) {
        const sanitized = sanitizeLevelList(candidates);
        const sorted = sortLevelsAscending(sanitized);
        if (!effect) {
            return sorted;
        }
        const input = effect.querySelector ? effect.querySelector('.correction-input') : null;
        if (input) {
            input.dataset.levelCandidates = JSON.stringify(sorted);
        }
        return sorted;
    }

    function updateLevelInputAvailability(select, options) {
        if (!select) {
            return;
        }
        const hasUsableOption = Array.isArray(options) && options.some((value) => {
            if (value == null) {
                return false;
            }
            return String(value).trim() !== '';
        });
        select.disabled = !hasUsableOption;
        if (!hasUsableOption) {
            select.value = '';
        }
    }

    function getBaseLevelOptions(effect) {
        if (!effect) {
            return [];
        }
        const json = effect.dataset.levelOptionsBaseJson;
        if (json) {
            try {
                const parsed = JSON.parse(json);
                return sanitizeLevelList(parsed);
            } catch (error) {
                console.warn('レベル候補(base json)の解析に失敗しました:', error);
            }
        }
        const legacyBase = effect.dataset.levelOptionsBase;
        if (legacyBase != null) {
            return sanitizeLevelList(legacyBase.split('|'));
        }
        const display = effect.dataset.levelOptionsDisplay;
        if (display != null) {
            return sanitizeLevelList(display.split('|'));
        }
        return [];
    }

    function parseLevelOptions(raw) {
        if (raw == null) {
            return [];
        }
        if (Array.isArray(raw)) {
            return raw
                .map((entry) => (entry == null ? '' : String(entry).trim()))
                .filter((entry) => entry !== '');
        }
        const text = String(raw).trim();
        if (!text) {
            return [];
        }
        return text
            .split('|')
            .map((entry) => entry.trim())
            .filter((entry) => entry !== '');
    }

    function normalizeEffectName(value) {
        if (value == null) {
            return '';
        }
        return String(value).trim();
    }

    function effectKey(value) {
        const normalized = normalizeEffectName(value);
        return normalized ? normalized.toLowerCase() : '';
    }

    function parseLevelTokens(raw) {
        if (raw == null) {
            return [];
        }
        const text = String(raw).trim();
        if (!text) {
            return [];
        }
        const lower = text.toLowerCase();
        if (lower === 'false' || lower === 'no' || lower === 'none') {
            return [];
        }
        return text
            .split(',')
            .map((token) => token.trim())
            .filter((token) => token && token !== '-');
    }

    function parseMasterLevelsCsv(csvText) {
        const records = parseCsvRecords(csvText);
        const map = new Map();
        records.forEach((record) => {
            if (!record || typeof record !== 'object') {
                return;
            }
            const effectName = normalizeEffectName(
                record.EffectBase || record.effect || record.name || record.value
            );
            if (!effectName || effectName === '-') {
                return;
            }
            const levels = parseLevelTokens(record.Levels);
            if (!levels.length) {
                return;
            }
            const key = effectKey(effectName);
            const existing = map.get(key) || [];
            levels.forEach((level) => {
                const normalizedLevel = String(level).trim();
                if (!normalizedLevel) {
                    return;
                }
                const lower = normalizedLevel.toLowerCase();
                if (existing.some((value) => value.toLowerCase() === lower)) {
                    return;
                }
                existing.push(normalizedLevel);
            });
            if (existing.length) {
                map.set(key, existing);
            }
        });
        return map;
    }

    async function ensureMasterLevels() {
        if (state.masterLevelsLoaded) {
            return;
        }
        if (state.masterLevelsPromise) {
            await state.masterLevelsPromise;
            return;
        }
        state.masterLevelsPromise = (async () => {
            const csvPath = state.masterCsvPath;
            if (!csvPath) {
                state.masterLevels = null;
                state.masterLevelsLoaded = true;
                state.masterLevelsPromise = null;
                return;
            }
            try {
                const response = await fetch(csvPath, { cache: 'no-cache' });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                const csvText = await response.text();
                state.masterLevels = parseMasterLevelsCsv(csvText);
            } catch (error) {
                console.warn('レベル候補の読み込みに失敗しました:', error);
                state.masterLevels = null;
            } finally {
                state.masterLevelsLoaded = true;
                state.masterLevelsPromise = null;
            }
        })();
        await state.masterLevelsPromise;
    }

    function getMasterLevelOptions(effectName) {
        const key = effectKey(effectName);
        if (!key) {
            return null;
        }
        const map = state.masterLevels;
        if (!(map instanceof Map)) {
            return null;
        }
        const values = map.get(key);
        return Array.isArray(values) && values.length ? values.slice() : [];
    }

    function applyMasterLevelOptions(effect, select, effectName) {
        if (!effect || !select) {
            return;
        }

        const applyCandidates = (candidates, overrideBase = true) => {
            const sortedCandidates = setCorrectionLevelCandidates(effect, candidates);
            if (overrideBase) {
                effect.dataset.levelOptionsBaseJson = JSON.stringify(sortedCandidates);
                rebuildLevelSelectOptions(effect, select, sortedCandidates);
            } else {
                rebuildLevelSelectOptions(effect, select);
            }
        };

        const normalized = normalizeEffectName(effectName);
        if (!state.masterLevelsLoaded) {
            applyCandidates([], false);
            void ensureMasterLevels().then(() => {
                applyMasterLevelOptions(effect, select, normalized);
            });
            return;
        }

        if (!normalized) {
            applyCandidates([], false);
            return;
        }

        const options = getMasterLevelOptions(normalized);
        if (options && options.length) {
            applyCandidates(options);
        } else {
            applyCandidates([]);
        }
    }

    function parseMasterOptions(source) {
        let list = source;
        if (typeof source === 'string') {
            if (!source) {
                return [];
            }
            try {
                list = JSON.parse(source);
            } catch (error) {
                console.warn('master optionsの解析に失敗しました:', error);
                return [];
            }
        }

        if (!Array.isArray(list)) {
            return [];
        }

        return list
            .map((entry) => {
                if (entry == null) {
                    return '';
                }
                if (typeof entry === 'object') {
                    const raw =
                        entry.EffectBase || entry.effect || entry.name || entry.value || '';
                    return typeof raw === 'string' ? raw.trim() : '';
                }
                return String(entry).trim();
            })
            .filter((value) => value !== '');
    }


    function parseMasterLevels(source) {
        const map = new Map();
        if (!source) {
            return map;
        }
        let payload = source;
        if (typeof source === 'string') {
            const text = source.trim();
            if (!text) {
                return map;
            }
            try {
                payload = JSON.parse(text);
            } catch (error) {
                console.warn('master levelsの解析に失敗しました:', error);
                return map;
            }
        }

        if (!payload || typeof payload !== 'object') {
            return map;
        }
        const entries = Array.isArray(payload) ? payload : Object.entries(payload);
        const normalizeEntry = (entry) => {
            if (!entry) {
                return null;
            }
            if (Array.isArray(entry)) {
                return entry;
            }
            if (typeof entry === 'object' && 'key' in entry && 'value' in entry) {
                return [entry.key, entry.value];
            }
            return null;
        };
        entries.forEach((entry) => {
            let key;
            let value;
            if (Array.isArray(entry) && entry.length >= 2) {
                [key, value] = entry;
            } else {
                const normalizedEntry = normalizeEntry(entry);
                if (!normalizedEntry) {
                    return;
                }
                [key, value] = normalizedEntry;
            }
            const effect = effectKey(key);
            if (!effect) {
                return;
            }
            const list = Array.isArray(value) ? value : [value];
            const sanitized = sanitizeLevelList(list);
            if (!sanitized.length) {
                return;
            }
            map.set(effect, sanitized);
        });
        return map;
    }

    function setupMasterOptions() {
        state.masterDatalistPrepared = false;
    }

    function ensureMasterDatalist() {
        if (state.masterDatalistPrepared) {
            return;
        }
        let datalist = document.getElementById(MASTER_DATALIST_ID);
        if (!datalist) {
            datalist = document.createElement('datalist');
            datalist.id = MASTER_DATALIST_ID;
            document.body.appendChild(datalist);
        } else {
            clearElementChildren(datalist);
        }

        state.masterOptions.forEach((value) => {
            const option = document.createElement('option');
            option.value = value;
            datalist.appendChild(option);
        });

        state.masterDatalistPrepared = true;
    }

    async function ensureMasterOptions() {
        if (state.masterOptions.length) {
            setupMasterOptions();
            ensureMasterDatalist();
            return;
        }

        if (!state.masterJsonPath) {
            setupMasterOptions();
            ensureMasterDatalist();
            return;
        }

        try {
            const response = await fetch(state.masterJsonPath, { cache: 'no-cache' });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            state.masterOptions = parseMasterOptions(data);
        } catch (error) {
            console.error('マスターデータの読み込みに失敗しました:', error);
            setStorageStatus(`マスターデータの読み込みに失敗しました: ${error.message || error}`, true);
            state.masterOptions = [];
        }

        setupMasterOptions();
        ensureMasterDatalist();
    }

    function csvFileName() {
        const baseName = storage.fileName || getFileName(state.csvPath) || 'results.csv';
        const converted = baseName.replace(/\.csv$/i, '_review.csv');
        if (converted !== baseName) {
            return converted;
        }
        if (!baseName) {
            return 'results_review.csv';
        }
        return `${baseName.replace(/\.csv$/i, '')}_review.csv`;
    }

    function joinPath(base, leaf) {
        if (!leaf) {
            return base || '';
        }
        if (!base) {
            return leaf;
        }
        const cleanBase = base.replace(/[\/]+$/, '');
        const cleanLeaf = leaf.replace(/^[\/]+/, '');
        return `${cleanBase}/${cleanLeaf}`;
    }

    function normalizeStatus(value) {
        const text = (value || '').toString().toLowerCase();
        if (text === 'pass') {
            return 'pass';
        }
        if (text === 'corrected') {
            return 'corrected';
        }
        if (text === 'fail') {
            return 'pending';
        }
        return 'pending';
    }

    function statusLabel(status) {
        if (status === 'pass') {
            return '確認済み';
        }
        if (status === 'corrected') {
            return '修正済み';
        }
        return '未レビュー';
    }

    function ensureLabelCoverage(records) {
        let maxSlot = state.labelSymbols.length;
        records.forEach((record) => {
            if (!record || typeof record !== 'object') {
                return;
            }
            Object.keys(record).forEach((key) => {
                const match = /^Effect(\d+)$/.exec(key);
                if (match) {
                    const slot = parseInt(match[1], 10);
                    if (!Number.isNaN(slot) && slot > maxSlot) {
                        maxSlot = slot;
                    }
                }
            });
        });
        for (let slot = state.labelSymbols.length + 1; slot <= maxSlot; slot += 1) {
            state.labelSymbols.push(`Slot ${slot}`);
        }
    }

    function includeDuplicatesNow() {
        return Boolean(dom.showDuplicatesToggle && dom.showDuplicatesToggle.checked);
    }

    function ocrToggleState() {
        return Boolean(dom.showOcrToggle && dom.showOcrToggle.checked);
    }

    function setOcrVisibility(show) {
        state.showOcr = Boolean(show);
        if (dom.showOcrToggle) {
            dom.showOcrToggle.checked = state.showOcr;
        }
        if (!dom.gallery) {
            return;
        }
        dom.gallery.querySelectorAll('.raw, .prediction').forEach((element) => {
            element.style.display = state.showOcr ? '' : 'none';
        });
    }

    function buildGallery() {
        const includeDuplicates = includeDuplicatesNow();
        clearElementChildren(dom.gallery);
        state.items = [];

        const fragment = document.createDocumentFragment();

        const visibleTotal = state.records.reduce((count, currentRecord) => {
            if (!currentRecord || typeof currentRecord !== 'object') {
                return count;
            }
            return isRecordDuplicate(currentRecord) ? count : count + 1;
        }, 0);
        let visibleCounter = 0;

        state.records.forEach((record, index) => {
            const duplicateRecord = isRecordDuplicate(record);
            if (!duplicateRecord) {
                visibleCounter += 1;
            }
            if (duplicateRecord && !includeDuplicates) {
                return;
            }
            const effectiveIndex = duplicateRecord ? (visibleCounter > 0 ? visibleCounter : 0) : visibleCounter;
            const item = createItem(record, index, effectiveIndex, visibleTotal);
            if (item) {
                fragment.appendChild(item);
                state.items.push(item);
            }
        });

        if (fragment.childNodes.length) {
            dom.gallery.appendChild(fragment);
        }

        updateSummary();
        setOcrVisibility(ocrToggleState());

        if (!state.items.length) {
            showStatus('表示できる結果がありません。', false);
            return;
        }
        clearStatus();
        applyFilters();
    }

    function createItem(record, recordIndex, visibleIndex, visibleTotal) {
        const context = createItemContext(record, recordIndex, visibleIndex, visibleTotal);
        if (!context) {
            return null;
        }

        const { item, leftColumn, rightColumn } = createItemStructure(context);

        const imageElement = createItemImage(context);
        if (imageElement) {
            leftColumn.appendChild(imageElement);
            bindImage(imageElement);
        }

        leftColumn.appendChild(createItemControls(context));

        const hasEffect = appendItemEffects(context, rightColumn);
        if (!hasEffect) {
            rightColumn.appendChild(createNoEffectPlaceholder());
        }

        syncDuplicateState(item);
        syncFavoriteState(item);
        syncItemColorState(item);
        refreshItemCaches(item);
        return item;
    }

    function createItemContext(record, recordIndex, visibleIndex, visibleTotal) {
        if (!record || typeof record !== 'object') {
            return null;
        }
        const imageName = record.Image == null ? '' : String(record.Image);
        const baseImageName = record.BaseImage == null ? '' : String(record.BaseImage);
        const displayName = baseImageName || getFileName(imageName) || imageName;
        const isMerged = datasetState.kind === 'merged';
        const datasetName = isMerged ? (record.Dataset == null ? '' : String(record.Dataset)) : '';
        const datasetFolder = isMerged ? (record.DatasetFolder == null ? '' : String(record.DatasetFolder)) : '';
        const imagePath = joinPath(state.imageDir, imageName);

        return {
            record,
            recordIndex,
            visibleIndex,
            visibleTotal,
            imageName,
            baseImageName,
            displayName,
            datasetName,
            datasetFolder,
            imagePath
        };
    }

    function createItemStructure(context) {
        const item = document.createElement('div');
        item.className = 'item';
        item.dataset.image = context.imageName.toLowerCase();
        item.dataset.imageName = context.imageName;
        item.dataset.recordIndex = String(context.recordIndex);
        if (context.baseImageName) {
            item.dataset.baseImage = context.baseImageName.toLowerCase();
        }
        if (context.datasetName) {
            item.dataset.datasetLabel = context.datasetName.toLowerCase();
        }

        const leftColumn = createElement('div', 'item-left');
        const rightColumn = createElement('div', 'item-right');
        item.appendChild(leftColumn);
        item.appendChild(rightColumn);

        return { item, leftColumn, rightColumn };
    }

    function createItemImage(context) {
        const img = createElement('img');
        img.src = context.imagePath;
        img.alt = context.displayName || context.imageName;
        img.dataset.full = context.imagePath;
        img.tabIndex = 0;
        return img;
    }

    function createItemControls(context) {
        const controls = createElement('div', 'item-controls');
        controls.appendChild(createDuplicateButton(context.imageName));
        controls.appendChild(createFavoriteButton(context.imageName));
        controls.appendChild(createColorControls(context.recordIndex));
        controls.appendChild(createItemMetaInfo(context));
        return controls;
    }

    function createDuplicateButton(imageName) {
        const button = createElement('button', 'duplicate-toggle');
        button.type = 'button';
        button.dataset.image = imageName;
        button.dataset.action = 'toggle-duplicate';
        button.setAttribute('aria-pressed', 'false');
        return button;
    }

    function createFavoriteButton(imageName) {
        const button = createElement('button', 'favorite-toggle', 'お気に入り');
        button.type = 'button';
        button.dataset.image = imageName;
        button.dataset.action = 'toggle-favorite';
        button.setAttribute('aria-pressed', 'false');
        return button;
    }

    function createColorControls(recordIndex) {
        const container = createElement('div', 'item-color-controls');
        const label = createElement('label', 'item-color-label', '色');
        const selectId = `item-color-${recordIndex}`;
        label.setAttribute('for', selectId);

        const select = createElement('select', 'item-color-select');
        select.id = selectId;
        select.dataset.action = 'set-item-color';
        select.dataset.recordIndex = String(recordIndex);

        const emptyOption = createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = 'なし';
        select.appendChild(emptyOption);

        ITEM_COLOR_OPTIONS.forEach((option) => {
            const colorOption = createElement('option');
            colorOption.value = option.key;
            colorOption.textContent = option.label;
            select.appendChild(colorOption);
        });

        container.appendChild(label);
        container.appendChild(select);
        return container;
    }

    function createItemMetaInfo(context) {
        const metaInfo = createElement('div', 'item-meta');
        metaInfo.appendChild(createItemPosition(context.visibleIndex, context.visibleTotal));

        if (datasetState.kind === 'merged' && context.datasetName) {
            const datasetBadge = createElement('span', 'dataset-label', context.datasetName);
            const badgeTitle = context.datasetFolder
                ? `${context.datasetName} (${context.datasetFolder})`
                : context.datasetName;
            datasetBadge.setAttribute('title', badgeTitle);
            metaInfo.appendChild(datasetBadge);
        }

        const filenameText = context.displayName || context.imageName;
        const filename = createElement('span', 'filename', filenameText);
        filename.setAttribute('title', context.imageName || filenameText || '');
        metaInfo.appendChild(filename);

        return metaInfo;
    }

    function createItemPosition(visibleIndex, visibleTotal) {
        if (visibleTotal <= 0) {
            return createElement('span', 'item-position', '- / 0');
        }
        let displayIndex = visibleIndex;
        if (displayIndex <= 0) {
            displayIndex = 1;
        } else if (displayIndex > visibleTotal) {
            displayIndex = visibleTotal;
        }
        return createElement('span', 'item-position', `${displayIndex} / ${visibleTotal}`);
    }

    function appendItemEffects(context, rightColumn) {
        let hasEffect = false;
        state.labelSymbols.forEach((symbol, index) => {
            const effect = createEffect(
                context.record,
                index + 1,
                symbol || `Slot ${index + 1}`,
                context.imageName,
                context.recordIndex
            );
            if (effect) {
                rightColumn.appendChild(effect);
                hasEffect = true;
            }
        });
        return hasEffect;
    }

    function createNoEffectPlaceholder() {
        return createElement('p', 'no-effect', '効果情報がありません。');
    }
    function normalizeDuplicateFlag(value) {
        return duplicateFlags.normalize(value);
    }

    function isRecordDuplicate(record) {
        return duplicateFlags.isSet(record);
    }

    function setRecordDuplicate(recordIndex, isDuplicate) {
        return duplicateFlags.set(recordIndex, isDuplicate);
    }

    function normalizeFavoriteFlag(value) {
        return favoriteFlags.normalize(value);
    }

    function isRecordFavorite(record) {
        return favoriteFlags.isSet(record);
    }

    function setRecordFavorite(recordIndex, isFavorite) {
        return favoriteFlags.set(recordIndex, isFavorite);
    }

    function normalizeItemColor(value) {
        const text = (value || '').toString().trim().toLowerCase();
        const option = ITEM_COLOR_OPTIONS.find((entry) => entry.key === text);
        return option ? option.key : '';
    }

    function setRecordItemColor(recordIndex, colorKey) {
        const record = getRecordByIndex(recordIndex);
        if (!record) {
            return false;
        }
        const normalized = normalizeItemColor(colorKey);
        if (normalized) {
            if (record.ItemColor === normalized) {
                return false;
            }
            record.ItemColor = normalized;
            return true;
        }
        if (Object.prototype.hasOwnProperty.call(record, 'ItemColor')) {
            delete record.ItemColor;
            return true;
        }
        return false;
    }

    function applyItemColor(item, colorKey) {
        if (!item) {
            return;
        }
        const normalized = normalizeItemColor(colorKey);
        ITEM_COLOR_OPTIONS.forEach((entry) => {
            item.classList.remove(entry.className);
        });
        if (normalized) {
            const option = ITEM_COLOR_OPTIONS.find((entry) => entry.key === normalized);
            if (option) {
                item.classList.add(option.className);
            }
            item.dataset.itemColor = normalized;
        } else {
            delete item.dataset.itemColor;
        }
        const select = item.querySelector('.item-color-select');
        if (select) {
            const value = normalized || '';
            select.value = value;
            select.classList.remove('option-red', 'option-yellow', 'option-green', 'option-blue', 'option-none');
            select.classList.add(value ? `option-${value}` : 'option-none');
        }
    }

    function syncItemColorState(item) {
        if (!item) {
            return;
        }
        const context = getItemContext(item);
        const colorKey = context ? context.record.ItemColor : '';
        applyItemColor(item, colorKey);
    }

    function updateFavoriteVisuals(item, isFavorite) {
        if (!item) {
            return;
        }
        const button = item.querySelector('.favorite-toggle');
        const active = Boolean(isFavorite);
        item.dataset.favorite = active ? 'true' : 'false';
        item.classList.toggle('is-favorite', active);
        if (button) {
            button.textContent = active ? '★ お気に入り' : '☆ お気に入り';
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', active ? 'true' : 'false');
        }
    }

    function syncFavoriteState(item) {
        if (!item) {
            return;
        }
        const context = getItemContext(item);
        const isFavorite = context ? isRecordFavorite(context.record) : false;
        updateFavoriteVisuals(item, isFavorite);
    }

    function updateDuplicateVisuals(item, isDuplicate) {
        if (!item) {
            return;
        }
        const value = Boolean(isDuplicate);
        item.dataset.duplicate = value ? 'true' : 'false';
        item.classList.toggle('is-duplicate', value);

        const button = item.querySelector('.duplicate-toggle');
        if (button) {
            button.textContent = value ? '重複を解除' : '重複として隠す';
            button.setAttribute('aria-pressed', value ? 'true' : 'false');
        }

    }

    function syncDuplicateState(item) {
        if (!item) {
            return;
        }
        const context = getItemContext(item);
        const imageName = item.dataset.imageName || '';
        const recordDuplicate = context ? isRecordDuplicate(context.record) : false;
        const storedDuplicate = imageName ? duplicates.has(imageName) : false;
        const isDuplicate = recordDuplicate || storedDuplicate;
        if (imageName) {
            duplicates.set(imageName, isDuplicate);
        }
        updateDuplicateVisuals(item, isDuplicate);
    }

    function refreshItemCaches(item) {
        if (!item) {
            return;
        }
        const tokens = [];
        const statuses = new Set();

        const imageToken = item.dataset.image;
        if (imageToken) {
            tokens.push(imageToken);
        }
        const baseImageToken = item.dataset.baseImage;
        if (baseImageToken) {
            tokens.push(baseImageToken);
        }
        const datasetToken = item.dataset.datasetLabel;
        if (datasetToken) {
            tokens.push(datasetToken);
        }

        item.querySelectorAll('.effect').forEach((effect) => {
            const { pred = '', raw = '', correction = '', status = 'pending', level = '', levelOptions = '', levelCorrection = '' } = effect.dataset;
            if (pred) {
                tokens.push(pred);
            }
            if (raw) {
                tokens.push(raw);
            }
            if (correction) {
                tokens.push(correction);
            }
            if (level) {
                tokens.push(level);
            }
            if (levelCorrection) {
                tokens.push(levelCorrection);
            }
            if (levelOptions) {
                tokens.push(levelOptions);
            }
            statuses.add(status || 'pending');
        });

        const combined = tokens
            .filter((token) => token && token.trim() !== '')
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();

        item.dataset.searchCache = combined ? ` ${combined} ` : '';

        const statusValues = statuses.size ? Array.from(statuses) : ['pending'];
        item.dataset.statusCache = `|${statusValues.join('|')}|`;
        const effectStates = [];
        item.querySelectorAll('.effect').forEach((effect) => {
            const status = effect.dataset.status || 'pending';
            effectStates.push(status);
        });
        item.dataset.effectStates = effectStates.join(',');
    }

    function createEffect(record, slot, symbol, imageName, recordIndex) {
        const context = createEffectContext(record, slot, symbol, imageName, recordIndex);
        if (!context) {
            return null;
        }

        const effect = createEffectElement(context);

        const predictionLine = createEffectPredictionLine(context);
        effect.appendChild(predictionLine);
        updateLevelBadge(effect);

        const rawLine = createEffectRawLine(context);
        effect.appendChild(rawLine);

        const decisionElements = createEffectDecision(effect, context);
        effect.appendChild(decisionElements.container);

        applyMasterLevelOptions(effect, decisionElements.levelInput, context.effectNameForLevels);

        if (datasetState.kind === 'merged') {
            decisionElements.passButton.disabled = true;
            decisionElements.correctionInput.disabled = true;
            decisionElements.levelInput.disabled = true;
        }

        updateEffectStatus(effect, context.statusValue);

        decisionElements.correctionInput.addEventListener('change', correctionChangeHandler(effect, decisionElements.correctionInput));

        const onLevelChange = levelChangeHandler(effect, decisionElements.levelInput);
        decisionElements.levelInput.addEventListener('change', onLevelChange);

        return effect;
    }

    function createEffectContext(record, slot, symbol, imageName, recordIndex) {
        if (!record || typeof record !== 'object') {
            return null;
        }

        const prediction = record[`Effect${slot}`];
        const raw = record[`RawText${slot}`];
        const score = record[`Effect${slot}Score`];

        const predictionText = prediction == null ? '' : String(prediction);
        const rawText = raw == null ? '' : String(raw);
        const hasScoreValue = score != null && !Number.isNaN(Number(score));
        if (!predictionText && !rawText && !hasScoreValue) {
            return null;
        }

        const numericScore = Number(score);
        const hasFiniteScore = Number.isFinite(numericScore);
        const scoreDisplay = hasFiniteScore ? `${numericScore.toFixed(1)}%` : '--';
        const ocrDisplay = rawText || '--';

        const levelValueRaw = record[`Effect${slot}Level`];
        const levelValue = levelValueRaw == null ? '' : String(levelValueRaw).trim();
        const levelOptionsRaw = record[`Effect${slot}LevelOptions`];
        const levelOptions = parseLevelOptions(levelOptionsRaw);
        const levelOptionsLower = levelOptions.map((value) => (value == null ? '' : String(value).toLowerCase()));
        const levelCorrectionKey = `Effect${slot}LevelCorrection`;
        const levelCorrectionRaw = record[levelCorrectionKey];
        const levelCorrection = levelCorrectionRaw == null ? '' : String(levelCorrectionRaw).trim();
        const levelSuppressedRaw = record[`Effect${slot}LevelSuppressed`];
        const levelSuppressed =
            typeof levelSuppressedRaw === 'boolean'
                ? levelSuppressedRaw
                : String(levelSuppressedRaw || '').trim().toLowerCase() === 'true';
        const preserveOriginalLevel = !levelSuppressed;
        const levelOptionsDisplay = levelOptions.join('|');
        const displayLevel = levelCorrection || (preserveOriginalLevel ? levelValue : '');

        const correctionKey = `Effect${slot}Correction`;
        const correctionValue = record[correctionKey] == null ? '' : String(record[correctionKey]);

        const initialStatus = normalizeStatus(record[`Effect${slot}Status`]);
        const statusValue = correctionValue && initialStatus !== 'pass' ? 'corrected' : initialStatus;

        const predictionLower = predictionText.toLowerCase();
        const rawLower = rawText.toLowerCase();
        const levelValueLower = levelValue ? levelValue.toLowerCase() : '';
        const displayLevelLower = displayLevel ? displayLevel.toLowerCase() : '';
        const levelCorrectionLower = levelCorrection ? levelCorrection.toLowerCase() : '';
        const correctionValueLower = correctionValue.toLowerCase();

        const normalizedImageName = imageName == null ? '' : String(imageName);
        const imageNameLower = normalizedImageName.toLowerCase();

        return {
            record,
            slot,
            symbol,
            imageName: normalizedImageName,
            imageNameLower,
            recordIndex,
            predictionText,
            predictionLower,
            rawText,
            rawLower,
            numericScore,
            hasFiniteScore,
            scoreDisplay,
            ocrDisplay,
            statusValue,
            levelValue,
            levelValueLower,
            levelOptions,
            levelOptionsLower,
            levelOptionsDisplay,
            levelCorrection,
            levelCorrectionLower,
            preserveOriginalLevel,
            displayLevel,
            displayLevelLower,
            correctionValue,
            correctionValueLower,
            effectNameForLevels: levelCorrection || correctionValue || predictionText,
            lowConfidence: hasFiniteScore && numericScore < 60
        };
    }

    function createEffectElement(context) {
        const effect = createElement('div', 'effect');
        effect.dataset.slot = String(context.slot);
        effect.dataset.image = context.imageNameLower;
        effect.dataset.pred = context.predictionLower;
        effect.dataset.predictionValue = context.predictionText;
        effect.dataset.raw = context.rawLower;
        effect.dataset.recordIndex = String(context.recordIndex);
        effect.dataset.preserveOriginalLevel = context.preserveOriginalLevel ? 'true' : 'false';
        effect.dataset.level = context.displayLevelLower;
        effect.dataset.levelOriginal = context.levelValueLower;
        effect.dataset.levelOriginalValue = context.levelValue;
        effect.dataset.levelOptions = context.levelOptionsLower.join('|');
        effect.dataset.levelOptionsDisplay = context.levelOptionsDisplay;
        effect.dataset.levelOptionsBase = context.levelOptionsDisplay;
        effect.dataset.levelCorrection = context.levelCorrectionLower;
        effect.dataset.levelCorrectionValue = context.levelCorrection;
        effect.dataset.correction = context.correctionValueLower;
        if (context.lowConfidence) {
            effect.classList.add('low-confidence');
            effect.dataset.lowConfidence = 'true';
        }
        return effect;
    }

    function createEffectPredictionLine(context) {
        const predictionLine = createElement('div', 'prediction');
        const predictionLabel = createElement('span', 'prediction-label', '推定:');
        const predictionValueNode = createElement('span', 'prediction-value', context.predictionText || '--');
        predictionLine.appendChild(predictionLabel);
        predictionLine.appendChild(predictionValueNode);
        predictionLine.style.display = state.showOcr ? '' : 'none';
        return predictionLine;
    }

    function createEffectRawLine(context) {
        const rawLine = createElement('div', 'raw', `OCR: ${context.ocrDisplay} / 一致度 ${context.scoreDisplay}`);
        rawLine.style.display = state.showOcr ? '' : 'none';
        return rawLine;
    }

    function createEffectDecision(effect, context) {
        const decision = createElement('div', 'decision');
        const decisionRow = createElement('div', 'decision-row');
        const passButton = createElement('button', 'review-button pass', '合致');
        passButton.type = 'button';
        passButton.dataset.value = 'pass';

        const correctionInput = createCorrectionInput(context.correctionValue, context.predictionText);

        const levelInput = document.createElement('select');
        levelInput.id = `level-input-${context.recordIndex}-${context.slot}`;
        levelInput.className = 'level-input';

        populateEffectLevelOptions(effect, levelInput, context);

        decisionRow.appendChild(passButton);
        decisionRow.appendChild(correctionInput);
        decisionRow.appendChild(levelInput);
        decision.appendChild(decisionRow);

        return {
            container: decision,
            passButton,
            correctionInput,
            levelInput
        };
    }

    function populateEffectLevelOptions(effect, levelInput, context) {
        const sortedLevelChoices = buildEffectLevelChoices(context);

        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = '';
        levelInput.appendChild(emptyOption);

        sortedLevelChoices.forEach((option) => {
            const optionNode = document.createElement('option');
            optionNode.value = option;
            optionNode.textContent = option;
            levelInput.appendChild(optionNode);
        });

        effect.dataset.levelOptionsBaseJson = JSON.stringify(sortedLevelChoices);

        const initialLevelValue = context.levelCorrection || (context.preserveOriginalLevel ? context.levelValue : '') || '';
        levelInput.value = initialLevelValue;
        updateLevelInputAvailability(levelInput, sortedLevelChoices);
    }

    function buildEffectLevelChoices(context) {
        const levelChoices = [];
        const seenLevels = new Set();

        const pushLevelChoice = (value) => {
            if (value == null) {
                return;
            }
            const text = String(value).trim();
            if (!text) {
                return;
            }
            const key = text.toLowerCase();
            if (seenLevels.has(key)) {
                return;
            }
            seenLevels.add(key);
            levelChoices.push(text);
        };

        const originalLevelLower = context.levelValueLower;
        let originalInOptions = false;
        context.levelOptions.forEach((option) => {
            const text = option == null ? '' : String(option).trim();
            if (!text) {
                return;
            }
            const lower = text.toLowerCase();
            if (originalLevelLower && lower === originalLevelLower) {
                originalInOptions = true;
                if (context.preserveOriginalLevel) {
                    pushLevelChoice(text);
                }
                return;
            }
            pushLevelChoice(text);
        });

        if (context.levelValue) {
            if (context.preserveOriginalLevel) {
                pushLevelChoice(context.levelValue);
            } else if (originalInOptions && levelChoices.length) {
                pushLevelChoice(context.levelValue);
            }
        }

        pushLevelChoice(context.levelCorrection);

        return sortLevelsAscending(levelChoices);
    }

    function updateLevelBadge(effect) {
        const predictionLine = effect.querySelector('.prediction');
        if (!predictionLine) {
            return;
        }
        let badge = predictionLine.querySelector('.level-badge');
        const originalValue = effect.dataset.levelOriginalValue || '';
        const preserveOriginalLevel = effect.dataset.preserveOriginalLevel !== 'false';
        const correctionValue = effect.dataset.levelCorrectionValue || '';
        const optionsDisplay = effect.dataset.levelOptionsDisplay || '';
        const optionsList = optionsDisplay ? optionsDisplay.split('|').map((value) => value.trim()).filter((value) => value) : [];

        if (correctionValue) {
            if (!badge) {
                badge = createElement('span', 'level-badge level-badge--corrected');
                predictionLine.appendChild(badge);
            }
            badge.textContent = correctionValue;
            badge.className = 'level-badge level-badge--corrected';
            badge.title = originalValue ? `OCR: ${originalValue}` : '';
            return;
        }

        if (originalValue && preserveOriginalLevel) {
            if (!badge) {
                badge = createElement('span', 'level-badge');
                predictionLine.appendChild(badge);
            }
            badge.textContent = originalValue;
            badge.className = 'level-badge';
            badge.title = '';
            return;
        }

        if (optionsList.length) {
            const primaryOption = optionsList[0];
            if (!badge) {
                badge = createElement('span', 'level-badge level-badge--missing');
                predictionLine.appendChild(badge);
            }
            badge.textContent = primaryOption;
            badge.className = 'level-badge level-badge--missing';
            if (optionsList.length > 1) {
                const tooltipText = optionsList.join(' / ');
                badge.title = `候補: ${tooltipText}`;
            } else {
                badge.title = `候補: ${primaryOption}`;
            }
            return;
        }

        if (badge) {
            badge.remove();
        }
    }


    function updateEffectStatus(effect, status) {
        const normalized = normalizeStatus(status);
        effect.dataset.status = normalized;
        effect.classList.toggle('pending', normalized === 'pending');

        const indicator = effect.querySelector('.status-indicator');
        if (indicator) {
            indicator.textContent = statusLabel(normalized);
        }

        effect.querySelectorAll('.review-button').forEach((button) => {
            button.classList.toggle('selected', button.dataset.value === normalized);
        });
    }

    function createCorrectionInput(selectedValue, fallbackValue) {
        const input = document.createElement('input');
        input.type = 'search';
        input.className = 'correction-input';
        if (state.masterOptions.length) {
            input.setAttribute('list', MASTER_DATALIST_ID);
            input.placeholder = 'master_relicsから選択';
        } else {
            input.placeholder = 'マスターデータ未設定';
            input.disabled = true;
        }
        const initialValue = selectedValue || fallbackValue || '';
        input.value = initialValue;
        updateInputValueAttribute(input);
        return input;
    }

    function rebuildLevelSelectOptions(effect, select, baseOptionsOverride, extraOptions) {
        if (!effect || !select) {
            return;
        }

        const previousValue = select.value == null ? '' : String(select.value);
        const baseOptions = Array.isArray(baseOptionsOverride)
            ? sanitizeLevelList(baseOptionsOverride)
            : getBaseLevelOptions(effect);

        const extrasSource = Array.isArray(extraOptions)
            ? extraOptions
            : extraOptions == null
                ? []
                : [extraOptions];
        const extras = sanitizeLevelList(extrasSource);

        const finalValues = [];
        const seen = new Set();

        const pushOption = (value) => {
            if (value == null) {
                return;
            }
            const text = String(value).trim();
            if (!text) {
                return;
            }
            const lower = text.toLowerCase();
            if (seen.has(lower)) {
                return;
            }
            seen.add(lower);
            finalValues.push(text);
        };

        const originalValue = effect.dataset.levelOriginalValue || '';
        const preserveOriginalLevel = effect.dataset.preserveOriginalLevel !== 'false';
        const originalLower = originalValue ? originalValue.toLowerCase() : '';
        let originalEncountered = false;

        const addCandidate = (candidate) => {
            const text = candidate == null ? '' : String(candidate).trim();
            if (!text) {
                return;
            }
            const lower = text.toLowerCase();
            if (originalLower && lower === originalLower) {
                originalEncountered = true;
                if (preserveOriginalLevel) {
                    pushOption(text);
                }
                return;
            }
            pushOption(text);
        };

        baseOptions.forEach(addCandidate);
        extras.forEach(addCandidate);

        if (originalValue) {
            if (preserveOriginalLevel) {
                pushOption(originalValue);
            } else if (originalEncountered && finalValues.length) {
                pushOption(originalValue);
            }
        }

        const levelCorrectionValue = effect.dataset.levelCorrectionValue || '';
        pushOption(levelCorrectionValue);

        const sortedFinalValues = sortLevelsAscending(finalValues);

        select.textContent = '';

        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = '';
        select.appendChild(emptyOption);

        sortedFinalValues.forEach((value) => {
            const optionNode = document.createElement('option');
            optionNode.value = value;
            optionNode.textContent = value;
            select.appendChild(optionNode);
        });

        const candidates = [previousValue, levelCorrectionValue, originalValue, baseOptions[0], extras[0]];
        let applied = '';
        for (let index = 0; index < candidates.length; index += 1) {
            const candidate = candidates[index];
            if (!candidate) {
                continue;
            }
            const lower = candidate.toLowerCase();
            if (sortedFinalValues.some((value) => value.toLowerCase() === lower)) {
                applied = candidate;
                break;
            }
        }
        if (!applied && sortedFinalValues.length) {
            applied = sortedFinalValues[0];
        }
        select.value = applied || '';
        updateLevelInputAvailability(select, sortedFinalValues);

        effect.dataset.levelOptionsDisplay = sortedFinalValues.join('|');
        effect.dataset.levelOptions = sortedFinalValues.map((value) => value.toLowerCase()).join('|');
        updateLevelBadge(effect);
    }

    function correctionChangeHandler(effect, input) {
        return () => {
            updateInputValueAttribute(input);
            const selected = input.value.trim();
            const indexes = getEffectIndexes(effect);
            if (!indexes) {
                return;
            }
            const nextStatus = selected ? 'corrected' : 'pending';
            const statusChanged = recordStatusChange(effect, nextStatus);
            const correctionChanged = updateRecordCorrection(indexes.recordIndex, indexes.slotIndex, selected);
            effect.dataset.correction = selected ? selected.toLowerCase() : '';
            effect.dataset.preserveOriginalLevel = selected ? 'false' : 'true';
            updateEffectStatus(effect, nextStatus);

            const suppressLevel = Boolean(selected);
            const suppressedChanged = updateRecordLevelSuppressed(indexes.recordIndex, indexes.slotIndex, suppressLevel);
            if (suppressLevel) {
                effect.dataset.levelOptionsBaseJson = JSON.stringify([]);
            } else {
                const baseString = effect.dataset.levelOptionsBase || '';
                const restored = baseString ? sanitizeLevelList(baseString.split('|')) : [];
                const restoredSorted = sortLevelsAscending(restored);
                effect.dataset.levelOptionsBaseJson = JSON.stringify(restoredSorted);
            }

            let levelCleared = false;
            const levelSelect = effect.querySelector('.level-input');
            if (levelSelect) {
                if (updateRecordLevelCorrection(indexes.recordIndex, indexes.slotIndex, '')) {
                    levelCleared = true;
                }
                effect.dataset.levelCorrection = '';
                effect.dataset.levelCorrectionValue = '';
                const originalLevelValue = effect.dataset.levelOriginalValue || '';
                const preserveOriginalLevel = effect.dataset.preserveOriginalLevel !== 'false';
                const effectiveLevel = preserveOriginalLevel ? originalLevelValue : '';
                effect.dataset.level = effectiveLevel ? effectiveLevel.toLowerCase() : '';
                levelSelect.value = '';
                updateLevelInputAvailability(levelSelect, []);
                applyMasterLevelOptions(effect, levelSelect, selected);
            }

            refreshItemCaches(effect.closest('.item'));
            if (!statusChanged && (correctionChanged || levelCleared || suppressedChanged)) {
                storage.scheduleSave();
            }
            applyFilters();
        };
    }
    function levelChangeHandler(effect, input) {
        return () => {
            const selected = input.value.trim();
            const previous = effect.dataset.levelCorrectionValue || '';
            if (selected === previous) {
                return;
            }
            const indexes = getEffectIndexes(effect);
            if (!indexes) {
                return;
            }

            const levelChanged = updateRecordLevelCorrection(indexes.recordIndex, indexes.slotIndex, selected);
            effect.dataset.levelCorrection = selected ? selected.toLowerCase() : '';
            effect.dataset.levelCorrectionValue = selected;

            const originalValue = effect.dataset.levelOriginalValue || '';
            const finalLevel = selected || originalValue;
            effect.dataset.level = finalLevel ? finalLevel.toLowerCase() : '';

            updateLevelBadge(effect);
            const item = effect.closest('.item');
            if (item) {
                refreshItemCaches(item);
            }

            const hasEffectCorrection = Boolean(effect.dataset.correction);
            const currentStatus = effect.dataset.status || 'pending';
            let nextStatus = currentStatus;
            if (selected) {
                nextStatus = 'corrected';
            } else if (!hasEffectCorrection && currentStatus === 'corrected') {
                nextStatus = 'pending';
            }

            let statusChanged = false;
            if (nextStatus !== currentStatus) {
                statusChanged = recordStatusChange(effect, nextStatus);
                if (statusChanged) {
                    updateEffectStatus(effect, nextStatus);
                }
            }

            if (!statusChanged && levelChanged) {
                storage.scheduleSave();
            }

            applyFilters();
        };
    }


    function getEffectIndexes(effect) {
        const recordIndex = Number(effect.dataset.recordIndex);
        const slotIndex = Number(effect.dataset.slot);
        if (Number.isNaN(recordIndex) || Number.isNaN(slotIndex)) {
            return null;
        }
        return { recordIndex, slotIndex };
    }

    function updateRecordCorrection(recordIndex, slotIndex, value) {
        if (Number.isNaN(recordIndex) || Number.isNaN(slotIndex)) {
            return false;
        }
        const key = `Effect${slotIndex}Correction`;
        return updateRecordField(recordIndex, key, value);
    }
    function updateRecordLevelCorrection(recordIndex, slotIndex, value) {
        if (Number.isNaN(recordIndex) || Number.isNaN(slotIndex)) {
            return false;
        }
        const key = `Effect${slotIndex}LevelCorrection`;
        return updateRecordField(recordIndex, key, value);
    }
    function updateRecordLevelSuppressed(recordIndex, slotIndex, suppressed) {
        if (Number.isNaN(recordIndex) || Number.isNaN(slotIndex)) {
            return false;
        }
        const key = `Effect${slotIndex}LevelSuppressed`;
        const normalized = suppressed ? 'true' : '';
        return updateRecordField(recordIndex, key, normalized);
    }

    function recordStatusChange(effect, status) {
        const indexes = getEffectIndexes(effect);
        if (!indexes) {
            return false;
        }
        const record = getRecordByIndex(indexes.recordIndex);
        if (!record) {
            return false;
        }
        const key = `Effect${indexes.slotIndex}Status`;
        if (record[key] !== status) {
            record[key] = status;
            storage.scheduleSave();
            return true;
        }
        return false;
    }

    function applyFilters() {
        const term = (dom.searchInput && dom.searchInput.value ? dom.searchInput.value : '').trim().toLowerCase();
        const filter = dom.filterSelect ? dom.filterSelect.value : 'all';
        const colorFilter = dom.colorFilter ? dom.colorFilter.value : 'all';
        const includePending = filter === 'with-pending';
        const resolvedOnly = filter === 'resolved';
        const favoriteOnly = filter === 'favorite';
        const showDuplicates = includeDuplicatesNow();

        state.items.forEach((item) => {
            if (!item) {
                return;
            }
            if (item.dataset.duplicate === 'true' && !showDuplicates) {
                item.style.display = 'none';
                return;
            }

            const cache = item.dataset.searchCache || '';
            const matchesSearch = !term || (cache && cache.includes(term));

            let matchesFilter = true;

if (filter !== 'all') {
    const statuses = item.dataset.statusCache || '';
    if (resolvedOnly) {
        const effectStates = (item.dataset.effectStates || '').split(',').filter(Boolean);
        matchesFilter = effectStates.length >= 3 && effectStates.every((stateValue, idx) => {
            if (idx < 3) {
                return stateValue === 'pass' || stateValue === 'corrected';
            }
            return true;
        });
    } else if (includePending) {
        matchesFilter = statuses.includes('|pending|');
    } else if (favoriteOnly) {
        matchesFilter = item.dataset.favorite === 'true';
    }
}

if (matchesFilter && colorFilter !== 'all') {
    const itemColor = normalizeItemColor(item.dataset.itemColor || '');
    if (colorFilter === 'none') {
        matchesFilter = itemColor === '';
    } else {
        matchesFilter = itemColor === colorFilter;
    }
}

item.style.display = matchesSearch && matchesFilter ? '' : 'none';
        });
        updateSummary();
    }

    function handleDuplicateToggle(button) {
        if (!button) {
            return;
        }
        const context = getItemContext(button);
        if (!context) {
            return;
        }
        const { item, record, recordIndex } = context;
        const imageName = button.dataset.image || item.dataset.imageName || '';
        const currentState = isRecordDuplicate(record) || item.dataset.duplicate === 'true';
        const nextState = !currentState;
        if (imageName) {
            button.dataset.image = imageName;
            duplicates.set(imageName, nextState);
        }
        const recordChanged = setRecordDuplicate(recordIndex, nextState);
        updateDuplicateVisuals(item, nextState);
        if (recordChanged) {
            storage.scheduleSave();
        }
        buildGallery();
    }

    function handleFavoriteToggle(button) {
        if (!button) {
            return;
        }
        const context = getItemContext(button);
        if (!context) {
            return;
        }
        const { item, record, recordIndex } = context;
        const nextState = !isRecordFavorite(record);
        const recordChanged = setRecordFavorite(recordIndex, nextState);
        updateFavoriteVisuals(item, nextState);
        if (recordChanged) {
            storage.scheduleSave();
        }
        applyFilters();
    }

    function handleItemColorToggle(button) {
        if (!button) {
            return;
        }
        const context = getItemContext(button);
        if (!context) {
            return;
        }
        const { item, record, recordIndex } = context;
        const targetColor = (button.value || '').trim().toLowerCase();
        const currentColor = normalizeItemColor(record.ItemColor);
        const nextColor = currentColor === targetColor ? '' : targetColor;
        const recordChanged = setRecordItemColor(recordIndex, nextColor);
        if (recordChanged) {
            storage.scheduleSave();
        }
        applyItemColor(item, nextColor);
        applyFilters();
    }

    function bindImage(img) {
        if (!img) {
            return;
        }
        img.addEventListener('click', () => openLightbox(img));
        img.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ' || event.keyCode === 13 || event.keyCode === 32) {
                event.preventDefault();
                openLightbox(img);
            }
        });
    }

    function openLightbox(img) {
        if (!img || !dom.lightbox || !dom.lightboxImg) {
            return;
        }
        dom.lightboxImg.src = img.dataset.full || img.src;
        dom.lightboxImg.alt = img.alt || '';
        dom.lightbox.classList.add('show');
        dom.lightbox.setAttribute('aria-hidden', 'false');
        if (dom.lightboxClose) {
            dom.lightboxClose.focus();
        }
    }

    function closeLightbox() {
        if (!dom.lightbox || !dom.lightboxImg) {
            return;
        }
        dom.lightbox.classList.remove('show');
        dom.lightbox.setAttribute('aria-hidden', 'true');
        dom.lightboxImg.src = '';
        dom.lightboxImg.alt = '';
    }

    function collectCsvHeaders(records) {
        const seen = new Set();
        records.forEach((record) => {
            if (record && typeof record === 'object') {
                Object.keys(record).forEach((key) => {
                    if (!seen.has(key)) {
                        seen.add(key);
                    }
                });
            }
        });

        if (!seen.size) {
            return [];
        }

        const headers = [];
        if (seen.delete('Image')) {
            headers.push('Image');
        }
        headers.push(...Array.from(seen).sort());
        return headers;
    }

    function csvEscape(value) {
        const text = value == null ? '' : String(value);
        return '"' + text.replace(/"/g, '""') + '"';
    }

    function generateCsv(records) {
        const headers = collectCsvHeaders(records);
        if (!headers.length) {
            return '';
        }

        const lines = [];
        lines.push(headers.map(csvEscape).join(','));

        records.forEach((record) => {
            const row = headers.map((key) => {
                if (!record || typeof record !== 'object') {
                    return csvEscape('');
                }
                const value = Object.prototype.hasOwnProperty.call(record, key) ? record[key] : '';
                return csvEscape(value);
            });
            lines.push(row.join(','));
        });

        return lines.join('\n');
    }

    function parseCsvRows(text) {
        const rows = [];
        if (!text) {
            return rows;
        }
        const sanitized = String(text).replace(/^\uFEFF/, '');
        const normalized = sanitized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        let field = '';
        let row = [];
        let inQuotes = false;

        for (let index = 0; index < normalized.length; index += 1) {
            const char = normalized[index];
            if (inQuotes) {
                if (char === '"') {
                    const nextChar = normalized[index + 1];
                    if (nextChar === '"') {
                        field += '"';
                        index += 1;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    field += char;
                }
                continue;
            }

            if (char === '"') {
                inQuotes = true;
                continue;
            }

            if (char === ',') {
                row.push(field);
                field = '';
                continue;
            }

            if (char === '\n') {
                row.push(field);
                rows.push(row);
                row = [];
                field = '';
                continue;
            }

            field += char;
        }

        if (inQuotes) {
            row.push(field);
            rows.push(row);
        } else if (field !== '' || row.length) {
            row.push(field);
            rows.push(row);
        }

        return rows;
    }

    function parseCsvRecords(text) {
        const rows = parseCsvRows(text);
        if (!rows.length) {
            return [];
        }

        const headers = rows[0].map((header) => {
            if (header == null) {
                return '';
            }
            return String(header).trim();
        });

        const records = [];
        for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
            const cells = rows[rowIndex];
            if (!cells || cells.every((cell) => {
                const value = cell == null ? '' : String(cell).trim();
                return value === '';
            })) {
                continue;
            }

            const record = {};
            headers.forEach((header, columnIndex) => {
                if (!header) {
                    return;
                }
                const value = columnIndex < cells.length ? cells[columnIndex] : '';
                record[header] = value == null ? '' : value;
            });
            records.push(record);
        }

        return records;
    }

    async function handleCsvImportFile(file) {
        if (!file) {
            return;
        }
        setStorageStatus('ローカルファイルからのインポートは無効化されています。結果フォルダ内のCSVを直接編集してください。', true);
        return;
        if (dom.uploadCsvInput) {
            dom.uploadCsvInput.value = '';
        }
    }

    async function loadMergedRecords(sources) {
        const combined = [];
        const list = Array.isArray(sources) ? sources : [];
        for (let index = 0; index < list.length; index += 1) {
            const source = list[index];
            if (!source || typeof source !== 'object') {
                continue;
            }
            const csvPath = typeof source.csv === 'string' ? source.csv : '';
            if (!csvPath) {
                continue;
            }
            const datasetLabel = source.label || source.folder || `Dataset ${index + 1}`;
            const datasetFolder = source.folder || '';
            const imageDir = source.imgDir || '';
            let csvText = '';
            try {
                const response = await fetch(csvPath, { cache: 'no-cache' });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                csvText = await response.text();
            } catch (error) {
                throw new Error(`${datasetLabel} のCSV取得に失敗しました: ${error.message || error}`);
            }
            const records = parseCsvRecords(csvText);
            if (!records.length) {
                continue;
            }
            records.forEach((record) => {
                if (!record || typeof record !== 'object') {
                    return;
                }
                const rawImage = record.Image == null ? '' : String(record.Image);
                const hasPath = /[\/]/.test(rawImage);
                const baseImage = rawImage ? rawImage.split(/[\/]/).pop() || rawImage : '';
                const normalizedImage = rawImage
                    ? hasPath
                        ? rawImage
                        : imageDir
                            ? joinPath(imageDir, rawImage)
                            : rawImage
                    : '';
                record.BaseImage = baseImage;
                record.Image = normalizedImage;
                record.Dataset = datasetLabel;
                record.DatasetFolder = datasetFolder;
                record.DatasetIndex = index;
                record.SourceCsv = csvPath;
                record.SourceImageDir = imageDir;
            });
            combined.push(...records);
        }
        return combined;
    }

    async function loadInitialData() {
        const preferredName = getFileName(state.csvPath) || 'results.csv';

        try {
            const text = await storage.tryLoad(preferredName);
            if (text) {
                loadRecordsArray(JSON.parse(text));
                clearStatus();
                setStorageStatus('ブラウザから読み込みました。', false);
                return;
            }
        } catch (error) {
            console.warn('ブラウザからの読み込みに失敗しました:', error);
        }

        const isMerged = datasetState.kind === 'merged' && Array.isArray(datasetState.sources) && datasetState.sources.length > 0;
        if (isMerged) {
            try {
                showStatus('読み込み中...', false);
                const mergedRecords = await loadMergedRecords(datasetState.sources);
                loadRecordsArray(mergedRecords);
                clearStatus();
        } catch (error) {
            console.error('結合データセットのロードに失敗しました:', error);
            showStatus(`結合データセットの読み込みに失敗しました: ${error.message || error}`, true);
        }
        return;
        }

        if (!state.csvPath) {
            showStatus('CSVファイルのパスが指定されていません。', true);
            return;
        }

        try {
            showStatus('読み込み中...', false);
            const response = await fetch(state.csvPath, { cache: 'no-cache' });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const csvText = await response.text();
            const records = parseCsvRecords(csvText);
            loadRecordsArray(records);
            clearStatus();
        } catch (error) {
            console.error('CSVのロードに失敗しました:', error);
            showStatus(`データの読み込みに失敗しました: ${error.message || error}. CSV出力の配置を確認してください。`, true);
        }
    }

    function loadRecordsArray(data) {
        const records = Array.isArray(data) ? data.slice() : data && typeof data === 'object' ? [data] : [];
        ensureLabelCoverage(records);
        state.records = records;
        duplicates.prepare();
        buildGallery();
    }

    function attachEventHandlers() {
        if (dom.datasetSelect) {
            dom.datasetSelect.addEventListener('change', (event) => {
                const value = Number.parseInt(event.target.value, 10);
                if (Number.isNaN(value)) {
                    return;
                }
                void switchDataset(value);
            });
        }

        dom.gallery.addEventListener('click', (event) => {
            const duplicateButton = event.target.closest('.duplicate-toggle');
            if (duplicateButton) {
                event.preventDefault();
                handleDuplicateToggle(duplicateButton);
                return;
            }

            const favoriteButton = event.target.closest('.favorite-toggle');
            if (favoriteButton) {
                event.preventDefault();
                handleFavoriteToggle(favoriteButton);
                return;
            }

            const colorSelect = event.target.closest('.item-color-select');
            if (colorSelect) {
                event.preventDefault();
                handleItemColorToggle(colorSelect);
                return;
            }

            const button = event.target.closest('.review-button');
            if (!button) {
                return;
            }
            const effect = button.closest('.effect');
            if (!effect) {
                return;
            }
            const item = effect.closest('.item');
            const current = effect.dataset.status || 'pending';
            const targetValue = button.dataset.value || 'pass';
            const next = current === targetValue ? 'pending' : targetValue;
            updateEffectStatus(effect, next);
            const statusChanged = recordStatusChange(effect, next);
            if (next === 'pass') {
                const indexes = getEffectIndexes(effect);
                if (indexes) {
                    const correctionChanged = updateRecordCorrection(indexes.recordIndex, indexes.slotIndex, '');
                    let levelChanged = updateRecordLevelCorrection(indexes.recordIndex, indexes.slotIndex, '');
                    effect.dataset.correction = '';
                    effect.dataset.levelCorrection = '';
                    effect.dataset.levelCorrectionValue = '';
                    effect.dataset.preserveOriginalLevel = 'true';
                    const originalLevelValue = effect.dataset.levelOriginalValue || '';
                    effect.dataset.level = originalLevelValue ? originalLevelValue.toLowerCase() : '';

                    const baseString = effect.dataset.levelOptionsBase || '';
                    const restoredBase = baseString ? sanitizeLevelList(baseString.split('|')) : [];
                    const restoredBaseSorted = sortLevelsAscending(restoredBase);
                    effect.dataset.levelOptionsBaseJson = JSON.stringify(restoredBaseSorted);

                    const input = effect.querySelector('.correction-input');
                    if (input) {
                        const predictionDefault = effect.dataset.predictionValue || '';
                        const replacement = createCorrectionInput('', predictionDefault);
                        input.replaceWith(replacement);
                        replacement.addEventListener('change', correctionChangeHandler(effect, replacement));
                    }

                    const suppressRecordChanged = updateRecordLevelSuppressed(indexes.recordIndex, indexes.slotIndex, false);

                    const levelInput = effect.querySelector('.level-input');
                    if (levelInput) {
                        levelInput.value = '';
                        rebuildLevelSelectOptions(effect, levelInput);
                    }
                    setCorrectionLevelCandidates(effect, []);
                    updateLevelBadge(effect);

                    if (!statusChanged && (correctionChanged || levelChanged || suppressRecordChanged)) {
                        storage.scheduleSave();
                    }
                }
            }
            if (item) {
                refreshItemCaches(item);
            }
            applyFilters();
        });

        if (dom.searchInput) {
            dom.searchInput.addEventListener('input', applyFilters);
        }
        if (dom.filterSelect) {
            dom.filterSelect.addEventListener('change', applyFilters);
        }
        if (dom.colorFilter) {
            dom.colorFilter.addEventListener('change', applyFilters);
        }
        if (dom.showDuplicatesToggle) {
            dom.showDuplicatesToggle.addEventListener('change', () => {
                buildGallery();
            });
        }
        if (dom.showOcrToggle) {
            dom.showOcrToggle.addEventListener('change', () => {
                setOcrVisibility(ocrToggleState());
            });
        }
        if (dom.downloadCsvButton) {
            dom.downloadCsvButton.addEventListener('click', handleCsvExport);
        }
        if (dom.uploadCsvButton && dom.uploadCsvInput) {
            dom.uploadCsvButton.addEventListener('click', () => {
                dom.uploadCsvInput.value = '';
                dom.uploadCsvInput.click();
            });
            dom.uploadCsvInput.addEventListener('change', () => {
                const files = dom.uploadCsvInput.files || [];
                const file = files.length ? files[0] : null;
                if (file) {
                    void handleCsvImportFile(file);
                }
            });
        }
        if (dom.lightboxClose) {
            dom.lightboxClose.addEventListener('click', closeLightbox);
        }
        if (dom.lightbox) {
            dom.lightbox.addEventListener('click', (event) => {
                if (event.target === dom.lightbox) {
                    closeLightbox();
                }
            });
        }
        document.addEventListener('keydown', (event) => {
            if ((event.key === 'Escape' || event.keyCode === 27) && dom.lightbox && dom.lightbox.classList.contains('show')) {
                closeLightbox();
            }
        });
    }

    function getFileName(path) {
        if (!path) {
            return '';
        }
        const parts = path.split(/[\\/]/);
        return parts[parts.length - 1] || '';
    }

    function handleCsvExport() {
        if (!state.records.length) {
            setStorageStatus('エクスポート可能なデータがありません。', true);
            return;
        }

        const csvText = generateCsv(state.records);
        if (!csvText) {
            setStorageStatus('エクスポート失敗: CSVを生成できませんでした。', true);
            return;
        }

        const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = csvFileName();
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setStorageStatus('CSVをダウンロードしました。', false);
    }

    function createDuplicateManager(getResultsPath) {
        const storagePrefix = 'relic-gallery-duplicates:';
        let cache = new Map();
        let loadedKey = '';
        let hasLoaded = false;

        function normalizeName(name) {
            return (name == null ? '' : String(name)).trim().toLowerCase();
        }

        function deriveBaseName() {
            const source = typeof getResultsPath === 'function' ? getResultsPath() : '';
            const text = source == null ? '' : String(source);
            if (!text) {
                return 'results.csv';
            }
            const parts = text.split(/[\\/]/).filter(Boolean);
            if (!parts.length) {
                return text || 'results.csv';
            }
            return parts[parts.length - 1];
        }

        function storageKey() {
            return `${storagePrefix}${deriveBaseName()}`;
        }

        function getStorage() {
            try {
                if (typeof window === 'undefined' || !window.localStorage) {
                    return null;
                }
                return window.localStorage;
            } catch (error) {
                console.warn('localStorageへのアクセスに失敗しました:', error);
                return null;
            }
        }

        function ensureLoaded() {
            const key = storageKey();
            if (hasLoaded && key === loadedKey) {
                return;
            }

            hasLoaded = true;
            loadedKey = key;
            cache = new Map();

            const storage = getStorage();
            if (!storage) {
                return;
            }

            try {
                const raw = storage.getItem(key);
                if (!raw) {
                    return;
                }
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    parsed.forEach((value) => {
                        if (typeof value === 'string' && value.trim()) {
                            const original = value.trim();
                            cache.set(normalizeName(original), original);
                        }
                    });
                }
            } catch (error) {
                console.warn('重複状態の読み込みに失敗しました:', error);
            }
        }

        function persist() {
            const storage = getStorage();
            if (!storage) {
                return;
            }
            const key = storageKey();
            try {
                const values = Array.from(cache.values()).sort((a, b) => a.localeCompare(b));
                storage.setItem(key, JSON.stringify(values));
            } catch (error) {
                console.warn('重複状態の保存に失敗しました:', error);
            }
        }

        function set(name, shouldMark) {
            if (!name) {
                return false;
            }
            ensureLoaded();
            const normalized = normalizeName(name);
            if (!normalized) {
                return false;
            }
            const original = (name == null ? '' : String(name)).trim();
            if (!original) {
                return false;
            }
            if (shouldMark) {
                const already = cache.has(normalized);
                cache.set(normalized, original);
                if (!already) {
                    persist();
                }
                return true;
            }
            const existed = cache.delete(normalized);
            if (existed) {
                persist();
            }
            return false;
        }

        function toggle(name) {
            if (!name) {
                return false;
            }
            ensureLoaded();
            const normalized = normalizeName(name);
            if (!normalized) {
                return false;
            }
            const original = (name == null ? '' : String(name)).trim();
            if (!original) {
                cache.delete(normalized);
                persist();
                return false;
            }
            if (cache.has(normalized)) {
                cache.delete(normalized);
                persist();
                return false;
            }
            cache.set(normalized, original);
            persist();
            return true;
        }

        function has(name) {
            if (!name) {
                return false;
            }
            ensureLoaded();
            return cache.has(normalizeName(name));
        }

        return {
            prepare: ensureLoaded,
            has,
            set,
            toggle
        };
    }

    function createOpfsManager(getData) {
        const managerState = {
            timer: null,
            saving: false,
            queued: false
        };

        function datasetEditable() {
            return datasetState.kind !== 'merged';
        }

        function collectRecords() {
            const data = typeof getData === 'function' ? getData() : [];
            return Array.isArray(data) ? data : [];
        }

        async function writeOnce() {
            if (!datasetEditable()) {
                return;
            }
            const csvPath = resolveCsvSavePath(state.csvPath);
            if (!csvPath) {
                setStorageStatus('保存先のCSVパスを解決できません。', true);
                return;
            }

            managerState.saving = true;
            managerState.queued = false;
            setStorageStatus('保存中...', false);

            try {
                const response = await fetch('/__viewer_api__/save', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        csvPath,
                        records: collectRecords(),
                        datasetLabel: datasetState.label || ''
                    })
                });

                if (!response.ok) {
                    const detail = await response.text();
                    throw new Error(detail || `HTTP ${response.status}`);
                }

                setStorageStatus(`保存しました ${new Date().toLocaleTimeString()}`, false);
            } catch (error) {
                console.error('CSV保存に失敗しました:', error);
                setStorageStatus(`保存失敗: ${error.message || error}`, true);
            } finally {
                managerState.saving = false;
                if (managerState.queued) {
                    managerState.queued = false;
                    void writeOnce();
                }
            }
        }

        function scheduleSave() {
            if (!datasetEditable()) {
                setStorageStatus('統合ビューでは保存できません。個別データセットを選択してください。', true);
                return;
            }
            if (managerState.saving) {
                managerState.queued = true;
                return;
            }
            if (managerState.timer) {
                clearTimeout(managerState.timer);
            }
            managerState.timer = setTimeout(() => {
                managerState.timer = null;
                void writeOnce();
            }, 250);
        }

        return {
            supported: true,
            usesOpfs: false,
            usesLocalBackup: false,
            get fileName() {
                return getFileName(state.csvPath);
            },
            async tryLoad() {
                return null;
            },
            async prepare() {
                return;
            },
            scheduleSave,
            async flushNow() {
                if (!datasetEditable()) {
                    return;
                }
                await writeOnce();
            }
        };
    }

    async function initialize() {
        attachEventHandlers();
        prepareInitialDataset();
        setupDatasetSelector();
        await ensureMasterLevels();
        await ensureMasterOptions();
        if (datasetState.list.length) {
            await switchDataset(datasetState.activeIndex, { forceReload: true });
        } else {
            await loadInitialData();
        }
    }

    void initialize();
})();

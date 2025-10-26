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

    const datasetUtilsFactory = window.galleryDatasetUtilsFactory || null;
    const datasetUtils =
        datasetUtilsFactory && typeof datasetUtilsFactory.createDatasetUtils === 'function'
            ? datasetUtilsFactory.createDatasetUtils()
            : (window.galleryDatasetUtils && typeof window.galleryDatasetUtils === 'object'
                  ? window.galleryDatasetUtils
                  : null);

    if (!datasetUtils) {
        throw new Error('gallery dataset utilities are not available');
    }

    const {
        parseDatasets,
        parseDatasetIndex,
        cloneDatasetSources,
        areSourcesEqual,
        resolveDatasetState
    } = datasetUtils;

    const domUtilsFactory = window.galleryDomUtilsFactory || null;
    const domUtilsInstance =
        (domUtilsFactory && typeof domUtilsFactory.createDomUtils === 'function'
            ? domUtilsFactory.createDomUtils({ document })
            : window.galleryDomUtils) || null;

    if (!domUtilsInstance) {
        throw new Error('gallery dom utilities are not available');
    }

    const {
        setHidden: setElementHidden,
        clearChildren: clearElementChildren,
        updateStatusElement,
        applyInlineStyles: applyInlineStylesToElement,
        ensureElement: ensureDomElement
    } = domUtilsInstance;

    if (
        typeof setElementHidden !== 'function' ||
        typeof clearElementChildren !== 'function' ||
        typeof updateStatusElement !== 'function' ||
        typeof applyInlineStylesToElement !== 'function' ||
        typeof ensureDomElement !== 'function'
    ) {
        throw new Error('gallery dom utilities are incomplete');
    }

    const dataUtils = window.galleryDataUtils || null;

    if (!dataUtils) {
        throw new Error('gallery data utilities are not available');
    }

    const {
        sanitizeLevelList,
        normalizeEffectName,
        effectKey,
        normalizeLevelNumericValue,
        sortLevelsAscending,
        parseLevelTokens,
        parseMasterOptions,
        parseMasterLevels,
        normalizeSuppressedLevels: normalizeSuppressedLevelsFromUtils
    } = dataUtils;

    const dataUtilsMissing = [
        ['sanitizeLevelList', sanitizeLevelList],
        ['normalizeEffectName', normalizeEffectName],
        ['effectKey', effectKey],
        ['normalizeLevelNumericValue', normalizeLevelNumericValue],
        ['sortLevelsAscending', sortLevelsAscending],
        ['parseLevelTokens', parseLevelTokens],
        ['parseMasterOptions', parseMasterOptions],
        ['parseMasterLevels', parseMasterLevels],
        ['normalizeSuppressedLevels', normalizeSuppressedLevelsFromUtils]
    ].filter(([, value]) => typeof value !== 'function');

    if (dataUtilsMissing.length) {
        const missingNames = dataUtilsMissing.map(([name]) => name).join(', ');
        throw new Error(`gallery data utilities are incomplete: missing ${missingNames}`);
    }

    const normalizeSuppressedRecords = (records) => normalizeSuppressedLevelsFromUtils(records);

    function normalizeStatus(value) {
        const text = (value || '').toString().trim().toLowerCase();
        if (text === 'pass') {
            return 'pass';
        }
        if (text === 'corrected') {
            return 'corrected';
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

    function parseMasterLevelsCsv(text) {
        const map = new Map();
        if (!text) {
            return map;
        }
        const records = parseCsvRecords(text);
        if (!Array.isArray(records)) {
            return map;
        }
        records.forEach((record) => {
            if (!record || typeof record !== 'object') {
                return;
            }
            const name =
                record.EffectBase ||
                record.effect ||
                record.Name ||
                record.name ||
                record.label ||
                '';
            const key = effectKey(name);
            if (!key) {
                return;
            }
            const levelsSource =
                record.Levels ||
                record.levels ||
                record.Values ||
                record.values ||
                record.options ||
                record.candidates ||
                '';
            const tokens = parseLevelTokens(levelsSource);
            const sanitized = sanitizeLevelList(tokens);
            if (!sanitized.length) {
                return;
            }
            const existing = map.get(key) || [];
            const merged = Array.from(new Set(existing.concat(sanitized)));
            if (merged.length) {
                map.set(key, sortLevelsAscending(merged));
            }
        });
        return map;
    }

    function setupMasterOptions() {
        const current = Array.isArray(state.masterOptions) ? state.masterOptions : [];
        const normalized = current
            .map((value) => normalizeEffectName(value))
            .filter((value) => value);
        const unique = Array.from(new Set(normalized));
        unique.sort((a, b) => a.localeCompare(b, 'ja'));
        stateApi.setMasterOptions(unique);
    }

    function ensureMasterDatalist() {
        if (typeof document === 'undefined') {
            return;
        }
        let datalist = document.getElementById(MASTER_DATALIST_ID);
        if (!datalist) {
            datalist = document.createElement('datalist');
            datalist.id = MASTER_DATALIST_ID;
            document.body.appendChild(datalist);
        }
        datalist.textContent = '';
        state.masterOptions.forEach((option) => {
            const optionNode = document.createElement('option');
            optionNode.value = option;
            datalist.appendChild(optionNode);
        });
        stateApi.markMasterDatalistPrepared(true);
    }

    async function ensureMasterOptions() {
        if (state.masterDatalistPrepared) {
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
            stateApi.setMasterOptions(parseMasterOptions(data));
        } catch (error) {
            console.error('マスターデータの読み込みに失敗しました:', error);
            setStorageStatus(`マスターデータの読み込みに失敗しました: ${error.message || error}`, true);
            stateApi.setMasterOptions([]);
        }
        setupMasterOptions();
        ensureMasterDatalist();
    }

    async function ensureMasterLevels() {
        if (state.masterLevelsLoaded) {
            return;
        }
        if (state.masterLevelsPromise) {
            await state.masterLevelsPromise;
            return;
        }

        const loader = (async () => {
            try {
                const csvPath = state.masterCsvPath;
                if (!csvPath) {
                    stateApi.setMasterLevels(null);
                    return;
                }
                const response = await fetch(csvPath, { cache: 'no-cache' });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                const csvText = await response.text();
                stateApi.setMasterLevels(parseMasterLevelsCsv(csvText));
            } catch (error) {
                console.warn('レベル候補の読み込みに失敗しました:', error);
                stateApi.setMasterLevels(null);
            } finally {
                stateApi.setMasterLevelsLoaded(true);
                stateApi.clearMasterLevelsPromise();
            }
        })();

        stateApi.setMasterLevelsPromise(loader);
        await loader;
    }

    function applyMasterLevelOptions(effect, select, effectName, helpers = {}) {
        if (!effect || !select) {
            return;
        }
        const {
            setCorrectionLevelCandidates: setCandidatesHelper,
            rebuildLevelSelectOptions: rebuildOptionsHelper
        } = helpers || {};

        const setCandidates =
            typeof setCandidatesHelper === 'function'
                ? setCandidatesHelper
                : (targetEffect, candidates) => {
                      const sanitized = sanitizeLevelList(candidates);
                      if (targetEffect) {
                          targetEffect.dataset.levelOptionsBaseJson = JSON.stringify(sanitized);
                      }
                      return sanitized;
                  };

        const rebuildOptions =
            typeof rebuildOptionsHelper === 'function'
                ? rebuildOptionsHelper
                : (targetEffect, targetSelect, baseOptions) => {
                      const values = Array.isArray(baseOptions) ? baseOptions : [];
                      targetSelect.textContent = '';
                      const emptyOption = document.createElement('option');
                      emptyOption.value = '';
                      emptyOption.textContent = '';
                      targetSelect.appendChild(emptyOption);
                      values.forEach((value) => {
                          const optionNode = document.createElement('option');
                          optionNode.value = value;
                          optionNode.textContent = value;
                          targetSelect.appendChild(optionNode);
                      });
                      if (targetEffect) {
                          targetEffect.dataset.levelOptionsDisplay = values.join('|');
                      }
                  };

        const normalizedName = normalizeEffectName(effectName);
        if (!state.masterLevelsLoaded) {
            setCandidates(effect, []);
            void ensureMasterLevels().then(() => {
                applyMasterLevelOptions(effect, select, normalizedName, helpers);
            });
            return;
        }

        const levelsMap = state.masterLevels instanceof Map ? state.masterLevels : null;
        if (!levelsMap) {
            setCandidates(effect, []);
            rebuildOptions(effect, select);
            return;
        }

        const key = effectKey(normalizedName);
        if (!key) {
            setCandidates(effect, []);
            rebuildOptions(effect, select);
            return;
        }

        const candidates = levelsMap.get(key) || [];
        const applied = setCandidates(effect, candidates);
        if (applied.length) {
            effect.dataset.levelOptionsBaseJson = JSON.stringify(applied);
            rebuildOptions(effect, select, applied);
        } else {
            rebuildOptions(effect, select);
        }
    }

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

    const stateStoreFactory = window.galleryStateStoreFactory || null;
    if (!stateStoreFactory || typeof stateStoreFactory.createStateStore !== 'function') {
        throw new Error('gallery state store factory is not available');
    }

    const stateStore = stateStoreFactory.createStateStore({

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

    const appStateFactory = window.galleryAppStateFactory || null;
    if (!appStateFactory || typeof appStateFactory.createStateApi !== 'function') {
        throw new Error('gallery app state factory is not available');
    }

    const stateApi = appStateFactory.createStateApi({ stateStore });
    const { state, datasetState } = stateApi;

    const recordUtilsFactory = window.galleryRecordUtilsFactory || null;
    const recordUtils =
        (recordUtilsFactory && typeof recordUtilsFactory.createRecordUtils === 'function'
            ? recordUtilsFactory.createRecordUtils()
            : window.galleryRecordUtils) || null;

    if (!recordUtils) {
        throw new Error('gallery record utilities are not available');
    }
    setupMasterOptions();
    if (!state.masterJsonPath && state.masterOptions.length) {
        ensureMasterDatalist();
    }

    function handleStateChange() {
        updateDatasetIndicator();
        updateSaveAvailability();
    }

    const datasetManagerFactory = window.galleryDatasetManagerFactory || null;
    if (!datasetManagerFactory || typeof datasetManagerFactory.createDatasetManager !== 'function') {
        throw new Error('gallery dataset manager factory is not available');
    }

    const clearGalleryForReload = () => {
        clearElementChildren(dom.gallery);
        stateApi.clearRecordsAndItems();
    };

    const datasetManager = datasetManagerFactory.createDatasetManager({
        stateStore,
        datasetState,
        state,
        resolveDatasetState,
        areSourcesEqual,
        applyDatasetState,
        clearForReload: clearGalleryForReload,
        loadInitialData: () => loadInitialData()
    });

    const { clampDatasetIndex, getCurrentDataset, prepareInitialDataset, switchDataset } = datasetManager;

    const appFactory = window.galleryAppFactory || null;

    const createAppController =
        appFactory && typeof appFactory.createAppController === 'function'
            ? appFactory.createAppController
            : function createAppControllerFallback(config = {}) {
                  const {
                      attachEventHandlers: attachHandlers = () => {},
                      prepareInitialDataset: prepareDataset = () => {},
                      setupDatasetSelector: setupSelector = () => {},
                      ensureMasterLevels: loadMasterLevels = async () => {},
                      ensureMasterOptions: loadMasterOptions = async () => {},
                      datasetState: dsState = { list: [], activeIndex: -1 },
                      switchDataset: switchFn = async () => {},
                      loadInitialData: loadData = async () => {}
                  } = config;

                  return {
                      async initialize() {
                          attachHandlers();
                          prepareDataset();
                          setupSelector();
                          await loadMasterLevels();
                          await loadMasterOptions();
                          if (dsState && Array.isArray(dsState.list) && dsState.list.length) {
                              await switchFn(dsState.activeIndex, { forceReload: true });
                          } else {
                              await loadData();
                          }
                      }
                  };
              };

    function getRecordByIndex(index) {
        return recordUtils.getRecordByIndex(state.records, index);
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

    const storageManagerFactory = window.galleryStorageManagerFactory || null;
    if (!storageManagerFactory || typeof storageManagerFactory.createStorageManager !== 'function') {
        throw new Error('gallery storage manager factory is not available');
    }

    const storageManager = storageManagerFactory.createStorageManager({
        storageUtils,
        getRecords: () => state.records,
        getDatasetState: () => datasetState,
        getCsvPath: () => state.csvPath,
        resolveCsvSavePath,
        setStorageStatus
    });

    const renderFactory = window.galleryRenderFactory || null;

    const effectModule =
        renderFactory && typeof renderFactory.createEffectFactory === 'function'
            ? renderFactory.createEffectFactory({
                  state,
                  datasetState,
                  masterDatalistId: MASTER_DATALIST_ID,
                  createElement,
                  sanitizeLevelList,
                  sortLevelsAscending,
                  applyMasterLevelOptions,
                  normalizeStatus,
                  statusLabel
              })
            : null;

    if (!effectModule) {
        throw new Error('gallery effect factory is not available');
    }

    const {
        createEffect,
        updateEffectStatus,
        updateLevelBadge,
        rebuildLevelSelectOptions,
        setCorrectionLevelCandidates,
        getEffectIndexes,
        createCorrectionInput,
        updateInputValueAttribute,
        updateLevelInputAvailability
    } = effectModule;


    function collectCsvHeaders(records) {
        const seen = new Set();
        const headers = [];
        const register = (key) => {
            if (!key || seen.has(key)) {
                return;
            }
            seen.add(key);
            headers.push(key);
        };

        records.forEach((record) => {
            if (!record || typeof record !== 'object') {
                return;
            }
            Object.keys(record).forEach(register);
        });

        return headers.length ? headers : ['Image'];
    }

    function csvEscape(value) {
        const text = value == null ? '' : String(value);
        if (!/[",\n]/.test(text)) {
            return text;
        }
        return '"' + text.replace(/"/g, '""') + '"';
    }

    function generateCsv(records) {
        if (!Array.isArray(records) || !records.length) {
            return '';
        }
        const headers = collectCsvHeaders(records);
        const lines = [headers.map(csvEscape).join(',')];

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

    function csvFileName() {
        const baseName = getFileName(state.csvPath) || 'results.csv';
        const converted = baseName.replace(/\.csv$/i, '_review.csv');
        if (converted !== baseName) {
            return converted;
        }
        if (!baseName) {
            return 'results_review.csv';
        }
        return `${baseName.replace(/\.csv$/i, '')}_review.csv`;
    }

    const eventsFactory = window.galleryEventsFactory || null;
    const galleryEvents =
        eventsFactory && typeof eventsFactory.createGalleryEvents === 'function'
            ? eventsFactory.createGalleryEvents({
                  dom,
                  state,
                  datasetState,
                  duplicates,
                  showStatus,
                  clearStatus,
                  setStorageStatus,
                  parseCsvRecords,
                  loadRecordsArray,
                  generateCsv,
                  csvFileName,
                  sanitizeLevelList,
                  sortLevelsAscending,
                  updateEffectStatus,
                  setCorrectionLevelCandidates,
                  rebuildLevelSelectOptions,
                  createCorrectionInput,
                  updateLevelBadge,
                  getEffectIndexes,
                  updateInputValueAttribute,
                  updateLevelInputAvailability,
                  applyMasterLevelOptions
              })
            : null;

    if (!galleryEvents) {
        throw new Error('gallery events factory is not available');
    }

    const { bindImage, attachEventHandlers } = galleryEvents;

    const galleryView =
        renderFactory && typeof renderFactory.createGalleryView === 'function'
            ? renderFactory.createGalleryView({
                  state,
                  datasetState,
                  stateApi,
                  dom,
                  duplicates,
                  itemColorOptions: ITEM_COLOR_OPTIONS,
                  createEffect,
                  bindImage,
                  createElement,
                  joinPath,
                  getFileName,
                  showStatus,
                  clearStatus,
                  ensureDomElement,
                  applyInlineStyles: applyInlineStylesToElement,
                  normalizeStatus,
                  getRecordByIndex,
                  isRecordDuplicate,
                  isRecordFavorite
              })
            : null;

    if (!galleryView) {
        throw new Error('gallery render factory is not available');
    }

    const {
        buildGallery,
        applyFilters,
        setOcrVisibility,
        getOcrToggleState,
        getItemContext,
        updateFavoriteVisuals,
        updateDuplicateVisuals,
        applyItemColor,
        normalizeItemColor,
        refreshItemCaches
    } = galleryView;

    attachEventHandlers({
        switchDataset,
        buildGallery,
        applyFilters,
        setOcrVisibility,
        getOcrToggleState,
        getItemContext,
        updateFavoriteVisuals,
        updateDuplicateVisuals,
        applyItemColor,
        normalizeItemColor,
        refreshItemCaches,
        getRecordByIndex,
        isRecordDuplicate,
        isRecordFavorite,
        setRecordDuplicate,
        setRecordFavorite,
        setRecordItemColor,
        recordStatusChange,
        updateRecordCorrection,
        updateRecordLevelCorrection,
        updateRecordLevelValue,
        updateRecordLevelOptions,
        updateRecordLevelSuppressed,
        scheduleSave: () => storageManager.scheduleSave()
    });

    const appController = createAppController({
        attachEventHandlers,
        prepareInitialDataset,
        setupDatasetSelector,
        ensureMasterLevels,
        ensureMasterOptions,
        datasetState,
        switchDataset,
        loadInitialData
    });

    void appController.initialize();

    stateStore.subscribe(handleStateChange);
    handleStateChange();

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
    function updateRecordLevelValue(recordIndex, slotIndex, value) {
        if (Number.isNaN(recordIndex) || Number.isNaN(slotIndex)) {
            return false;
        }
        const key = `Effect${slotIndex}Level`;
        return updateRecordField(recordIndex, key, value);
    }
    function updateRecordLevelOptions(recordIndex, slotIndex, value) {
        if (Number.isNaN(recordIndex) || Number.isNaN(slotIndex)) {
            return false;
        }
        const key = `Effect${slotIndex}LevelOptions`;
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
            storageManager.scheduleSave();
            return true;
        }
        return false;
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
        stateApi.ensureLabelSymbolsLength(maxSlot, (slot) => `Slot ${slot}`);
    }

    function loadRecordsArray(data) {
        let records = Array.isArray(data) ? data.slice() : data && typeof data === 'object' ? [data] : [];
        const normalized = normalizeSuppressedRecords(records);
        if (Array.isArray(normalized)) {
            records = normalized;
        }
        ensureLabelCoverage(records);
        stateApi.setRecords(records);
        duplicates.prepare();
        buildGallery();
    }

    async function loadInitialData() {
        const preferredName = getFileName(state.csvPath) || 'results.csv';

        try {
            const text = await storageManager.tryLoad(preferredName);
            if (text) {
                loadRecordsArray(JSON.parse(text));
                clearStatus();
                setStorageStatus('ブラウザから読み込みました。', false);
                return;
            }
        } catch (error) {
            console.warn('ブラウザからの読み込みに失敗しました:', error);
        }

        const isMerged =
            datasetState.kind === 'merged' &&
            Array.isArray(datasetState.sources) &&
            datasetState.sources.length > 0;
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

    function getFileName(path) {
        if (!path) {
            return '';
        }
        const parts = path.split(/[\\/]/);
        return parts[parts.length - 1] || '';
    }






})();

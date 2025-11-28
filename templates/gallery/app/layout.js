(() => {
    'use strict';

    const DEFAULT_IDS = Object.freeze({
        galleryId: 'gallery',
        datasetSelectorId: 'dataset-selector',
        datasetSelectId: 'dataset-select',
        relicTypeSelectId: 'relic-type-select',
        galleryStatusId: 'gallery-status',
        searchInputId: 'search-input',
        effectSearchModeSelector: '.effect-search-mode-select',
        tagSearchInputId: 'tag-search-input',
        filterSelectId: 'filter-status',
        colorFilterId: 'filter-color',
        showDuplicatesId: 'show-duplicates',
        showOcrId: 'show-ocr',
        lightboxId: 'lightbox',
        lightboxCloseId: 'lightbox-close',
        downloadCsvButtonId: 'download-csv',
        uploadCsvButtonId: 'upload-csv',
        uploadCsvInputId: 'upload-csv-input',
        storageStatusId: 'storage-status',
        summaryId: 'gallery-summary',
        viewBoxContainerId: 'viewbox-controls',
        viewBoxTopInputId: 'viewbox-top',
        viewBoxLeftInputId: 'viewbox-left',
        viewBoxHeightInputId: 'viewbox-height',
        viewBoxWidthInputId: 'viewbox-width',
        viewBoxApplyButtonId: 'viewbox-apply',
        viewBoxResetButtonId: 'viewbox-reset'
    });

    const DEFAULT_EFFECT_SEARCH_IDS = Object.freeze([
        'effect-search-1',
        'effect-search-2',
        'effect-search-3'
    ]);

    const DEFAULT_REQUIRED_KEYS = Object.freeze([
        'gallery',
        'datasetSelect',
        'searchInput',
        'filterSelect',
        'colorFilter',
        'showDuplicatesToggle',
        'showOcrToggle'
    ]);

    function resolveDocument(options) {
        if (options && options.documentRef) {
            return options.documentRef;
        }
        if (typeof document !== 'undefined' && document) {
            return document;
        }
        return null;
    }

    function selectById(doc, id) {
        if (!doc || typeof doc.getElementById !== 'function') {
            return null;
        }
        return doc.getElementById(id) || null;
    }

    function selectAll(doc, selector) {
        if (!doc || typeof doc.querySelectorAll !== 'function' || !selector) {
            return [];
        }
        return Array.from(doc.querySelectorAll(selector));
    }

    function selectFirst(doc, selector) {
        if (!doc || typeof doc.querySelector !== 'function' || !selector) {
            return null;
        }
        return doc.querySelector(selector);
    }

    function collectEffectSearchInputs(doc, ids) {
        if (!Array.isArray(ids)) {
            return [];
        }
        return ids
            .map((id) => selectById(doc, id))
            .filter((input) => input);
    }

    function createLayoutHandles(options = {}) {
        const doc = resolveDocument(options);
        const selectors = { ...DEFAULT_IDS, ...(options.selectors || {}) };
        const effectSearchInputIds = Array.isArray(options.effectSearchInputIds)
            ? options.effectSearchInputIds
            : DEFAULT_EFFECT_SEARCH_IDS;
        const lightboxElement = selectById(doc, selectors.lightboxId);

        const elements = {
            gallery: selectById(doc, selectors.galleryId),
            datasetSelector: selectById(doc, selectors.datasetSelectorId),
            datasetSelect: selectById(doc, selectors.datasetSelectId),
            relicTypeSelect: selectById(doc, selectors.relicTypeSelectId),
            galleryStatus: selectById(doc, selectors.galleryStatusId),
            searchInput: selectById(doc, selectors.searchInputId),
            effectSearchInputs: collectEffectSearchInputs(doc, effectSearchInputIds),
            effectSearchModes: selectAll(doc, selectors.effectSearchModeSelector),
            tagSearchInput: selectById(doc, selectors.tagSearchInputId),
            filterSelect: selectById(doc, selectors.filterSelectId),
            colorFilter: selectById(doc, selectors.colorFilterId),
            showDuplicatesToggle: selectById(doc, selectors.showDuplicatesId),
            showOcrToggle: selectById(doc, selectors.showOcrId),
            lightbox: lightboxElement,
            lightboxImg:
                lightboxElement && typeof lightboxElement.querySelector === 'function'
                    ? lightboxElement.querySelector('img')
                    : selectFirst(doc, `#${selectors.lightboxId} img`),
            lightboxClose: selectById(doc, selectors.lightboxCloseId),
            downloadCsvButton: selectById(doc, selectors.downloadCsvButtonId),
            uploadCsvButton: selectById(doc, selectors.uploadCsvButtonId),
            uploadCsvInput: selectById(doc, selectors.uploadCsvInputId),
            storageStatus: selectById(doc, selectors.storageStatusId),
            summary: selectById(doc, selectors.summaryId),
            viewBoxContainer: selectById(doc, selectors.viewBoxContainerId),
            viewBoxTopInput: selectById(doc, selectors.viewBoxTopInputId),
            viewBoxLeftInput: selectById(doc, selectors.viewBoxLeftInputId),
            viewBoxHeightInput: selectById(doc, selectors.viewBoxHeightInputId),
            viewBoxWidthInput: selectById(doc, selectors.viewBoxWidthInputId),
            viewBoxApplyButton: selectById(doc, selectors.viewBoxApplyButtonId),
            viewBoxResetButton: selectById(doc, selectors.viewBoxResetButtonId)
        };

        const requiredKeys = Array.isArray(options.requiredKeys)
            ? options.requiredKeys
            : DEFAULT_REQUIRED_KEYS;
        const missingRequired = requiredKeys.filter((key) => !elements[key]);

        return { elements, missingRequired };
    }

    if (!window.galleryAppLayout) {
        window.galleryAppLayout = {};
    }
    window.galleryAppLayout.createLayoutHandles = createLayoutHandles;
})();

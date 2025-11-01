(() => {
    'use strict';

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
        let relicType = '';

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
            relicType = entry.relicType ?? entry.relic_type ?? '';
        } else {
            csv = String(entry);
        }

        label = typeof label === 'string' ? label.trim() : '';
        csv = typeof csv === 'string' ? csv.trim() : '';
        imgDir = typeof imgDir === 'string' ? imgDir.trim() : '';
        folder = typeof folder === 'string' ? folder.trim() : '';
        kind = typeof kind === 'string' ? kind.trim().toLowerCase() : '';
        relicType = typeof relicType === 'string' ? relicType.trim().toLowerCase() : '';

        if (!relicType && kind === 'merged') {
            relicType = 'merged';
        }

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
            sources,
            relicType
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
        return list.map((source, listIndex) => ({
            label: source && typeof source.label === 'string' ? source.label : '',
            csv: source && typeof source.csv === 'string' ? source.csv : '',
            imgDir: source && typeof source.imgDir === 'string' ? source.imgDir : '',
            folder: source && typeof source.folder === 'string' ? source.folder : '',
            index: source && Number.isFinite(source.index) ? Number(source.index) : listIndex
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
            const leftIndex = Number.isFinite(leftEntry.index) ? Number(leftEntry.index) : i;
            const rightIndex = Number.isFinite(rightEntry.index) ? Number(rightEntry.index) : i;
            if (leftIndex !== rightIndex) {
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
            sources,
            relicType
        };
    }

    function createDatasetUtils() {
        return {
            normalizeDatasetSources,
            normalizeDatasetEntry,
            parseDatasets,
            parseDatasetIndex,
            cloneDatasetSources,
            areSourcesEqual,
            resolveDatasetState
        };
    }

    if (!window.galleryDatasetUtilsFactory) {
        window.galleryDatasetUtilsFactory = {};
    }

    window.galleryDatasetUtilsFactory.createDatasetUtils = createDatasetUtils;

    if (!window.galleryDatasetUtils) {
        window.galleryDatasetUtils = createDatasetUtils();
    }
})();

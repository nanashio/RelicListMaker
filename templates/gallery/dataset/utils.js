(() => {
    'use strict';

    function normalizeDatasetEntry(entry, index) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            return null;
        }

        const label = typeof entry.label === 'string' ? entry.label.trim() : '';
        const csv = typeof entry.csv === 'string' ? entry.csv.trim() : '';
        const imgDir = typeof entry.imgDir === 'string' ? entry.imgDir.trim() : '';
        const folder = typeof entry.folder === 'string' ? entry.folder.trim() : '';
        const kind = typeof entry.kind === 'string' ? entry.kind.trim().toLowerCase() : '';
        const relicType = typeof entry.relicType === 'string' ? entry.relicType.trim().toLowerCase() : '';

        const sources = Array.isArray(entry.sources)
            ? entry.sources
                  .map((source, sourceIndex) => {
                      if (!source || typeof source !== 'object') {
                          return null;
                      }
                      const sourceCsv = typeof source.csv === 'string' ? source.csv.trim() : '';
                      if (!sourceCsv) {
                          return null;
                      }
                      const sourceLabel = typeof source.label === 'string' ? source.label.trim() : '';
                      const sourceImgDir = typeof source.imgDir === 'string' ? source.imgDir.trim() : '';
                      const sourceFolder = typeof source.folder === 'string' ? source.folder.trim() : '';
                      const sourceIndexValue = Number.isFinite(source.index)
                          ? Number(source.index)
                          : sourceIndex;
                      return {
                          label: sourceLabel,
                          csv: sourceCsv,
                          imgDir: sourceImgDir,
                          folder: sourceFolder,
                          index: sourceIndexValue
                      };
                  })
                  .filter((source) => source !== null)
            : [];

        const isMerged = kind === 'merged' && sources.length > 0;
        if (!csv && !isMerged) {
            return null;
        }

        const entryData = {
            label,
            csv,
            imgDir,
            folder,
            index,
            kind,
            sources
        };

        if (relicType || kind === 'merged') {
            entryData.relicType = relicType || 'merged';
        }

        return entryData;
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
        const relicType = dataset.relicType || '';
        const sources = cloneDatasetSources(dataset.sources);
        const isMerged = kind === 'merged' && sources.length > 0;
        const csvPath = isMerged ? dataset.csv || 'merged-dataset.csv' : dataset.csv || '';
        const imageDir = isMerged ? '' : dataset.imgDir || '';
        const descriptor = {
            label,
            folder,
            kind,
            csvPath,
            imageDir,
            sources
        };

        if (relicType) {
            descriptor.relicType = relicType;
        }

        return descriptor;
    }

    function createDatasetUtils() {
        return {
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

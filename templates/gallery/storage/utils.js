(() => {
    function parseCsvRows(text) {
        if (!text) {
            return [];
        }
        const sanitized = String(text);
        const rows = [];
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

    async function loadMergedRecords(sources, options = {}) {
        const {
            parseRecords = parseCsvRecords,
            joinPath = (base, name) => `${base ? `${base.replace(/\\\\$/, '')}/` : ''}${name}`
        } = options;

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
            const records = parseRecords(csvText);
            if (!records.length) {
                continue;
            }
            records.forEach((record) => {
                if (!record || typeof record !== 'object') {
                    return;
                }
                const rawImage = record.Image == null ? '' : String(record.Image);
                const hasPath = /[\\/]/.test(rawImage);
                const baseImage = rawImage ? rawImage.split(/[\\/]/).pop() || rawImage : '';
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
            const normalized = normalizeName(name);
            if (!normalized) {
                return false;
            }
            return cache.has(normalized);
        }

        function clearAll() {
            cache.clear();
            persist();
        }

        return {
            set,
            toggle,
            has,
            clearAll,
            prepare: ensureLoaded,
            /** @internal テスト用 */
            _debug: {
                storageKey,
                ensureLoaded,
                persist
            }
        };
    }

    function normalizeLevelPlaceholder(value) {
        if (value == null) {
            return 'none';
        }
        const text = String(value).trim();
        if (!text) {
            return 'none';
        }
        return text.toLowerCase() === 'none' ? 'none' : text;
    }

    function ensureEffectLevelPlaceholders(records) {
        if (!Array.isArray(records)) {
            return [];
        }

        return records.map((record) => {
            if (!record || typeof record !== 'object') {
                return record;
            }

            const pendingDefaults = new Set();

            Object.keys(record).forEach((key) => {
                if (typeof key !== 'string') {
                    return;
                }
                const levelMatch = /^Effect(\d+)Level$/i.exec(key);
                if (levelMatch) {
                    const slot = Number.parseInt(levelMatch[1], 10);
                    if (!Number.isFinite(slot)) {
                        return;
                    }
                    const normalizedKey = `Effect${slot}Level`;
                    record[normalizedKey] = normalizeLevelPlaceholder(record[key]);
                    const sourceKey = `Effect${slot}LevelSource`;
                    if (Object.prototype.hasOwnProperty.call(record, sourceKey)) {
                        record[sourceKey] = normalizeLevelPlaceholder(record[sourceKey]);
                    }
                    return;
                }

                const sourceMatch = /^Effect(\d+)LevelSource$/i.exec(key);
                if (sourceMatch) {
                    const slot = Number.parseInt(sourceMatch[1], 10);
                    if (!Number.isFinite(slot)) {
                        return;
                    }
                    const normalizedKey = `Effect${slot}LevelSource`;
                    record[normalizedKey] = normalizeLevelPlaceholder(record[key]);
                    if (!Object.prototype.hasOwnProperty.call(record, `Effect${slot}Level`)) {
                        record[`Effect${slot}Level`] = record[normalizedKey];
                    }
                    return;
                }

                const optionsMatch = /^Effect(\d+)LevelOptions$/i.exec(key);
                if (optionsMatch) {
                    const slot = Number.parseInt(optionsMatch[1], 10);
                    if (!Number.isFinite(slot)) {
                        return;
                    }
                    const levelKey = `Effect${slot}Level`;
                    if (Object.prototype.hasOwnProperty.call(record, levelKey)) {
                        return;
                    }
                    const raw = record[key];
                    const text = raw == null ? '' : String(raw).trim().toLowerCase();
                    if (!text || text === 'none') {
                        pendingDefaults.add(slot);
                    }
                }
            });

            pendingDefaults.forEach((slot) => {
                const levelKey = `Effect${slot}Level`;
                if (!Object.prototype.hasOwnProperty.call(record, levelKey)) {
                    record[levelKey] = 'none';
                } else {
                    record[levelKey] = normalizeLevelPlaceholder(record[levelKey]);
                }
                const sourceKey = `Effect${slot}LevelSource`;
                if (Object.prototype.hasOwnProperty.call(record, sourceKey)) {
                    record[sourceKey] = normalizeLevelPlaceholder(record[sourceKey]);
                }
            });

            return record;
        });
    }

    function createOpfsManager(config = {}) {
        const {
            getRecords = () => [],
            getDatasetState = () => ({ kind: '', label: '' }),
            getCsvPath = () => '',
            resolveCsvSavePath = (path) => path,
            setStorageStatus = () => {}
        } = config;

        const managerState = {
            timer: null,
            saving: false,
            queued: false
        };

        function datasetEditable() {
            const dataset = getDatasetState();
            return dataset && dataset.kind !== 'merged';
        }

        function collectRecords() {
            const data = getRecords();
            const records = Array.isArray(data) ? data : [];
            ensureEffectLevelPlaceholders(records);
            return records;
        }

        async function writeOnce() {
            if (!datasetEditable()) {
                return;
            }
            const csvPath = resolveCsvSavePath(getCsvPath());
            if (!csvPath) {
                setStorageStatus('保存先のCSVパスを解決できません。', true);
                return;
            }

            managerState.saving = true;
            managerState.queued = false;
            setStorageStatus('保存中...', false);

            try {
                const dataset = getDatasetState() || {};
                const response = await fetch('/__viewer_api__/save', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        csvPath,
                        records: collectRecords(),
                        datasetLabel: dataset.label || ''
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
            const dataset = getDatasetState();
            if (dataset && dataset.kind === 'merged') {
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
                const csvPath = getCsvPath();
                const parts = (csvPath || '').split(/[\\/]/);
                return parts.length ? parts[parts.length - 1] : 'results.csv';
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

    if (!window.galleryStorageUtils) {
        window.galleryStorageUtils = {};
    }
    Object.assign(window.galleryStorageUtils, {
        parseCsvRows,
        parseCsvRecords,
        loadMergedRecords,
        createDuplicateManager,
        createOpfsManager
    });
})();

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
            return Array.isArray(data) ? data : [];
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
        createOpfsManager
    });
})();

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

    const domUtils = window.galleryDomUtils || null;


    const {
        parseDatasets,
        parseDatasetIndex,
        cloneDatasetSources,
        areSourcesEqual,
        resolveDatasetState
    } = datasetUtils;

    const setElementHiddenFallback = (element, hidden) => {
        if (!element || !element.classList) {
            return;
        }
        element.classList.toggle('hidden', Boolean(hidden));
    };

    const clearElementChildrenFallback = (element) => {
        if (!element) {
            return;
        }
        element.textContent = '';
    };

    const updateStatusElementFallback = (element, message, options = {}) => {
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
    };

    const applyInlineStylesFallback = (element, styles) => {
        if (!element || !styles || typeof styles !== 'object') {
            return;
        }
        Object.keys(styles).forEach((key) => {
            const value = styles[key];
            if (value != null) {
                element.style[key] = value;
            }
        });
    };

    const ensureDomElementFallback = (current, options = {}) => {
        const { selector = '', id = '', tagName = 'div', classNames = [], create } = options;
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
    };

    const {
        setHidden: domSetHidden,
        clearChildren: domClearChildren,
        updateStatusElement: domUpdateStatusElement,
        applyInlineStyles: domApplyInlineStyles,
        ensureElement: domEnsureElement
    } = domUtils || {};

    const setElementHidden = domSetHidden || setElementHiddenFallback;
    const clearElementChildren = domClearChildren || clearElementChildrenFallback;
    const updateStatusElement = domUpdateStatusElement || updateStatusElementFallback;
    const applyInlineStylesToElement = domApplyInlineStyles || applyInlineStylesFallback;
    const ensureDomElement = domEnsureElement || ensureDomElementFallback;

    const dataUtils = window.galleryDataUtils || {};
    const storageUtils = window.galleryStorageUtils || {};

    const parseCsvRows =
        storageUtils.parseCsvRows ||
        function parseCsvRowsFallback(text) {
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
        };

    const parseCsvRecords =
        storageUtils.parseCsvRecords ||
        function parseCsvRecordsFallback(text) {
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
        };

    const loadMergedRecords =
        storageUtils.loadMergedRecords
            ? (sources) => storageUtils.loadMergedRecords(sources, { parseRecords: parseCsvRecords, joinPath })
            : async function loadMergedRecordsFallback(sources) {
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
              };

    const createOpfsManager =
        storageUtils.createOpfsManager
            ? (config) => storageUtils.createOpfsManager(config)
            : function createOpfsManagerFallback(config = {}) {
                  const {
                      getRecords = () => [],
                      getDatasetState = () => ({ kind: '', label: '' }),
                      getCsvPath = () => '',
                      resolveCsvSavePath: resolvePath = (value) => value,
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
                      const csvPath = resolvePath(getCsvPath());
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
              };

    let {
        sanitizeLevelList = null,
        normalizeEffectName = null,
        effectKey = null,
        normalizeLevelNumericValue = null,
        sortLevelsAscending = null,
        parseLevelTokens = null,
        parseMasterOptions = null,
        parseMasterLevels = null
    } = dataUtils;

    if (!sanitizeLevelList) {
        sanitizeLevelList = (values) => {
            if (!Array.isArray(values)) {
                return [];
            }
            return values
                .map((value) => (value == null ? '' : String(value).trim()))
                .filter((value) => value !== '');
        };
    }

    if (!normalizeEffectName) {
        normalizeEffectName = (value) => {
            if (value == null) {
                return '';
            }
            return String(value).trim();
        };
    }

    if (!effectKey) {
        effectKey = (value) => {
            const normalized = normalizeEffectName(value);
            return normalized ? normalized.toLowerCase() : '';
        };
    }

    if (!normalizeLevelNumericValue) {
        normalizeLevelNumericValue = (value) => {
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
        };
    }

    if (!sortLevelsAscending) {
        sortLevelsAscending = (values) => {
            if (!Array.isArray(values)) {
                return [];
            }
            const copy = values.slice();
            const parseValue = (value) => {
                const number = normalizeLevelNumericValue(value);
                if (number != null) {
                    return { key: number, text: String(number), isNumeric: true };
                }
                const textValue = value == null ? '' : String(value).trim();
                return { key: textValue.toLowerCase(), text: textValue, isNumeric: false };
            };

            return copy
                .map((value) => ({ raw: value, parsed: parseValue(value) }))
                .sort((left, right) => {
                    if (left.parsed.isNumeric && right.parsed.isNumeric) {
                        return left.parsed.key - right.parsed.key;
                    }
                    if (left.parsed.isNumeric) {
                        return -1;
                    }
                    if (right.parsed.isNumeric) {
                        return 1;
                    }
                    if (left.parsed.key < right.parsed.key) {
                        return -1;
                    }
                    if (left.parsed.key > right.parsed.key) {
                        return 1;
                    }
                    return 0;
                })
                .map((entry) => entry.raw);
        };
    }

    if (!parseLevelTokens) {
        parseLevelTokens = (raw) => {
            if (raw == null) {
                return [];
            }
            if (Array.isArray(raw)) {
                return raw.slice();
            }
            const text = String(raw).trim();
            if (!text) {
                return [];
            }
            const lower = text.toLowerCase();
            if (lower === 'false' || lower === 'なし' || lower === 'null') {
                return [];
            }
            return text
                .split(/[|,]/)
                .map((value) => value.trim())
                .filter((value) => value !== '');
        };
    }

    if (!parseMasterOptions) {
        parseMasterOptions = (source) => {
            let list = source;
            if (typeof source === 'string') {
                const text = source.trim();
                if (!text) {
                    return [];
                }
                try {
                    list = JSON.parse(text);
                } catch (_error) {
                    return sanitizeLevelList(text.split(/[|,]/));
                }
            }

            if (!Array.isArray(list)) {
                return [];
            }

            const normalized = list
                .map((entry) => {
                    if (entry == null) {
                        return '';
                    }
                    if (typeof entry === 'object') {
                        const raw =
                            entry.EffectBase ||
                            entry.effect ||
                            entry.name ||
                            entry.value ||
                            entry.label ||
                            '';
                        return typeof raw === 'string' ? raw.trim() : '';
                    }
                    return String(entry).trim();
                })
                .filter((value) => value !== '');

            return Array.from(new Set(normalized));
        };
    }

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

    if (!parseMasterLevels) {
        parseMasterLevels = (source) => {
            if (!source) {
                return new Map();
            }

            let data = source;
            if (typeof source === 'string') {
                const text = source.trim();
                if (!text) {
                    return new Map();
                }
                try {
                    data = JSON.parse(text);
                } catch (error) {
                    console.warn('master levelsの解析に失敗しました:', error);
                    return new Map();
                }
            }

            const result = new Map();

            const assignLevels = (name, levels) => {
                const key = effectKey(name);
                if (!key) {
                    return;
                }
                const tokens = Array.isArray(levels) ? levels : parseLevelTokens(levels);
                const sanitized = sanitizeLevelList(tokens);
                if (!sanitized.length) {
                    return;
                }
                const sorted = sortLevelsAscending(sanitized);
                if (result.has(key)) {
                    const merged = sanitizeLevelList(result.get(key).concat(sorted));
                    result.set(key, sortLevelsAscending(merged));
                    return;
                }
                result.set(key, sorted);
            };

            if (data instanceof Map) {
                data.forEach((value, key) => {
                    assignLevels(key, value);
                });
                return result;
            }

            if (Array.isArray(data)) {
                data.forEach((entry) => {
                    if (!entry) {
                        return;
                    }
                    if (typeof entry === 'object') {
                        const name =
                            entry.EffectBase ||
                            entry.effect ||
                            entry.name ||
                            entry.label ||
                            entry.key ||
                            '';
                        const levels =
                            entry.Levels ||
                            entry.levels ||
                            entry.values ||
                            entry.options ||
                            entry.candidates ||
                            entry.list ||
                            null;
                        assignLevels(name, levels);
                    } else {
                        assignLevels(entry, []);
                    }
                });
                return result;
            }

            if (typeof data === 'object') {
                Object.keys(data).forEach((key) => {
                    assignLevels(key, data[key]);
                });
            }

            return result;
        };
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
        if (!Array.isArray(state.masterOptions)) {
            state.masterOptions = [];
            return;
        }
        const normalized = state.masterOptions
            .map((value) => normalizeEffectName(value))
            .filter((value) => value);
        const unique = Array.from(new Set(normalized));
        unique.sort((a, b) => a.localeCompare(b, 'ja'));
        state.masterOptions = unique;
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
        state.masterDatalistPrepared = true;
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
            state.masterOptions = parseMasterOptions(data);
        } catch (error) {
            console.error('マスターデータの読み込みに失敗しました:', error);
            setStorageStatus(`マスターデータの読み込みに失敗しました: ${error.message || error}`, true);
            state.masterOptions = [];
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

    const createStateStore =
        stateStoreFactory && typeof stateStoreFactory.createStateStore === 'function'
            ? stateStoreFactory.createStateStore
            : function createStateStoreFallback(initialState = {}) {
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
              };
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

    setupMasterOptions();
    if (!state.masterJsonPath && state.masterOptions.length) {
        ensureMasterDatalist();
    }

    function handleStateChange() {
        updateDatasetIndicator();
        updateSaveAvailability();
    }

    const datasetManagerFactory = window.galleryDatasetManagerFactory || null;

    const createDatasetManager =
        datasetManagerFactory && typeof datasetManagerFactory.createDatasetManager === 'function'
            ? datasetManagerFactory.createDatasetManager
            : function createDatasetManagerFallback(config = {}) {
                  const {
                      stateStore: store,
                      datasetState: dsState,
                      state: coreState,
                      resolveDatasetState: resolveState,
                      areSourcesEqual: compareSources,
                      applyDatasetState: applyState,
                      clearForReload,
                      loadInitialData: loadData
                  } = config;

                  const clampIndex = (index) => store.clampIndex(index);

                  const getCurrentDataset = () => {
                      if (!dsState.list.length) {
                          return null;
                      }
                      const idx = clampIndex(dsState.activeIndex);
                      if (idx < 0) {
                          return null;
                      }
                      return dsState.list[idx] || null;
                  };

                  const prepareInitialDataset = () => {
                      if (!dsState.list.length) {
                          return;
                      }
                      const dataset = getCurrentDataset();
                      if (!dataset) {
                          store.setActiveDatasetIndex(dsState.list.length ? 0 : -1);
                          return;
                      }
                      store.setActiveDatasetIndex(dsState.activeIndex);
                      const descriptor = resolveState(dataset);
                      applyState(descriptor);
                  };

                  const switchDataset = async (index, options = {}) => {
                      if (!dsState.list.length) {
                          return;
                      }
                      const nextIndex = clampIndex(index);
                      const dataset = dsState.list[nextIndex];
                      if (!dataset) {
                          return;
                      }

                      const descriptor = resolveState(dataset);
                      const expectedImageDir = descriptor.kind === 'merged' ? '' : descriptor.imageDir || '.';
                      const forceReload = Boolean(options.forceReload);
                      const shouldReload =
                          forceReload ||
                          dsState.activeIndex !== nextIndex ||
                          coreState.csvPath !== descriptor.csvPath ||
                          coreState.imageDir !== expectedImageDir ||
                          dsState.kind !== descriptor.kind ||
                          !compareSources(dsState.sources, descriptor.sources);

                      store.setActiveDatasetIndex(nextIndex);
                      applyState(descriptor);

                      if (!shouldReload) {
                          return;
                      }

                      if (typeof clearForReload === 'function') {
                          clearForReload();
                      }
                      if (typeof loadData === 'function') {
                          await loadData();
                      }
                  };

                  return {
                      clampDatasetIndex: clampIndex,
                      getCurrentDataset,
                      prepareInitialDataset,
                      switchDataset
                  };
              };

    const clearGalleryForReload = () => {
        clearElementChildren(dom.gallery);
        state.records = [];
        state.items = [];
    };

    const datasetManager = createDatasetManager({
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

    const storage = createOpfsManager({
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
        scheduleSave: () => storage.scheduleSave()
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
            storage.scheduleSave();
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
        for (let slot = state.labelSymbols.length + 1; slot <= maxSlot; slot += 1) {
            state.labelSymbols.push(`Slot ${slot}`);
        }
    }

    function loadRecordsArray(data) {
        const records = Array.isArray(data) ? data.slice() : data && typeof data === 'object' ? [data] : [];
        ensureLabelCoverage(records);
        state.records = records;
        duplicates.prepare();
        buildGallery();
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





})();

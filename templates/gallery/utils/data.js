(() => {
    function sanitizeLevelList(values) {
        if (!Array.isArray(values)) {
            return [];
        }
        return values
            .map((value) => (value == null ? '' : String(value).trim()))
            .filter((value) => value !== '');
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
    }

    function parseLevelTokens(raw) {
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
    }

    function parseMasterOptions(source) {
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
    }

    function parseMasterLevels(source) {
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
            const unique = Array.from(new Set(sanitized));
            if (!unique.length) {
                return;
            }
            const sorted = sortLevelsAscending(unique);
            if (result.has(key)) {
                const merged = Array.from(new Set(result.get(key).concat(sorted)));
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
    }

    function parseSuppressedFlag(value) {
        if (value === true) {
            return true;
        }
        if (value === false || value == null) {
            return false;
        }
        if (typeof value === 'number') {
            return value !== 0;
        }
        if (typeof value === 'string') {
            const text = value.trim().toLowerCase();
            if (!text) {
                return false;
            }
            if (text === 'true' || text === '1' || text === 'yes') {
                return true;
            }
            if (text === 'false' || text === '0' || text === 'no') {
                return false;
            }
        }
        return false;
    }

    function normalizeRecordLevelSuppression(record) {
        if (!record || typeof record !== 'object') {
            return record;
        }

        Object.keys(record).forEach((key) => {
            const match = /^Effect(\d+)LevelSuppressed$/i.exec(key);
            if (!match) {
                return;
            }
            const slot = Number.parseInt(match[1], 10);
            if (!Number.isFinite(slot)) {
                return;
            }

            const suppressed = parseSuppressedFlag(record[key]);
            const normalizedKey = `Effect${slot}LevelSuppressed`;

            if (!suppressed) {
                if (Object.prototype.hasOwnProperty.call(record, normalizedKey)) {
                    delete record[normalizedKey];
                }
                return;
            }

            record[normalizedKey] = 'true';

            const levelKey = `Effect${slot}Level`;
            if (Object.prototype.hasOwnProperty.call(record, levelKey)) {
                delete record[levelKey];
            }

            const levelOptionsKey = `Effect${slot}LevelOptions`;
            if (Object.prototype.hasOwnProperty.call(record, levelOptionsKey)) {
                delete record[levelOptionsKey];
            }

            const levelCorrectionKey = `Effect${slot}LevelCorrection`;
            const correctionValue = record[levelCorrectionKey];
            if (typeof correctionValue === 'string' && !correctionValue.trim()) {
                delete record[levelCorrectionKey];
            }
        });

        return record;
    }

    function normalizeSuppressedLevels(records) {
        if (!Array.isArray(records)) {
            return [];
        }
        return records.map((record) => normalizeRecordLevelSuppression(record));
    }

    function normalizeRecordRelicTypeField(record) {
        if (!record || typeof record !== 'object') {
            return record;
        }

        const canonicalKey = 'RelicType';
        const normalizedTarget = 'relictype';
        const keys = Object.keys(record);
        let hasCanonical = Object.prototype.hasOwnProperty.call(record, canonicalKey);
        let normalizedVariantFound = false;

        for (let index = 0; index < keys.length; index += 1) {
            const key = keys[index];
            if (typeof key !== 'string') {
                continue;
            }
            if (key === canonicalKey) {
                hasCanonical = true;
                continue;
            }
            const trimmedKey = key.trim();
            if (!trimmedKey) {
                continue;
            }
            const simplifiedKey = trimmedKey.toLowerCase().replace(/[\s_-]+/g, '');
            if (simplifiedKey === normalizedTarget) {
                normalizedVariantFound = true;
                if (!hasCanonical) {
                    record[canonicalKey] = record[key];
                    hasCanonical = Object.prototype.hasOwnProperty.call(record, canonicalKey);
                }
                if (Object.prototype.hasOwnProperty.call(record, key)) {
                    delete record[key];
                }
            }
        }

        if (!hasCanonical) {
            if (!normalizedVariantFound) {
                return record;
            }
            record[canonicalKey] = record[canonicalKey] || '';
        }

        return record;
    }

    function normalizeRelicTypeColumns(records) {
        if (!Array.isArray(records)) {
            return [];
        }
        return records.map((record) => normalizeRecordRelicTypeField(record));
    }

    window.galleryDataUtils = {
        sanitizeLevelList,
        normalizeEffectName,
        effectKey,
        normalizeLevelNumericValue,
        sortLevelsAscending,
        parseLevelTokens,
        parseMasterOptions,
        parseMasterLevels,
        normalizeSuppressedLevels,
        normalizeRecordLevelSuppression,
        normalizeRecordRelicTypeField,
        normalizeRelicTypeColumns
    };
})();

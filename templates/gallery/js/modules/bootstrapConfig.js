function cloneValue(value, expectedType) {
    if (expectedType === 'array') {
        return Array.isArray(value) ? value.slice() : [];
    }
    if (expectedType === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
        return { ...value };
    }
    return value;
}

function parseJsonLike(value, fallback) {
    if (typeof value !== 'string') {
        return fallback;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return fallback;
    }
    try {
        return JSON.parse(trimmed);
    } catch (error) {
        console.warn('bootstrapConfig: JSON 解析に失敗しました。フォールバックを使用します。', error);
        return fallback;
    }
}

function resolveExpectedValue(field, rawValue, warnings) {
    const { key, type = 'string', defaultValue, required = false } = field;
    const missing = rawValue === undefined || rawValue === null || rawValue === '';

    if (missing) {
        if (required) {
            warnings.push(`必須のブートストラップ項目「${key}」が見つかりません。デフォルトを適用します。`);
        }
        return cloneValue(defaultValue, type);
    }

    if (type === 'string') {
        if (typeof rawValue === 'string') {
            return rawValue;
        }
        warnings.push(`項目「${key}」は文字列を想定しています。自動的に文字列へ変換しました。`);
        return String(rawValue);
    }

    if (type === 'array') {
        if (Array.isArray(rawValue)) {
            return rawValue.slice();
        }
        const parsed = parseJsonLike(rawValue, defaultValue);
        if (Array.isArray(parsed)) {
            return parsed.slice();
        }
        warnings.push(`項目「${key}」は配列を想定しています。デフォルト値を使用します。`);
        return Array.isArray(defaultValue) ? defaultValue.slice() : [];
    }

    if (type === 'object') {
        if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
            return { ...rawValue };
        }
        const parsed = parseJsonLike(rawValue, defaultValue);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return { ...parsed };
        }
        warnings.push(`項目「${key}」はオブジェクトを想定しています。デフォルト値を使用します。`);
        return defaultValue && typeof defaultValue === 'object' && !Array.isArray(defaultValue)
            ? { ...defaultValue }
            : {};
    }

    return rawValue;
}

export const DEFAULT_BOOTSTRAP_SCHEMA = [
    { key: 'coreScript', type: 'string', required: true, defaultValue: '' },
    { key: 'resultsCsv', type: 'string', required: true, defaultValue: '' },
    { key: 'imgDir', type: 'string', defaultValue: '.' },
    { key: 'labelSymbols', type: 'array', defaultValue: [] },
    { key: 'masterCsv', type: 'string', defaultValue: '' },
    { key: 'masterJson', type: 'string', defaultValue: '' },
    { key: 'masterOptions', type: 'array', defaultValue: [] },
    { key: 'masterOptionsMap', type: 'object', defaultValue: {} },
    { key: 'masterLevels', type: 'object', defaultValue: {} },
    { key: 'masterLevelsMap', type: 'object', defaultValue: {} },
    { key: 'masterCsvMap', type: 'object', defaultValue: {} },
    { key: 'masterDemeritCsv', type: 'string', defaultValue: '' },
    { key: 'masterDemeritJson', type: 'string', defaultValue: '' },
    { key: 'masterDemeritOptions', type: 'array', defaultValue: [] },
    { key: 'masterDemeritOptionsMap', type: 'object', defaultValue: {} },
    { key: 'masterDemeritCsvMap', type: 'object', defaultValue: {} },
    { key: 'masterDemeritRulesMap', type: 'object', defaultValue: {} },
    { key: 'datasets', type: 'array', defaultValue: [] },
    { key: 'activeDataset', type: 'string', defaultValue: '' },
    { key: 'itemImageViewBox', type: 'string', defaultValue: '' },
    { key: 'appVersion', type: 'string', defaultValue: '' }
];

export function buildBootstrapDatasetMappings(schema, mappingSpecs = []) {
    if (!Array.isArray(schema) || !Array.isArray(mappingSpecs)) {
        return [];
    }

    const defaults = new Map();
    schema.forEach((field) => {
        defaults.set(field.key, cloneValue(field.defaultValue, field.type));
    });

    return mappingSpecs.map((mapping) => {
        const defaultValue = defaults.has(mapping.key) ? defaults.get(mapping.key) : '';
        return { defaultValue, ...mapping };
    });
}

export function validateBootstrapConfig(schema, rawData = {}) {
    const warnings = [];
    if (!Array.isArray(schema)) {
        warnings.push('ブートストラップスキーマが不正です。空の設定を返します。');
        return { config: {}, warnings };
    }

    const config = {};
    schema.forEach((field) => {
        const { key, normalize } = field;
        const rawValue = rawData ? rawData[key] : undefined;
        const resolved = resolveExpectedValue(field, rawValue, warnings);
        if (typeof normalize === 'function') {
            try {
                config[key] = normalize(resolved);
            } catch (error) {
                warnings.push(`項目「${key}」の正規化に失敗しました。デフォルトを使用します。`);
                config[key] = cloneValue(field.defaultValue, field.type);
                console.warn(error);
            }
        } else {
            config[key] = resolved;
        }
    });

    return { config, warnings };
}

export function registerBootstrapConfigModule(target = typeof globalThis !== 'undefined' ? globalThis : undefined) {
    if (!target) {
        return null;
    }

    const namespace = target.galleryModules || (target.galleryModules = {});
    const module = {
        DEFAULT_BOOTSTRAP_SCHEMA,
        validateBootstrapConfig,
        buildBootstrapDatasetMappings
    };
    namespace.bootstrapConfig = module;
    return module;
}

registerBootstrapConfigModule();

(() => {
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

    window.galleryDataUtils = {
        sanitizeLevelList,
        normalizeLevelNumericValue,
        sortLevelsAscending
    };
})();

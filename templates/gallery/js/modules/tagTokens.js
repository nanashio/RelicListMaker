const TAG_SEPARATOR_PATTERN = /[\s,;、，　；]+/;

export function normalizeTagToken(value) {
    if (value == null) {
        return '';
    }
    const text = String(value).trim();
    return text;
}

export function parseTagTokens(source) {
    const rawList = Array.isArray(source)
        ? source
        : (function collectRawTokens() {
              const text = normalizeTagToken(source);
              if (!text) {
                  return [];
              }
              return text.split(TAG_SEPARATOR_PATTERN);
          })();

    const seen = new Set();
    const tokens = [];
    rawList.forEach((token) => {
        const normalized = normalizeTagToken(token);
        if (!normalized) {
            return;
        }
        const key = normalized.toLowerCase();
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        tokens.push(normalized);
    });

    return tokens;
}

export function formatTagTokens(source) {
    const tokens = parseTagTokens(source);
    if (!tokens.length) {
        return '';
    }
    return tokens.join(' ');
}

export function serializeTagTokens(source) {
    const tokens = parseTagTokens(source);
    if (!tokens.length) {
        return '';
    }
    return tokens.join(';');
}

export function registerTagTokenModule(target = typeof globalThis !== 'undefined' ? globalThis : undefined) {
    if (!target) {
        return null;
    }

    const namespace = target.galleryModules || (target.galleryModules = {});
    const module = {
        normalizeTagToken,
        parseTagTokens,
        formatTagTokens,
        serializeTagTokens
    };
    namespace.tagTokens = module;
    return module;
}

registerTagTokenModule();

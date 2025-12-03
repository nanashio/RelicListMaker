(() => {
    function defaultParseTagTokens(value) {
        if (Array.isArray(value)) {
            return value.slice();
        }
        if (value == null) {
            return [];
        }
        const text = String(value).trim();
        if (!text) {
            return [];
        }
        return text
            .split(/[\s,;、，　；]+/)
            .map((token) => token.trim())
            .filter((token) => token.length > 0);
    }

    function resolveDefaultParser(config = {}) {
        const namespace = typeof window !== 'undefined' && window ? window.galleryComponents : null;
        const sharedDefault = namespace && typeof namespace.defaultParseTagTokens === 'function'
            ? namespace.defaultParseTagTokens
            : null;
        if (typeof config.defaultParseTagTokens === 'function') {
            return config.defaultParseTagTokens;
        }
        if (sharedDefault) {
            return sharedDefault;
        }
        return defaultParseTagTokens;
    }

    function resolveTagTokenParsers(config = {}) {
        const namespace = typeof window !== 'undefined' && window ? window.galleryComponents : null;
        const tagTokenModule =
            config.tagTokenModule !== undefined
                ? config.tagTokenModule
                : (typeof window !== 'undefined' && window && window.galleryModules && window.galleryModules.tagTokens) ||
                  null;
        const resolveDefaultParseTagTokens =
            namespace && typeof namespace.resolveDefaultParseTagTokens === 'function'
                ? namespace.resolveDefaultParseTagTokens
                : null;
        const resolveTagTokenParserWithFallback =
            namespace && typeof namespace.resolveTagTokenParserWithFallback === 'function'
                ? namespace.resolveTagTokenParserWithFallback
                : null;

        const defaultParserCandidate = resolveDefaultParser({
            namespace,
            defaultParseTagTokens: config.defaultParseTagTokens
        });
        const defaultParseTokens = resolveDefaultParseTagTokens
            ? resolveDefaultParseTagTokens({ defaultParseTagTokens: defaultParserCandidate })
            : defaultParserCandidate;

        const parseTagTokens = resolveTagTokenParserWithFallback
            ? resolveTagTokenParserWithFallback({
                  parseTagTokens: config.parseTagTokens,
                  tagTokenModule,
                  defaultParseTagTokens: defaultParseTokens
              })
            : typeof config.parseTagTokens === 'function'
              ? config.parseTagTokens
              : tagTokenModule && typeof tagTokenModule.parseTagTokens === 'function'
                ? (value) => tagTokenModule.parseTagTokens(value)
                : defaultParseTokens;

        const formatTagTokens =
            typeof config.formatTagTokens === 'function'
                ? config.formatTagTokens
                : tagTokenModule && typeof tagTokenModule.formatTagTokens === 'function'
                  ? tagTokenModule.formatTagTokens
                  : (value) => (Array.isArray(value) ? value.join(' ') : parseTagTokens(value).join(' '));

        return { parseTagTokens, formatTagTokens, defaultParseTagTokens: defaultParseTokens, tagTokenModule };
    }

    if (!window.galleryComponents) {
        window.galleryComponents = {};
    }
    if (!window.galleryComponents.defaultParseTagTokens) {
        window.galleryComponents.defaultParseTagTokens = defaultParseTagTokens;
    }
    window.galleryComponents.resolveTagTokenParsers = resolveTagTokenParsers;
})();

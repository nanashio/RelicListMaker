(() => {
    function fallbackParseTagTokens(value) {
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

    function resolveDefaultParseTagTokensBridge(config = {}) {
        const namespace = typeof window !== 'undefined' && window ? window.galleryComponents : null;
        const resolver =
            namespace && typeof namespace.resolveDefaultParseTagTokens === 'function'
                ? namespace.resolveDefaultParseTagTokens
                : null;
        if (resolver) {
            try {
                return resolver({
                    defaultParseTagTokens: config.defaultParseTagTokens || fallbackParseTagTokens
                });
            } catch (error) {
                // fall through to fallback resolvers
            }
        }

        if (typeof config.defaultParseTagTokens === 'function') {
            return config.defaultParseTagTokens;
        }
        if (namespace && typeof namespace.defaultParseTagTokens === 'function') {
            return namespace.defaultParseTagTokens;
        }
        return fallbackParseTagTokens;
    }

    if (!window.galleryComponents) {
        window.galleryComponents = {};
    }
    if (typeof window.galleryComponents.defaultParseTagTokens !== 'function') {
        window.galleryComponents.defaultParseTagTokens = fallbackParseTagTokens;
    }
    window.galleryComponents.resolveDefaultParseTagTokensBridge = resolveDefaultParseTagTokensBridge;
})();

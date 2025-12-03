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

    function resolveDefaultParseTagTokens(namespace, defaultParseTagTokens) {
        const resolver =
            namespace && typeof namespace.resolveDefaultParseTagTokens === 'function'
                ? namespace.resolveDefaultParseTagTokens
                : null;

        if (resolver) {
            try {
                return resolver({ defaultParseTagTokens: defaultParseTagTokens || fallbackParseTagTokens });
            } catch (error) {
                // ignore and fall back
            }
        }

        if (typeof defaultParseTagTokens === 'function') {
            return defaultParseTagTokens;
        }
        if (namespace && typeof namespace.defaultParseTagTokens === 'function') {
            return namespace.defaultParseTagTokens;
        }
        return fallbackParseTagTokens;
    }

    function resolveTagTokenParsersWithDefaults(config = {}) {
        const namespace = typeof window !== 'undefined' && window ? window.galleryComponents : null;
        const tagTokenModule =
            config.tagTokenModule !== undefined
                ? config.tagTokenModule
                : (typeof window !== 'undefined' && window && window.galleryModules && window.galleryModules.tagTokens) ||
                  null;
        const defaultParseTokens = resolveDefaultParseTagTokens(namespace, config.defaultParseTagTokens);

        const resolverCandidates = [
            namespace && namespace.resolveTagTokenParsersOrFallback,
            namespace && namespace.resolveTagTokenParsersSharedOrDefault,
            namespace && namespace.resolveTagTokenParsers
        ].filter((resolver) => typeof resolver === 'function');

        for (const resolver of resolverCandidates) {
            try {
                const resolved = resolver({
                    ...config,
                    tagTokenModule,
                    defaultParseTagTokens: defaultParseTokens
                });
                if (resolved && typeof resolved.parseTagTokens === 'function') {
                    return {
                        ...resolved,
                        tagTokenModule: resolved.tagTokenModule !== undefined ? resolved.tagTokenModule : tagTokenModule,
                        defaultParseTagTokens:
                            resolved.defaultParseTagTokens !== undefined
                                ? resolved.defaultParseTagTokens
                                : defaultParseTokens
                    };
                }
            } catch (error) {
                // try next resolver
            }
        }

        const parseTagTokens =
            namespace && typeof namespace.resolveTagTokenParserWithFallback === 'function'
                ? namespace.resolveTagTokenParserWithFallback({
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
    if (typeof window.galleryComponents.defaultParseTagTokens !== 'function') {
        window.galleryComponents.defaultParseTagTokens = fallbackParseTagTokens;
    }
    window.galleryComponents.resolveTagTokenParsersWithDefaults = resolveTagTokenParsersWithDefaults;
})();

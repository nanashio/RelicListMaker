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
        const sharedFallback = (namespace && namespace.defaultParseTagTokens) || fallbackParseTagTokens;
        const resolver =
            namespace && typeof namespace.resolveDefaultParseTagTokensBridge === 'function'
                ? namespace.resolveDefaultParseTagTokensBridge
                : null;
        const sharedResolver =
            namespace && typeof namespace.resolveDefaultParseTagTokens === 'function'
                ? namespace.resolveDefaultParseTagTokens
                : null;

        const resolveWithFallback = (candidate) => {
            try {
                return candidate({ defaultParseTagTokens: defaultParseTagTokens || sharedFallback });
            } catch (error) {
                return null;
            }
        };

        const applyResolved = (resolved) => {
            if (resolved && namespace && typeof resolved === 'function') {
                namespace.defaultParseTagTokens = resolved;
            }
            return resolved;
        };

        if (resolver) {
            const resolved = applyResolved(resolveWithFallback(resolver));
            if (resolved) {
                return resolved;
            }
        }
        if (sharedResolver) {
            const resolved = applyResolved(resolveWithFallback(sharedResolver));
            if (resolved) {
                return resolved;
            }
        }

        const finalDefault = typeof defaultParseTagTokens === 'function' ? defaultParseTagTokens : sharedFallback;
        applyResolved(finalDefault);
        return finalDefault;
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

    function resolveTagTokenParsersBridgeOrFallback(config = {}) {
        const namespace = typeof window !== 'undefined' && window ? window.galleryComponents : null;
        const tagTokenModule =
            config.tagTokenModule !== undefined
                ? config.tagTokenModule
                : (typeof window !== 'undefined' && window && window.galleryModules && window.galleryModules.tagTokens) ||
                  null;
        const defaultParseTagTokens = resolveDefaultParseTagTokens(namespace, config.defaultParseTagTokens);
        const resolver =
            namespace && typeof namespace.resolveTagTokenParsersWithDefaults === 'function'
                ? namespace.resolveTagTokenParsersWithDefaults
                : resolveTagTokenParsersWithDefaults;

        function normalizeResolved(resolved = {}) {
            const parseTagTokens =
                typeof resolved.parseTagTokens === 'function'
                    ? resolved.parseTagTokens
                    : typeof config.parseTagTokens === 'function'
                      ? config.parseTagTokens
                      : tagTokenModule && typeof tagTokenModule.parseTagTokens === 'function'
                        ? (value) => tagTokenModule.parseTagTokens(value)
                        : defaultParseTagTokens;
            const formatTagTokens =
                typeof resolved.formatTagTokens === 'function'
                    ? resolved.formatTagTokens
                    : typeof config.formatTagTokens === 'function'
                      ? config.formatTagTokens
                      : tagTokenModule && typeof tagTokenModule.formatTagTokens === 'function'
                        ? tagTokenModule.formatTagTokens
                        : (value) => (Array.isArray(value) ? value.join(' ') : parseTagTokens(value).join(' '));

            const resolvedTagTokenModule =
                resolved.tagTokenModule !== undefined
                    ? resolved.tagTokenModule
                    : config.tagTokenModule !== undefined
                      ? config.tagTokenModule
                      : tagTokenModule;

            return {
                ...resolved,
                parseTagTokens,
                formatTagTokens,
                tagTokenModule: resolvedTagTokenModule,
                defaultParseTagTokens:
                    resolved.defaultParseTagTokens !== undefined
                        ? resolved.defaultParseTagTokens
                        : defaultParseTagTokens
            };
        }

        try {
            const resolved = resolver({ ...config, defaultParseTagTokens, tagTokenModule });
            if (resolved && typeof resolved.parseTagTokens === 'function') {
                return normalizeResolved(resolved);
            }
        } catch (error) {
            // fall through to the fallback normalization
        }

        return normalizeResolved();
    }

    if (!window.galleryComponents) {
        window.galleryComponents = {};
    }
    if (typeof window.galleryComponents.defaultParseTagTokens !== 'function') {
        window.galleryComponents.defaultParseTagTokens = fallbackParseTagTokens;
    }
    window.galleryComponents.resolveTagTokenParsersWithDefaults = resolveTagTokenParsersWithDefaults;
    window.galleryComponents.resolveTagTokenParsersBridgeOrFallback = resolveTagTokenParsersBridgeOrFallback;
})();

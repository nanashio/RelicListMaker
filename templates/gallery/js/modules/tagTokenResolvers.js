const TAG_SEPARATOR_PATTERN = /[\s,;、，　；]+/;

export function defaultParseTagTokens(value) {
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
        .split(TAG_SEPARATOR_PATTERN)
        .map((token) => token.trim())
        .filter((token) => token.length > 0);
}

function resolveDefaultParser({ defaultParseTagTokens: override, namespace }) {
    const sharedDefault = namespace && typeof namespace.defaultParseTagTokens === 'function'
        ? namespace.defaultParseTagTokens
        : null;
    if (typeof override === 'function') {
        return override;
    }
    if (sharedDefault) {
        return sharedDefault;
    }
    return defaultParseTagTokens;
}

export function resolveTagTokenParsers(config = {}) {
    const namespace =
        config.namespace !== undefined
            ? config.namespace
            : typeof globalThis !== 'undefined' && globalThis && globalThis.galleryComponents
              ? globalThis.galleryComponents
              : null;
    const tagTokenModule =
        config.tagTokenModule !== undefined
            ? config.tagTokenModule
            : typeof globalThis !== 'undefined' && globalThis && globalThis.galleryModules && globalThis.galleryModules.tagTokens
              ? globalThis.galleryModules.tagTokens
              : null;

    const resolveDefaultParseTagTokens =
        namespace && typeof namespace.resolveDefaultParseTagTokens === 'function'
            ? namespace.resolveDefaultParseTagTokens
            : null;
    const resolveTagTokenParserWithFallback =
        namespace && typeof namespace.resolveTagTokenParserWithFallback === 'function'
            ? namespace.resolveTagTokenParserWithFallback
            : null;

    const defaultParserCandidate = resolveDefaultParser({
        defaultParseTagTokens: config.defaultParseTagTokens,
        namespace
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

export function registerTagTokenResolversModule(target = typeof globalThis !== 'undefined' ? globalThis : undefined) {
    if (!target) {
        return null;
    }

    const module = { defaultParseTagTokens, resolveTagTokenParsers };
    const windowRef = typeof target.window !== 'undefined' ? target.window : null;
    const moduleNamespace =
        (windowRef && windowRef.galleryModules) || target.galleryModules || (target.galleryModules = {});
    moduleNamespace.tagTokenResolvers = module;

    const componentNamespace =
        (windowRef && windowRef.galleryComponents) || target.galleryComponents || (target.galleryComponents = {});
    if (!componentNamespace.defaultParseTagTokens) {
        componentNamespace.defaultParseTagTokens = defaultParseTagTokens;
    }
    componentNamespace.resolveTagTokenParsers = resolveTagTokenParsers;

    if (windowRef) {
        if (!windowRef.galleryModules) {
            windowRef.galleryModules = moduleNamespace;
        }
        if (!windowRef.galleryComponents) {
            windowRef.galleryComponents = componentNamespace;
        }
        windowRef.galleryModules.tagTokenResolvers = module;
        if (!windowRef.galleryComponents.defaultParseTagTokens) {
            windowRef.galleryComponents.defaultParseTagTokens = defaultParseTagTokens;
        }
        windowRef.galleryComponents.resolveTagTokenParsers = resolveTagTokenParsers;
    }

    return module;
}

registerTagTokenResolversModule();

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

    function resolveTagTokenParsers(namespace, config = {}) {
        const resolveTagTokenParsersWithDefaultsFn =
            namespace && typeof namespace.resolveTagTokenParsersWithDefaults === 'function'
                ? namespace.resolveTagTokenParsersWithDefaults
                : null;
        const resolveTagTokenParsersOrFallbackFn =
            namespace && typeof namespace.resolveTagTokenParsersOrFallback === 'function'
                ? namespace.resolveTagTokenParsersOrFallback
                : null;
        const resolveDefaultParseTagTokens =
            namespace && typeof namespace.resolveDefaultParseTagTokensBridge === 'function'
                ? namespace.resolveDefaultParseTagTokensBridge
                : null;

        const sharedFallback =
            (namespace && typeof namespace.defaultParseTagTokens === 'function' && namespace.defaultParseTagTokens) ||
            fallbackParseTagTokens;

        const defaultParseTokens = resolveDefaultParseTagTokens
            ? resolveDefaultParseTagTokens({ defaultParseTagTokens: config.defaultParseTagTokens })
            : typeof config.defaultParseTagTokens === 'function'
              ? config.defaultParseTagTokens
              : sharedFallback;

        function normalizeResolverResult(resolvedConfig = {}) {
            const parseTagTokens =
                typeof resolvedConfig.parseTagTokens === 'function'
                    ? resolvedConfig.parseTagTokens
                    : typeof config.parseTagTokens === 'function'
                      ? config.parseTagTokens
                      : defaultParseTokens;
            const formatTagTokens =
                typeof resolvedConfig.formatTagTokens === 'function'
                    ? resolvedConfig.formatTagTokens
                    : typeof config.formatTagTokens === 'function'
                      ? config.formatTagTokens
                      : (value) => (Array.isArray(value) ? value.join(' ') : parseTagTokens(value).join(' '));

            return {
                ...resolvedConfig,
                parseTagTokens,
                formatTagTokens,
                defaultParseTagTokens:
                    resolvedConfig.defaultParseTagTokens !== undefined
                        ? resolvedConfig.defaultParseTagTokens
                        : defaultParseTokens
            };
        }

        const resolverConfig = {
            ...config,
            defaultParseTagTokens: defaultParseTokens
        };

        if (resolveTagTokenParsersWithDefaultsFn) {
            try {
                const resolved = resolveTagTokenParsersWithDefaultsFn(resolverConfig);
                if (resolved && typeof resolved.parseTagTokens === 'function') {
                    return normalizeResolverResult(resolved);
                }
            } catch (error) {
                // fall through to other resolvers
            }
        }

        if (resolveTagTokenParsersOrFallbackFn) {
            try {
                const resolved = resolveTagTokenParsersOrFallbackFn(resolverConfig);
                if (resolved && typeof resolved.parseTagTokens === 'function') {
                    return normalizeResolverResult(resolved);
                }
            } catch (error) {
                // fall through to local fallback
            }
        }

        return normalizeResolverResult({});
    }

    function createFallbackFormatter(formatTagTokens, parseTagTokens) {
        return (value) => {
            if (Array.isArray(value)) {
                return formatTagTokens(value);
            }
            return formatTagTokens(parseTagTokens(value));
        };
    }

    function createTagInputController(config = {}) {
        const {
            TomSelect: TomSelectClass = (typeof window !== 'undefined' && window ? window.TomSelect : null),
            createTomSelectAdapter: createTomSelectAdapterConfig,
            parseTagTokens: parseTokensConfig,
            formatTagTokens: formatTokensConfig,
            documentRef = typeof document !== 'undefined' ? document : null,
            isDebugEnabled
        } = config;

        const namespace = typeof window !== 'undefined' && window ? window.galleryComponents : null;
        const resolveTagDebugResolver =
            namespace && typeof namespace.resolveTagDebugResolverSharedOrDefault === 'function'
                ? namespace.resolveTagDebugResolverSharedOrDefault
                : null;
        const resolveTomSelectAdapter =
            namespace && typeof namespace.resolveSharedTomSelectAdapterOrDefault === 'function'
                ? namespace.resolveSharedTomSelectAdapterOrDefault
                : null;

        const { parseTagTokens, formatTagTokens, defaultParseTagTokens: resolvedDefaultParseTokens } = resolveTagTokenParsers(
            namespace,
            {
                parseTagTokens: parseTokensConfig,
                formatTagTokens: formatTokensConfig,
                defaultParseTagTokens: config.defaultParseTagTokens,
                tagTokenModule: config.tagTokenModule
            }
        );

        const defaultParseTokens = resolvedDefaultParseTokens || fallbackParseTagTokens;
        const fallbackFormatter = createFallbackFormatter(formatTagTokens, parseTagTokens);

        const hasDom = Boolean(documentRef && typeof documentRef.createElement === 'function');
        const isTagDebugEnabled = resolveTagDebugResolver
            ? resolveTagDebugResolver({ isDebugEnabled })
            : () => false;
        const tomSelectAdapter = resolveTomSelectAdapter
            ? resolveTomSelectAdapter({
                  resolveTomSelectAdapter: config.resolveTomSelectAdapter,
                  createTomSelectAdapter: createTomSelectAdapterConfig,
                  createDefaultTomSelectAdapter: config.createDefaultTomSelectAdapter,
                  TomSelect: TomSelectClass,
                  documentRef,
                  isDebugEnabled
              })
            : null;

        if (!hasDom || !tomSelectAdapter || !tomSelectAdapter.hasSupport) {
            return {
                usesNativeInput: true,
                enhanceInput() {},
                syncValue(input, tokens) {
                    if (!input) {
                        return;
                    }
                    const text = fallbackFormatter(tokens);
                    if (input.value !== text) {
                        input.value = text;
                    }
                }
            };
        }

        const instances = new WeakMap();

        function createLoggers(debugLabel) {
            const logInfo = (eventName, payload) => {
                if (!isTagDebugEnabled()) {
                    return;
                }
                if (typeof console !== 'undefined' && console.info) {
                    console.info(`[gallery][tags][${debugLabel}] ${eventName}`, payload);
                }
            };
            const logDebug = (eventName, payload) => {
                if (!isTagDebugEnabled()) {
                    return;
                }
                if (typeof console !== 'undefined' && console.debug) {
                    console.debug(`[gallery][tags][${debugLabel}] ${eventName}`, payload);
                }
            };
            return { logInfo, logDebug };
        }

        function ensureInstance(input) {
            if (!input) {
                return null;
            }
            if (instances.has(input)) {
                return instances.get(input);
            }
            const container = typeof input.closest === 'function' ? input.closest('.item-tags-control') : null;
            if (container) {
                container.dataset.tagInputRoot = 'true';
            }
            input.dataset.tagInputEnhanced = 'true';
            const debugLabel = input.dataset && input.dataset.recordIndex
                ? `record-${input.dataset.recordIndex}`
                : input.id || input.name || 'tags';
            const loggers = createLoggers(debugLabel);
            const instance = tomSelectAdapter.createInstance(
                input,
                {
                    delimiter: ';',
                    placeholder: input.getAttribute('placeholder') || 'タグを入力 (Enter で確定)',
                    inputAriaLabel: 'タグを入力',
                    create: true,
                    createOnBlur: true,
                    createFilter(value) {
                        const tokens = parseTagTokens(value);
                        return tokens.length === 1;
                    }
                },
                {
                    debugLabel,
                    loggers,
                    logEvents: ['change', 'item_add', 'item_remove']
                }
            );
            if (!instance) {
                return null;
            }
            instances.set(input, instance);
            tomSelectAdapter.registerNativeLogging(input, { debugLabel, loggers });
            return instance;
        }

        return {
            usesNativeInput: false,
            enhanceInput(input) {
                ensureInstance(input);
            },
            syncValue(input, tokens) {
                const instance = ensureInstance(input);
                const nextTokens = Array.isArray(tokens) ? tokens : parseTagTokens(tokens);
                if (tomSelectAdapter.setValue(instance, nextTokens)) {
                    return;
                }
                if (!input) {
                    return;
                }
                const text = fallbackFormatter(tokens);
                if (input.value !== text) {
                    input.value = text;
                }
            }
        };
    }

    if (!window.galleryComponents) {
        window.galleryComponents = {};
    }
    window.galleryComponents.createTagInputController = createTagInputController;
})();

(() => {
    function getDebugFlagFromStorage(storage) {
        if (!storage || typeof storage.getItem !== 'function') {
            return null;
        }
        try {
            return storage.getItem('galleryDebugTags');
        } catch (error) {
            return null;
        }
    }

    function defaultIsTagDebugEnabled() {
        if (typeof window === 'undefined' || !window) {
            return false;
        }
        if (typeof window.galleryDebugTags !== 'undefined') {
            return Boolean(window.galleryDebugTags);
        }

        const storedFlag = getDebugFlagFromStorage(window.localStorage);
        return storedFlag === 'true';
    }

    function resolveDefaultDebugFlag(namespaceDefaultResolver = null) {
        if (typeof namespaceDefaultResolver === 'function') {
            try {
                return Boolean(namespaceDefaultResolver());
            } catch (error) {
                return defaultIsTagDebugEnabled();
            }
        }
        return defaultIsTagDebugEnabled();
    }

    function resolveSharedTagDebugResolver(config = {}) {
        return resolveTagDebugResolverWithFallback(config);
    }

    function resolveTagDebugResolverWithFallback(config = {}) {
        const namespace = typeof window !== 'undefined' && window ? window.galleryComponents : null;
        const resolver =
            namespace && typeof namespace.resolveTagDebugResolver === 'function'
                ? namespace.resolveTagDebugResolver
                : null;
        const namespaceDefaultResolver =
            namespace && typeof namespace.defaultIsTagDebugEnabled === 'function'
                ? namespace.defaultIsTagDebugEnabled
                : null;

        if (resolver) {
            try {
                const resolved = resolver(config);
                if (typeof resolved === 'function') {
                    return () => {
                        try {
                            return Boolean(resolved());
                        } catch (error) {
                            return resolveDefaultDebugFlag(namespaceDefaultResolver);
                        }
                    };
                }
            } catch (error) {
                // fall through to the default resolver
            }
        }

        const { isDebugEnabled } = config;
        return () => {
            if (typeof isDebugEnabled === 'function') {
                try {
                    return Boolean(isDebugEnabled());
                } catch (error) {
                    return resolveDefaultDebugFlag(namespaceDefaultResolver);
                }
            }
            return resolveDefaultDebugFlag(namespaceDefaultResolver);
        };
    }

    function resolveSharedTomSelectAdapterWithDebug(config = {}) {
        const namespace = typeof window !== 'undefined' && window ? window.galleryComponents : null;
        const sharedResolver =
            namespace && typeof namespace.resolveSharedTomSelectAdapter === 'function'
                ? namespace.resolveSharedTomSelectAdapter
                : null;
        const resolverWithResolver =
            namespace && typeof namespace.resolveTomSelectAdapterWithResolver === 'function'
                ? namespace.resolveTomSelectAdapterWithResolver
                : null;
        const resolverBasic =
            namespace && typeof namespace.resolveTomSelectAdapter === 'function'
                ? namespace.resolveTomSelectAdapter
                : null;
        const defaultFactory =
            typeof config.createDefaultTomSelectAdapter === 'function'
                ? config.createDefaultTomSelectAdapter
                : namespace && typeof namespace.createDefaultTomSelectAdapter === 'function'
                  ? namespace.createDefaultTomSelectAdapter
                  : null;
        const isDebugEnabled = resolveTagDebugResolverWithFallback({ isDebugEnabled: config.isDebugEnabled });

        const adapterConfig = {
            resolveTomSelectAdapter: config.resolveTomSelectAdapter,
            createTomSelectAdapter: config.createTomSelectAdapter,
            createDefaultTomSelectAdapter: defaultFactory,
            TomSelect: config.TomSelect,
            documentRef: config.documentRef,
            isDebugEnabled
        };

        const resolverCandidates = [sharedResolver, resolverWithResolver, resolverBasic].filter(
            (resolver) => typeof resolver === 'function'
        );

        for (const resolver of resolverCandidates) {
            try {
                const adapter = resolver(adapterConfig);
                if (adapter) {
                    return adapter;
                }
            } catch (error) {
                // try next resolver
            }
        }

        if (typeof defaultFactory === 'function') {
            return defaultFactory(config.TomSelect, config.documentRef);
        }

        return null;
    }

    function resolveTagDebugResolverSharedOrDefault(config = {}) {
        const namespace = typeof window !== 'undefined' && window ? window.galleryComponents : null;
        const resolverCandidates = [
            namespace && namespace.resolveTagDebugResolverWithFallback,
            namespace && namespace.resolveSharedTagDebugResolver,
            resolveTagDebugResolverWithFallback
        ].filter((resolver) => typeof resolver === 'function');
        const namespaceDefaultResolver =
            typeof namespace?.defaultIsTagDebugEnabled === 'function' ? namespace.defaultIsTagDebugEnabled : null;

        for (const resolver of resolverCandidates) {
            try {
                const resolved = resolver(config);
                if (typeof resolved === 'function') {
                    return () => {
                        try {
                            return Boolean(resolved());
                        } catch (error) {
                            return resolveDefaultDebugFlag(namespaceDefaultResolver);
                        }
                    };
                }
            } catch (error) {
                // try next resolver
            }
        }

        return () => {
            const { isDebugEnabled } = config;
            if (typeof isDebugEnabled === 'function') {
                try {
                    return Boolean(isDebugEnabled());
                } catch (error) {
                    return resolveDefaultDebugFlag(namespaceDefaultResolver);
                }
            }
            return resolveDefaultDebugFlag(namespaceDefaultResolver);
        };
    }

    function resolveSharedTomSelectAdapterOrDefault(config = {}) {
        const namespace = typeof window !== 'undefined' && window ? window.galleryComponents : null;
        const resolver =
            namespace && typeof namespace.resolveSharedTomSelectAdapterWithDebug === 'function'
                ? namespace.resolveSharedTomSelectAdapterWithDebug
                : resolveSharedTomSelectAdapterWithDebug;

        try {
            const adapter = resolver(config);
            if (adapter) {
                return adapter;
            }
        } catch (error) {
            // fall through to the default factory
        }

        const defaultFactory =
            typeof config.createDefaultTomSelectAdapter === 'function'
                ? config.createDefaultTomSelectAdapter
                : namespace && typeof namespace.createDefaultTomSelectAdapter === 'function'
                  ? namespace.createDefaultTomSelectAdapter
                  : null;

        if (typeof defaultFactory === 'function') {
            return defaultFactory(config.TomSelect, config.documentRef);
        }

        return null;
    }

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

    function resolveDefaultParseTagTokens(config = {}) {
        const namespace = typeof window !== 'undefined' && window ? window.galleryComponents : null;
        const fallbackParser =
            typeof config.defaultParseTagTokens === 'function' ? config.defaultParseTagTokens : defaultParseTagTokens;
        const sharedDefault =
            namespace && typeof namespace.defaultParseTagTokens === 'function'
                ? namespace.defaultParseTagTokens
                : null;

        return typeof sharedDefault === 'function' ? sharedDefault : fallbackParser;
    }

    function resolveTagTokenParsersSharedOrDefault(config = {}) {
        const namespace = typeof window !== 'undefined' && window ? window.galleryComponents : null;
        const resolver =
            namespace && typeof namespace.resolveTagTokenParsers === 'function'
                ? namespace.resolveTagTokenParsers
                : null;
        const parseResolver =
            namespace && typeof namespace.resolveTagTokenParserWithFallback === 'function'
                ? namespace.resolveTagTokenParserWithFallback
                : resolveTagTokenParserWithFallback;
        const tagTokenModule =
            config.tagTokenModule !== undefined
                ? config.tagTokenModule
                : (typeof window !== 'undefined' && window && window.galleryModules && window.galleryModules.tagTokens) ||
                  null;

        const defaultParseTokens = resolveDefaultParseTagTokens({ defaultParseTagTokens: config.defaultParseTagTokens });

        if (resolver) {
            try {
                const resolved = resolver({
                    ...config,
                    defaultParseTagTokens: defaultParseTokens,
                    tagTokenModule
                });
                if (resolved && typeof resolved.parseTagTokens === 'function') {
                    return resolved;
                }
            } catch (error) {
                // fall through to fallback resolver
            }
        }

        const parseTagTokens = parseResolver
            ? parseResolver({
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

    function resolveTagTokenParserWithFallback(config = {}) {
        const namespace = typeof window !== 'undefined' && window ? window.galleryComponents : null;
        const tagTokenModule =
            config.tagTokenModule !== undefined
                ? config.tagTokenModule
                : (typeof window !== 'undefined' && window && window.galleryModules && window.galleryModules.tagTokens) ||
                  null;
        const defaultParser = resolveDefaultParseTagTokens({ defaultParseTagTokens: config.defaultParseTagTokens });

        if (typeof config.parseTagTokens === 'function') {
            return config.parseTagTokens;
        }
        if (tagTokenModule && typeof tagTokenModule.parseTagTokens === 'function') {
            return (value) => tagTokenModule.parseTagTokens(value);
        }

        return defaultParser;
    }

    function resolveTagTokenParsersOrFallback(config = {}) {
        const namespace = typeof window !== 'undefined' && window ? window.galleryComponents : null;
        const resolverCandidates = [
            namespace && namespace.resolveTagTokenParsersSharedOrDefault,
            namespace && namespace.resolveTagTokenParsers,
            resolveTagTokenParsersSharedOrDefault
        ].filter((resolver) => typeof resolver === 'function');

        const tagTokenModule =
            config.tagTokenModule !== undefined
                ? config.tagTokenModule
                : (typeof window !== 'undefined' && window && window.galleryModules && window.galleryModules.tagTokens) ||
                  null;

        const defaultParseTokens = resolveDefaultParseTagTokens({
            defaultParseTagTokens: config.defaultParseTagTokens
        });

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
                        tagTokenModule:
                            resolved.tagTokenModule !== undefined ? resolved.tagTokenModule : tagTokenModule,
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

        const parseTagTokens = resolveTagTokenParserWithFallback({
            parseTagTokens: config.parseTagTokens,
            tagTokenModule,
            defaultParseTagTokens: defaultParseTokens
        });

        const formatTagTokens =
            typeof config.formatTagTokens === 'function'
                ? config.formatTagTokens
                : tagTokenModule && typeof tagTokenModule.formatTagTokens === 'function'
                  ? tagTokenModule.formatTagTokens
                  : (value) => (Array.isArray(value) ? value.join(' ') : parseTagTokens(value).join(' '));

        return { parseTagTokens, formatTagTokens, defaultParseTagTokens: defaultParseTokens, tagTokenModule };
    }

    function createTagSearchControllerFallback(config = {}) {
        const {
            input = null,
            parseTagTokens = defaultParseTagTokens,
            adapter = null,
            documentRef = typeof document !== 'undefined' ? document : null
        } = config;

        const changeHandlers = [];
        let instance = null;
        const hasDom = Boolean(documentRef && typeof documentRef.createElement === 'function');
        const targetInput = input;

        function ensureInstance() {
            if (!adapter || !adapter.hasSupport || !targetInput) {
                return null;
            }
            if (instance) {
                return instance;
            }
            if (targetInput && typeof targetInput.setAttribute === 'function') {
                targetInput.setAttribute('multiple', 'multiple');
            }
            instance = adapter.createInstance(
                targetInput,
                {
                    maxItems: null,
                    create: false,
                    persist: false,
                    valueField: 'value',
                    labelField: 'text',
                    searchField: ['text'],
                    closeAfterSelect: false,
                    plugins: ['remove_button']
                },
                { debugLabel: 'tag-search', logEvents: ['change'] }
            );
            changeHandlers.forEach((handler) => adapter.onChange(instance, targetInput, handler));
            return instance;
        }

        function setOptions(options = [], { clearSelection = false } = {}) {
            const normalizedOptions = Array.isArray(options) ? options : [];
            const inst = ensureInstance();
            if (adapter) {
                adapter.syncOptions(inst, targetInput, normalizedOptions, { clearSelection });
                return;
            }
            if (!hasDom || !targetInput) {
                return;
            }
            while (targetInput.firstChild) {
                targetInput.removeChild(targetInput.firstChild);
            }
            normalizedOptions.forEach((option) => {
                const value = option && option.value ? String(option.value).trim() : '';
                if (!value) {
                    return;
                }
                const node = documentRef.createElement('option');
                node.value = value;
                node.textContent = option.text || value;
                targetInput.appendChild(node);
            });
            if (clearSelection) {
                targetInput.selectedIndex = -1;
            }
        }

        function getValues() {
            const inst = ensureInstance();
            if (adapter) {
                return adapter.getValues(inst, targetInput, parseTagTokens);
            }
            if (targetInput && targetInput.selectedOptions) {
                return Array.from(targetInput.selectedOptions)
                    .map((option) => option.value)
                    .filter((value) => value);
            }
            const text = targetInput && targetInput.value ? targetInput.value : '';
            return parseTagTokens(text);
        }

        function onChange(handler) {
            if (typeof handler !== 'function') {
                return;
            }
            changeHandlers.push(handler);
            const inst = ensureInstance();
            if (adapter) {
                adapter.onChange(inst, targetInput, handler);
                return;
            }
            if (targetInput && typeof targetInput.addEventListener === 'function') {
                targetInput.addEventListener('change', handler);
            }
        }

        function clearSelection() {
            const inst = ensureInstance();
            if (adapter) {
                adapter.clearSelection(inst, targetInput);
                return;
            }
            if (targetInput) {
                if (typeof targetInput.selectedIndex === 'number') {
                    targetInput.selectedIndex = -1;
                }
                targetInput.value = '';
            }
        }

        return { setOptions, getValues, onChange, clearSelection };
    }

    function resolveTagSearchControllerWithFallback(config = {}) {
        const namespace = typeof window !== 'undefined' && window ? window.galleryComponents : null;
        const resolveTagTokenParsersOrFallbackFn =
            namespace && typeof namespace.resolveTagTokenParsersOrFallback === 'function'
                ? namespace.resolveTagTokenParsersOrFallback
                : resolveTagTokenParsersOrFallback;
        const documentRef =
            config.documentRef !== undefined
                ? config.documentRef
                : typeof document !== 'undefined'
                  ? document
                  : null;
        const tagTokenParsers = resolveTagTokenParsersOrFallbackFn
            ? resolveTagTokenParsersOrFallbackFn({
                  parseTagTokens: config.parseTagTokens,
                  defaultParseTagTokens: config.defaultParseTagTokens || defaultParseTagTokens,
                  tagTokenModule: config.tagTokenModule
              })
            : null;
        const parseTokens =
            tagTokenParsers && typeof tagTokenParsers.parseTagTokens === 'function'
                ? tagTokenParsers.parseTagTokens
                : resolveTagTokenParserWithFallback({
                      parseTagTokens: config.parseTagTokens,
                      tagTokenModule: config.tagTokenModule,
                      defaultParseTagTokens: config.defaultParseTagTokens
                  });
        const resolveTagDebugResolver =
            namespace && typeof namespace.resolveTagDebugResolverSharedOrDefault === 'function'
                ? namespace.resolveTagDebugResolverSharedOrDefault
                : resolveTagDebugResolverSharedOrDefault;
        const resolveTomSelectAdapter =
            namespace && typeof namespace.resolveSharedTomSelectAdapterOrDefault === 'function'
                ? namespace.resolveSharedTomSelectAdapterOrDefault
                : resolveSharedTomSelectAdapterOrDefault;

        const controllerFactory =
            typeof config.createTagSearchController === 'function'
                ? config.createTagSearchController
                : namespace && typeof namespace.createTagSearchController === 'function'
                  ? namespace.createTagSearchController
                  : null;

        const adapter = resolveTomSelectAdapter
            ? resolveTomSelectAdapter({
                  resolveTomSelectAdapter: config.resolveTomSelectAdapter,
                  createTomSelectAdapter: config.createTomSelectAdapter,
                  createDefaultTomSelectAdapter: config.createDefaultTomSelectAdapter,
                  TomSelect:
                      config.TomSelect || (typeof window !== 'undefined' && window ? window.TomSelect : null),
                  documentRef,
                  isDebugEnabled: resolveTagDebugResolver
                      ? resolveTagDebugResolver({ isDebugEnabled: config.isDebugEnabled })
                      : () => false
              })
            : null;

        if (controllerFactory) {
            try {
                const controller = controllerFactory({
                    input: config.input,
                    parseTagTokens: parseTokens,
                    resolveTomSelectAdapter: config.resolveTomSelectAdapter,
                    createTomSelectAdapter: config.createTomSelectAdapter,
                    createDefaultTomSelectAdapter: config.createDefaultTomSelectAdapter,
                    TomSelect: config.TomSelect,
                    documentRef,
                    isDebugEnabled: config.isDebugEnabled
                });
                if (controller) {
                    return controller;
                }
            } catch (error) {
                // fall back to the adapter or native implementation
            }
        }

        return createTagSearchControllerFallback({
            input: config.input,
            parseTagTokens: parseTokens,
            adapter,
            documentRef
        });
    }

    if (!window.galleryComponents) {
        window.galleryComponents = {};
    }

    window.galleryComponents.resolveTagDebugResolverWithFallback = resolveTagDebugResolverWithFallback;
    window.galleryComponents.resolveSharedTagDebugResolver = resolveSharedTagDebugResolver;
    window.galleryComponents.resolveSharedTomSelectAdapterWithDebug = resolveSharedTomSelectAdapterWithDebug;
    window.galleryComponents.resolveTagDebugResolverSharedOrDefault = resolveTagDebugResolverSharedOrDefault;
    window.galleryComponents.resolveSharedTomSelectAdapterOrDefault = resolveSharedTomSelectAdapterOrDefault;
    window.galleryComponents.resolveDefaultParseTagTokens = resolveDefaultParseTagTokens;
    window.galleryComponents.resolveTagTokenParsersSharedOrDefault = resolveTagTokenParsersSharedOrDefault;
    window.galleryComponents.resolveTagTokenParsersOrFallback = resolveTagTokenParsersOrFallback;
    window.galleryComponents.resolveTagTokenParserWithFallback = resolveTagTokenParserWithFallback;
    window.galleryComponents.resolveTagSearchControllerWithFallback = resolveTagSearchControllerWithFallback;
    window.galleryComponents.defaultParseTagTokens = defaultParseTagTokens;
})();

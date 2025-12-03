(() => {
    function createTagSearchController(config = {}) {
        const {
            input = null,
            parseTagTokens: parseTokensConfig,
            resolveTomSelectAdapter,
            createTomSelectAdapter,
            createDefaultTomSelectAdapter,
            TomSelect = typeof window !== 'undefined' && window ? window.TomSelect : null,
            documentRef = typeof document !== 'undefined' ? document : null,
            isDebugEnabled
        } = config;

        const namespace = typeof window !== 'undefined' && window ? window.galleryComponents : null;
        const resolveDefaultParseTagTokens =
            namespace && typeof namespace.resolveDefaultParseTagTokens === 'function'
                ? namespace.resolveDefaultParseTagTokens
                : null;
        const resolveTagTokenParserWithFallback =
            namespace && typeof namespace.resolveTagTokenParserWithFallback === 'function'
                ? namespace.resolveTagTokenParserWithFallback
                : null;

        const defaultParseTagTokens = resolveDefaultParseTagTokens
            ? resolveDefaultParseTagTokens({ defaultParseTagTokens: config.defaultParseTagTokens })
            : typeof namespace?.defaultParseTagTokens === 'function'
              ? namespace.defaultParseTagTokens
              : typeof config.defaultParseTagTokens === 'function'
                ? config.defaultParseTagTokens
                : (value) => {
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
                };

        function resolveTagTokenParsersBridge() {
            const tagTokenModule =
                config.tagTokenModule !== undefined
                    ? config.tagTokenModule
                    : (typeof window !== 'undefined' && window && window.galleryModules && window.galleryModules.tagTokens) ||
                      null;

            const resolverCandidates = [
                namespace && namespace.resolveTagTokenParsersOrFallback,
                namespace && namespace.resolveTagTokenParsersSharedOrDefault,
                namespace && namespace.resolveTagTokenParsers
            ].filter((resolver) => typeof resolver === 'function');

            for (const resolver of resolverCandidates) {
                try {
                    const resolved = resolver({
                        parseTagTokens: parseTokensConfig,
                        formatTagTokens: null,
                        defaultParseTagTokens,
                        tagTokenModule: config.tagTokenModule
                    });
                    if (resolved && typeof resolved.parseTagTokens === 'function') {
                        return {
                            ...resolved,
                            tagTokenModule: resolved.tagTokenModule !== undefined ? resolved.tagTokenModule : tagTokenModule,
                            defaultParseTagTokens:
                                resolved.defaultParseTagTokens !== undefined
                                    ? resolved.defaultParseTagTokens
                                    : defaultParseTagTokens
                        };
                    }
                } catch (error) {
                    // continue to next resolver
                }
            }

            const parseTagTokens = resolveTagTokenParserWithFallback
                ? resolveTagTokenParserWithFallback({
                      parseTagTokens: parseTokensConfig,
                      tagTokenModule,
                      defaultParseTagTokens
                  })
                : typeof parseTokensConfig === 'function'
                  ? parseTokensConfig
                  : tagTokenModule && typeof tagTokenModule.parseTagTokens === 'function'
                    ? (value) => tagTokenModule.parseTagTokens(value)
                    : defaultParseTagTokens;

            return { parseTagTokens, defaultParseTagTokens, tagTokenModule };
        }

        const { parseTagTokens } = resolveTagTokenParsersBridge();
        const resolveTagDebugResolver =
            namespace && typeof namespace.resolveTagDebugResolverSharedOrDefault === 'function'
                ? namespace.resolveTagDebugResolverSharedOrDefault
                : null;
        const resolveTomSelectAdapterBridge =
            namespace && typeof namespace.resolveSharedTomSelectAdapterOrDefault === 'function'
                ? namespace.resolveSharedTomSelectAdapterOrDefault
                : null;

        const adapter = resolveTomSelectAdapterBridge
            ? resolveTomSelectAdapterBridge({
                  resolveTomSelectAdapter,
                  createTomSelectAdapter,
                  createDefaultTomSelectAdapter,
                  TomSelect,
                  documentRef,
                  isDebugEnabled: resolveTagDebugResolver
                      ? resolveTagDebugResolver({ isDebugEnabled })
                      : () => false
              })
            : null;

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
            if (hasDom && targetInput) {
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

    if (!window.galleryComponents) {
        window.galleryComponents = {};
    }
    window.galleryComponents.createTagSearchController = createTagSearchController;
})();

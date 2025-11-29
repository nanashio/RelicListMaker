(() => {
    function resolveAdapterResolver(resolverConfig) {
        if (typeof resolverConfig === 'function') {
            return resolverConfig;
        }
        const namespace = typeof window !== 'undefined' && window ? window.galleryComponents : null;
        if (namespace && typeof namespace.resolveTomSelectAdapter === 'function') {
            return namespace.resolveTomSelectAdapter;
        }
        return null;
    }

    function resolveAdapterFactory(factoryConfig) {
        if (typeof factoryConfig === 'function') {
            return factoryConfig;
        }
        const namespace = typeof window !== 'undefined' && window ? window.galleryComponents : null;
        if (namespace && typeof namespace.createTomSelectAdapter === 'function') {
            return namespace.createTomSelectAdapter;
        }
        return null;
    }

    function createDefaultTomSelectAdapterFallback(TomSelectClass, documentRef) {
        const hasDom = Boolean(documentRef && typeof documentRef.createElement === 'function');
        const hasTomSelect = typeof TomSelectClass === 'function';

        if (!hasDom || !hasTomSelect) {
            return null;
        }

        function createInstance(input, options = {}) {
            if (!input) {
                return null;
            }
            return new TomSelectClass(input, options);
        }

        function syncOptions(instance, input, options = [], { clearSelection = false } = {}) {
            const normalizedOptions = Array.isArray(options) ? options : [];
            if (instance && typeof instance.clearOptions === 'function') {
                if (clearSelection && typeof instance.clear === 'function') {
                    instance.clear(true);
                }
                instance.clearOptions();
                normalizedOptions.forEach((option) => instance.addOption(option));
                if (typeof instance.refreshOptions === 'function') {
                    instance.refreshOptions(false);
                }
                return;
            }

            if (!hasDom || !input) {
                return;
            }
            while (input.firstChild) {
                input.removeChild(input.firstChild);
            }
            normalizedOptions.forEach((option) => {
                const value = option && option.value ? String(option.value).trim() : '';
                if (!value) {
                    return;
                }
                const node = documentRef.createElement('option');
                node.value = value;
                node.textContent = option.text || value;
                input.appendChild(node);
            });
            if (clearSelection) {
                input.selectedIndex = -1;
            }
        }

        function clearSelection(instance, input) {
            if (instance && typeof instance.clear === 'function') {
                instance.clear(true);
                return;
            }
            if (input) {
                if (typeof input.selectedIndex === 'number') {
                    input.selectedIndex = -1;
                }
                input.value = '';
            }
        }

        function getValues(instance, input, parseTokens) {
            if (instance && typeof instance.getValue === 'function') {
                const value = instance.getValue();
                if (Array.isArray(value)) {
                    return value.slice();
                }
                if (typeof value === 'string') {
                    return value ? [value] : [];
                }
            }

            if (input && input.selectedOptions) {
                return Array.from(input.selectedOptions)
                    .map((option) => option.value)
                    .filter((value) => value);
            }
            const text = input && input.value ? input.value : '';
            if (typeof parseTokens === 'function') {
                return parseTokens(text);
            }
            return text ? [text] : [];
        }

        function onChange(instance, input, handler) {
            if (typeof handler !== 'function') {
                return;
            }
            if (instance && typeof instance.on === 'function') {
                instance.on('change', handler);
                return;
            }
            if (input && typeof input.addEventListener === 'function') {
                input.addEventListener('change', handler);
            }
        }

        function setValue(instance, tokens) {
            if (instance && typeof instance.setValue === 'function') {
                instance.setValue(tokens, true);
                return true;
            }
            return false;
        }

        return {
            hasSupport: true,
            createInstance,
            syncOptions,
            clearSelection,
            getValues,
            onChange,
            setValue,
            registerNativeLogging() {}
        };
    }

    function resolveDefaultFactory(defaultFactoryConfig, fallbackFactory = null) {
        if (typeof defaultFactoryConfig === 'function') {
            return defaultFactoryConfig;
        }
        const namespace = typeof window !== 'undefined' && window ? window.galleryComponents : null;
        if (namespace && typeof namespace.createDefaultTomSelectAdapter === 'function') {
            return namespace.createDefaultTomSelectAdapter;
        }
        if (typeof fallbackFactory === 'function') {
            return fallbackFactory;
        }
        return null;
    }

    function createFallbackFormatter(formatTagTokens, parseTagTokens) {
        return (value) => {
            if (Array.isArray(value)) {
                return formatTagTokens(value);
            }
            return formatTagTokens(parseTagTokens(value));
        };
    }

    function isTagDebugEnabled() {
        if (typeof window === 'undefined' || !window) {
            return false;
        }
        if (typeof window.galleryDebugTags !== 'undefined') {
            return Boolean(window.galleryDebugTags);
        }
        try {
            return window.localStorage && window.localStorage.getItem('galleryDebugTags') === 'true';
        } catch (error) {
            return false;
        }
    }

    function createTagInputController(config = {}) {
        const {
            TomSelect: TomSelectClass = (typeof window !== 'undefined' && window ? window.TomSelect : null),
            createTomSelectAdapter: createTomSelectAdapterConfig,
            parseTagTokens: parseTokensConfig,
            formatTagTokens: formatTokensConfig,
            documentRef = typeof document !== 'undefined' ? document : null
        } = config;

        const parseTagTokens =
            typeof parseTokensConfig === 'function'
                ? parseTokensConfig
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
                          .split(/[\s,;、，；]+/)
                          .map((token) => token.trim())
                          .filter((token) => token.length > 0);
                  };
        const formatTagTokens =
            typeof formatTokensConfig === 'function'
                ? formatTokensConfig
                : (value) => (Array.isArray(value) ? value.join(' ') : parseTagTokens(value).join(' '));
        const fallbackFormatter = createFallbackFormatter(formatTagTokens, parseTagTokens);

        const hasDom = Boolean(documentRef && typeof documentRef.createElement === 'function');
        const resolveTomSelectAdapterFn = resolveAdapterResolver(config.resolveTomSelectAdapter);
        const createTomSelectAdapterFn = resolveAdapterFactory(createTomSelectAdapterConfig);
        const defaultTomSelectAdapterFactory = resolveDefaultFactory(
            config.createDefaultTomSelectAdapter,
            createDefaultTomSelectAdapterFallback
        );
        const tomSelectAdapter = resolveTomSelectAdapterFn
            ? resolveTomSelectAdapterFn({
                  createTomSelectAdapter: createTomSelectAdapterFn,
                  createDefaultTomSelectAdapter: defaultTomSelectAdapterFactory,
                  TomSelect: TomSelectClass,
                  documentRef,
                  isDebugEnabled: isTagDebugEnabled
              })
            : (() => {
                  const factory = createTomSelectAdapterFn;
                  if (typeof factory === 'function') {
                      const adapter = factory({
                          TomSelect: TomSelectClass,
                          documentRef,
                          isDebugEnabled: isTagDebugEnabled
                      });
                      if (adapter) {
                          return adapter;
                      }
                  }
                  if (typeof defaultTomSelectAdapterFactory === 'function') {
                      return defaultTomSelectAdapterFactory(TomSelectClass, documentRef);
                  }
                  return null;
              })();

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

(() => {
    function getLogger(level = 'info') {
        if (typeof console === 'undefined') {
            return () => {};
        }
        if (level === 'debug' && typeof console.debug === 'function') {
            return console.debug.bind(console);
        }
        if (typeof console.info === 'function') {
            return console.info.bind(console);
        }
        return () => {};
    }

    function resolveIsTagDebugEnabled(isDebugEnabled) {
        const namespace = typeof window !== 'undefined' && window ? window.galleryComponents : null;
        const resolver =
            namespace && typeof namespace.resolveTagDebugResolverSharedOrDefault === 'function'
                ? namespace.resolveTagDebugResolverSharedOrDefault
                : null;

        if (resolver) {
            try {
                const resolved = resolver({ isDebugEnabled });
                if (typeof resolved === 'function') {
                    return () => {
                        try {
                            return Boolean(resolved());
                        } catch (error) {
                            return false;
                        }
                    };
                }
            } catch (error) {
                // fall through to the raw flag resolution
            }
        }

        if (typeof isDebugEnabled === 'function') {
            return () => {
                try {
                    return Boolean(isDebugEnabled());
                } catch (error) {
                    return false;
                }
            };
        }

        return () => Boolean(isDebugEnabled);
    }

    function attachLogging(instance, hooks = {}, isDebugEnabled = () => false) {
        const { debugLabel = 'tom-select', logEvents = [], loggers = {} } = hooks;
        const logInfo = loggers.logInfo || getLogger('info');
        const logDebug = loggers.logDebug || getLogger('debug');

        if (!instance || !isDebugEnabled()) {
            return;
        }

        const eventsToLog = Array.isArray(logEvents) && logEvents.length > 0 ? logEvents : ['change'];
        eventsToLog.forEach((eventName) => {
            if (typeof instance.on === 'function') {
                instance.on(eventName, (payload) => {
                    const logger = eventName === 'change' ? logInfo : logDebug;
                    logger(`[gallery][tags][${debugLabel}] tom-select ${eventName}`, payload);
                });
            }
        });
    }

    function registerNativeLoggingInternal(input, hooks = {}, isDebugEnabled = () => false) {
        if (!isDebugEnabled() || !input || typeof input.addEventListener !== 'function') {
            return;
        }
        const { debugLabel = 'tom-select', loggers = {} } = hooks;
        const logInfo = loggers.logInfo || getLogger('info');
        const logDebug = loggers.logDebug || getLogger('debug');
        input.addEventListener('input', (event) => {
            logDebug(`[gallery][tags][${debugLabel}] native input`, {
                value: event.target && event.target.value,
                type: event.type
            });
        });
        input.addEventListener('change', (event) => {
            logInfo(`[gallery][tags][${debugLabel}] native change`, {
                value: event.target && event.target.value,
                type: event.type
            });
        });
    }

    function createDefaultTomSelectAdapter(TomSelectClass, documentRef, config = {}) {
        const hasDom = Boolean(documentRef && typeof documentRef.createElement === 'function');
        const hasTomSelect = typeof TomSelectClass === 'function';

        if (!hasDom || !hasTomSelect) {
            return null;
        }

        const isDebugEnabled = resolveIsTagDebugEnabled(config.isDebugEnabled);

        function createInstance(input, options = {}, hooks = {}) {
            if (!input) {
                return null;
            }
            const instance = new TomSelectClass(input, options);
            attachLogging(instance, hooks, isDebugEnabled);
            return instance;
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
            hasSupport: hasDom && hasTomSelect,
            createInstance,
            syncOptions,
            clearSelection,
            getValues,
            onChange,
            setValue,
            registerNativeLogging(input, hooks = {}) {
                registerNativeLoggingInternal(input, hooks, isDebugEnabled);
            }
        };
    }

    function resolveTomSelectAdapter(config = {}) {
        const {
            createTomSelectAdapter,
            createDefaultTomSelectAdapter: defaultFactory = createDefaultTomSelectAdapter,
            TomSelect: TomSelectClass = (typeof window !== 'undefined' && window ? window.TomSelect : null),
            documentRef = typeof document !== 'undefined' ? document : null,
            isDebugEnabled
        } = config;

        const namespace = typeof window !== 'undefined' && window ? window.galleryComponents : null;
        const adapterFactory =
            typeof createTomSelectAdapter === 'function'
                ? createTomSelectAdapter
                : namespace && typeof namespace.createTomSelectAdapter === 'function'
                  ? namespace.createTomSelectAdapter
                  : null;

        if (adapterFactory) {
            const adapter = adapterFactory({
                TomSelect: TomSelectClass,
                documentRef,
                isDebugEnabled
            });
            if (adapter) {
                return adapter;
            }
        }

        if (typeof defaultFactory === 'function') {
            return defaultFactory(TomSelectClass, documentRef, { isDebugEnabled });
        }
        return null;
    }

    function resolveTomSelectAdapterWithResolver(config = {}) {
        const {
            resolveTomSelectAdapter: customResolver,
            createTomSelectAdapter,
            createDefaultTomSelectAdapter,
            TomSelect,
            documentRef,
            isDebugEnabled
        } = config;

        const namespace = typeof window !== 'undefined' && window ? window.galleryComponents : null;
        const adapterFactory =
            typeof createTomSelectAdapter === 'function'
                ? createTomSelectAdapter
                : namespace && typeof namespace.createTomSelectAdapter === 'function'
                  ? namespace.createTomSelectAdapter
                  : null;
        const defaultFactory =
            typeof createDefaultTomSelectAdapter === 'function'
                ? createDefaultTomSelectAdapter
                : namespace && typeof namespace.createDefaultTomSelectAdapter === 'function'
                  ? namespace.createDefaultTomSelectAdapter
                  : createDefaultTomSelectAdapter;

        const resolverCandidates = [];
        if (typeof customResolver === 'function') {
            resolverCandidates.push(customResolver);
        }
        if (namespace && typeof namespace.resolveTomSelectAdapter === 'function') {
            resolverCandidates.push(namespace.resolveTomSelectAdapter);
        }

        for (const resolver of resolverCandidates) {
            const adapter = resolver({
                createTomSelectAdapter: adapterFactory,
                createDefaultTomSelectAdapter: defaultFactory,
                TomSelect,
                documentRef,
                isDebugEnabled
            });
            if (adapter) {
                return adapter;
            }
        }

        return resolveTomSelectAdapter({
            createTomSelectAdapter: adapterFactory,
            createDefaultTomSelectAdapter: defaultFactory,
            TomSelect,
            documentRef,
            isDebugEnabled
        });
    }

    function resolveSharedTomSelectAdapter(config = {}) {
        const namespace = typeof window !== 'undefined' && window ? window.galleryComponents : null;
        const resolver =
            namespace && typeof namespace.resolveTomSelectAdapterWithResolver === 'function'
                ? namespace.resolveTomSelectAdapterWithResolver
                : resolveTomSelectAdapterWithResolver;
        const defaultFactory =
            typeof config.createDefaultTomSelectAdapter === 'function'
                ? config.createDefaultTomSelectAdapter
                : namespace && typeof namespace.createDefaultTomSelectAdapter === 'function'
                  ? namespace.createDefaultTomSelectAdapter
                  : createDefaultTomSelectAdapter;

        return resolver({
            resolveTomSelectAdapter: config.resolveTomSelectAdapter,
            createTomSelectAdapter: config.createTomSelectAdapter,
            createDefaultTomSelectAdapter: defaultFactory,
            TomSelect: config.TomSelect,
            documentRef: config.documentRef,
            isDebugEnabled: config.isDebugEnabled
        });
    }

    if (!window.galleryComponents) {
        window.galleryComponents = {};
    }
    window.galleryComponents.createDefaultTomSelectAdapter = createDefaultTomSelectAdapter;
    window.galleryComponents.resolveTomSelectAdapter = resolveTomSelectAdapter;
    window.galleryComponents.resolveTomSelectAdapterWithResolver = resolveTomSelectAdapterWithResolver;
    window.galleryComponents.resolveSharedTomSelectAdapter = resolveSharedTomSelectAdapter;
})();

(() => {
    function defaultIsDebugEnabled() {
        if (typeof window === 'undefined' || !window) {
            return false;
        }
        try {
            if (typeof window.galleryDebugTags !== 'undefined') {
                return Boolean(window.galleryDebugTags);
            }
            return window.localStorage && window.localStorage.getItem('galleryDebugTags') === 'true';
        } catch (error) {
            return false;
        }
    }

    function resolveTagDebugResolver(config = {}) {
        const namespace = typeof window !== 'undefined' && window ? window.galleryComponents : null;
        const resolver =
            namespace && typeof namespace.resolveTagDebugResolver === 'function'
                ? namespace.resolveTagDebugResolver
                : null;
        const defaultResolver =
            namespace && typeof namespace.defaultIsTagDebugEnabled === 'function'
                ? namespace.defaultIsTagDebugEnabled
                : defaultIsDebugEnabled;

        if (resolver) {
            try {
                const resolved = resolver(config);
                if (typeof resolved === 'function') {
                    return resolved;
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
                    return defaultResolver();
                }
            }
            return defaultResolver();
        };
    }

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

    function createTomSelectAdapter(config = {}) {
        const {
            TomSelect: TomSelectClass = typeof window !== 'undefined' && window ? window.TomSelect : null,
            documentRef = typeof document !== 'undefined' ? document : null,
            isDebugEnabled: isDebugEnabledConfig
        } = config;

        const hasDom = Boolean(documentRef && typeof documentRef.createElement === 'function');
        const hasTomSelect = typeof TomSelectClass === 'function';
        const isDebugEnabled = resolveTagDebugResolver({ isDebugEnabled: isDebugEnabledConfig });

        function createInstance(input, options = {}, hooks = {}) {
            if (!hasDom || !hasTomSelect || !input) {
                return null;
            }
            const instance = new TomSelectClass(input, options);
            attachLogging(instance, hooks);
            return instance;
        }

        function attachLogging(instance, hooks = {}) {
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

        function registerNativeLogging(input, hooks = {}) {
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
            registerNativeLogging
        };
    }

    if (!window.galleryComponents) {
        window.galleryComponents = {};
    }
    window.galleryComponents.createTomSelectAdapter = createTomSelectAdapter;
})();

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

    function createTomSelectAdapter(config = {}) {
        const {
            TomSelect: TomSelectClass = typeof window !== 'undefined' && window ? window.TomSelect : null,
            documentRef = typeof document !== 'undefined' ? document : null,
            isDebugEnabled: isDebugEnabledConfig
        } = config;

        const hasDom = Boolean(documentRef && typeof documentRef.createElement === 'function');
        const hasTomSelect = typeof TomSelectClass === 'function';
        const namespace = typeof window !== 'undefined' && window ? window.galleryComponents : null;
        const nativeLoggingMarker =
            typeof Symbol === 'function' ? Symbol('gallery-native-logging') : '__gallery_native_logging__';
        const resolveTagDebugResolver =
            namespace && typeof namespace.resolveTagDebugResolverSharedOrDefault === 'function'
                ? namespace.resolveTagDebugResolverSharedOrDefault
                : null;

        function resolveIsTagDebugEnabled() {
            if (resolveTagDebugResolver) {
                try {
                    const resolved = resolveTagDebugResolver({ isDebugEnabled: isDebugEnabledConfig });
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

            if (typeof isDebugEnabledConfig === 'function') {
                return () => {
                    try {
                        return Boolean(isDebugEnabledConfig());
                    } catch (error) {
                        return false;
                    }
                };
            }

            return () => Boolean(isDebugEnabledConfig);
        }

        const isDebugEnabled = resolveIsTagDebugEnabled();

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
            let debugEnabled = false;
            try {
                debugEnabled = isDebugEnabled();
            } catch (error) {
                debugEnabled = false;
            }
            if (!instance || !debugEnabled) {
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
            let debugEnabled = false;
            try {
                debugEnabled = isDebugEnabled();
            } catch (error) {
                debugEnabled = false;
            }
            if (!debugEnabled || !input || typeof input.addEventListener !== 'function') {
                return;
            }
            if (input[nativeLoggingMarker]) {
                return;
            }
            input[nativeLoggingMarker] = true;
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

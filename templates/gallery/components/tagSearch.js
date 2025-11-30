(() => {
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

    function resolveTomSelectAdapterWithSharedFactory(config = {}) {
        const namespace = typeof window !== 'undefined' && window ? window.galleryComponents : null;
        const createTomSelectAdapterFn =
            typeof config.createTomSelectAdapter === 'function'
                ? config.createTomSelectAdapter
                : namespace && typeof namespace.createTomSelectAdapter === 'function'
                  ? namespace.createTomSelectAdapter
                  : null;
        const defaultAdapterFactory =
            typeof config.createDefaultTomSelectAdapter === 'function'
                ? config.createDefaultTomSelectAdapter
                : namespace && typeof namespace.createDefaultTomSelectAdapter === 'function'
                  ? namespace.createDefaultTomSelectAdapter
                  : null;
        const resolver =
            namespace && typeof namespace.resolveTomSelectAdapterWithResolver === 'function'
                ? namespace.resolveTomSelectAdapterWithResolver
                : null;

        if (resolver) {
            const adapter = resolver({
                resolveTomSelectAdapter: config.resolveTomSelectAdapter,
                createTomSelectAdapter: createTomSelectAdapterFn,
                createDefaultTomSelectAdapter: defaultAdapterFactory,
                TomSelect: config.TomSelect,
                documentRef: config.documentRef,
                isDebugEnabled: config.isDebugEnabled
            });
            if (adapter) {
                return adapter;
            }
        }

        if (typeof config.resolveTomSelectAdapter === 'function') {
            const adapter = config.resolveTomSelectAdapter({
                createTomSelectAdapter: createTomSelectAdapterFn,
                createDefaultTomSelectAdapter: defaultAdapterFactory,
                TomSelect: config.TomSelect,
                documentRef: config.documentRef,
                isDebugEnabled: config.isDebugEnabled
            });
            if (adapter) {
                return adapter;
            }
        }

        if (typeof defaultAdapterFactory === 'function') {
            return defaultAdapterFactory(config.TomSelect, config.documentRef);
        }
        return null;
    }

    function createTagSearchController(config = {}) {
        const {
            input = null,
            parseTagTokens = defaultParseTagTokens,
            resolveTomSelectAdapter,
            createTomSelectAdapter,
            createDefaultTomSelectAdapter,
            TomSelect = typeof window !== 'undefined' && window ? window.TomSelect : null,
            documentRef = typeof document !== 'undefined' ? document : null,
            isDebugEnabled
        } = config;

        const adapter = resolveTomSelectAdapterWithSharedFactory({
            resolveTomSelectAdapter,
            createTomSelectAdapter,
            createDefaultTomSelectAdapter,
            TomSelect,
            documentRef,
            isDebugEnabled
        });

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

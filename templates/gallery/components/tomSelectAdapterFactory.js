(() => {
    function createDefaultTomSelectAdapter(TomSelectClass, documentRef) {
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
            return defaultFactory(TomSelectClass, documentRef);
        }
        return null;
    }

    if (!window.galleryComponents) {
        window.galleryComponents = {};
    }
    window.galleryComponents.createDefaultTomSelectAdapter = createDefaultTomSelectAdapter;
    window.galleryComponents.resolveTomSelectAdapter = resolveTomSelectAdapter;
})();

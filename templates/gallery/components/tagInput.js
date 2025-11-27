(() => {
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
        const hasTomSelect = typeof TomSelectClass === 'function';

        if (!hasDom || !hasTomSelect) {
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
            const instance = new TomSelectClass(input, {
                delimiter: ';',
                placeholder: input.getAttribute('placeholder') || 'タグを入力 (Enter で確定)',
                inputAriaLabel: 'タグを入力',
                create: true,
                createOnBlur: true,
                createFilter(value) {
                    const tokens = parseTagTokens(value);
                    return tokens.length === 1;
                }
            });
            instances.set(input, instance);

            const debugLabel = input.dataset && input.dataset.recordIndex
                ? `record-${input.dataset.recordIndex}`
                : input.id || input.name || 'tags';
            const logInfo = (eventName, payload) => {
                if (typeof console !== 'undefined' && console.info) {
                    console.info(`[gallery][tags][${debugLabel}] ${eventName}`, payload);
                }
            };
            const logDebug = (eventName, payload) => {
                if (typeof console !== 'undefined' && console.debug) {
                    console.debug(`[gallery][tags][${debugLabel}] ${eventName}`, payload);
                }
            };

            instance.on('change', (value) => {
                logInfo('tom-select change', {
                    value,
                    items: instance.items ? instance.items.slice() : [],
                    inputValue: input.value,
                    textInputValue: instance.textInput ? instance.textInput.value : ''
                });
            });

            instance.on('item_add', (token) => {
                logDebug('tom-select item_add', {
                    token,
                    items: instance.items ? instance.items.slice() : []
                });
            });

            instance.on('item_remove', (token) => {
                logDebug('tom-select item_remove', {
                    token,
                    items: instance.items ? instance.items.slice() : []
                });
            });

            input.addEventListener('input', (event) => {
                logDebug('native input', { value: event.target.value, type: event.type });
            });

            input.addEventListener('change', (event) => {
                logInfo('native change', { value: event.target.value, type: event.type });
            });
            return instance;
        }

        return {
            usesNativeInput: false,
            enhanceInput(input) {
                ensureInstance(input);
            },
            syncValue(input, tokens) {
                const instance = ensureInstance(input);
                if (instance && typeof instance.setValue === 'function') {
                    const nextTokens = Array.isArray(tokens) ? tokens : parseTagTokens(tokens);
                    instance.setValue(nextTokens, true);
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

(() => {
    function resolveTagDebugResolver(config = {}) {
        const namespace = typeof window !== 'undefined' && window ? window.galleryComponents : null;
        const resolverWithFallback =
            namespace && typeof namespace.resolveSharedTagDebugResolver === 'function'
                ? namespace.resolveSharedTagDebugResolver
                : null;
        const defaultResolver =
            namespace && typeof namespace.defaultIsTagDebugEnabled === 'function'
                ? namespace.defaultIsTagDebugEnabled
                : () => false;

        if (resolverWithFallback) {
            try {
                return resolverWithFallback(config);
            } catch (error) {
                // fall through to default resolver
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

    function resolveTomSelectAdapterShared(config = {}) {
        const namespace = typeof window !== 'undefined' && window ? window.galleryComponents : null;
        const resolver =
            namespace && typeof namespace.resolveSharedTomSelectAdapterWithDebug === 'function'
                ? namespace.resolveSharedTomSelectAdapterWithDebug
                : null;
        if (resolver) {
            return resolver(config);
        }
        return null;
    }

    function createGalleryView(config = {}) {
        const {
            state,
            datasetState,
            stateApi,
            dom,
            duplicates,
            itemColorOptions = [],
            createEffect,
            bindImage,
            createElement: createElementConfig,
            createFragment: createFragmentConfig,
            joinPath,
            getFileName,
            showStatus = () => {},
            clearStatus = () => {},
            ensureDomElement: ensureDomElementConfig,
            applyInlineStyles: applyInlineStylesConfig,
            normalizeStatus: normalizeStatusConfig,
            getRecordByIndex,
            isRecordDuplicate,
            isRecordFavorite,
            tagStore,
            filterStore,
            filterStateBridge
        } = config;

        if (!state || !datasetState || !dom) {
            throw new Error('createGalleryView: invalid state or dom configuration');
        }
        if (typeof createEffect !== 'function') {
            throw new Error('createGalleryView: createEffect function is required');
        }
        if (typeof bindImage !== 'function') {
            throw new Error('createGalleryView: bindImage function is required');
        }
        if (typeof joinPath !== 'function' || typeof getFileName !== 'function') {
            throw new Error('createGalleryView: joinPath and getFileName helpers are required');
        }
        if (typeof getRecordByIndex !== 'function') {
            throw new Error('createGalleryView: getRecordByIndex helper is required');
        }
        if (typeof isRecordDuplicate !== 'function') {
            throw new Error('createGalleryView: isRecordDuplicate helper is required');
        }
        if (typeof isRecordFavorite !== 'function') {
            throw new Error('createGalleryView: isRecordFavorite helper is required');
        }

        const isTagDebugEnabled = resolveTagDebugResolver({ isDebugEnabled: config.isDebugEnabled });
        const dataUtils = typeof window !== 'undefined' && window ? window.galleryDataUtils : null;
        const tagStoreApi = tagStore && typeof tagStore.normalizeTags === 'function' ? tagStore : null;
        const filterStoreApi = filterStore && typeof filterStore.getState === 'function' ? filterStore : null;
        const filterStateNamespace = typeof window !== 'undefined' && window ? window.galleryFilterState : null;
        const summaryUtilsNamespace = typeof window !== 'undefined' && window ? window.gallerySummaryUtils : null;
        const filterStateResolver =
            filterStateBridge && typeof filterStateBridge.getState === 'function' ? filterStateBridge : null;
        const createFilterOptionsResolverFn =
            typeof config.createFilterOptionsResolver === 'function'
                ? config.createFilterOptionsResolver
                : filterStateNamespace && typeof filterStateNamespace.createFilterOptionsResolver === 'function'
                  ? filterStateNamespace.createFilterOptionsResolver
                  : null;
        const createSummaryCalculatorFn =
            typeof config.createSummaryCalculator === 'function'
                ? config.createSummaryCalculator
                : summaryUtilsNamespace && typeof summaryUtilsNamespace.createSummaryCalculator === 'function'
                  ? summaryUtilsNamespace.createSummaryCalculator
                  : null;
        const parseTagTokens =
            tagStoreApi && typeof tagStoreApi.normalizeTokens === 'function'
                ? (value) => tagStoreApi.normalizeTokens(value)
                : dataUtils && typeof dataUtils.parseTagTokens === 'function'
                  ? dataUtils.parseTagTokens
                  : null;
        const formatTagTokens =
            tagStoreApi && typeof tagStoreApi.formatTokens === 'function'
                ? (value) => tagStoreApi.formatTokens(value)
                : dataUtils && typeof dataUtils.formatTagTokens === 'function'
                  ? dataUtils.formatTagTokens
                  : null;

        if (typeof parseTagTokens !== 'function' || typeof formatTagTokens !== 'function') {
            throw new Error('createGalleryView: tag utilities are required');
        }

        const buildTagEntry =
            tagStoreApi && typeof tagStoreApi.buildEntry === 'function'
                ? (value) => tagStoreApi.buildEntry(value)
                : (value) => {
                      const normalized = formatTagTokens(value);
                      const tokens = parseTagTokens(normalized);
                      return { normalized, tokens };
                  };

        const colorOptions = Array.isArray(itemColorOptions) ? itemColorOptions.slice() : [];
        const hasDocument = typeof document !== 'undefined' && document;
        const componentsNamespace = typeof window !== 'undefined' && window ? window.galleryComponents : null;
        const tomSelectAdapter = resolveTomSelectAdapterShared({
            resolveTomSelectAdapter: config.resolveTomSelectAdapter,
            createTomSelectAdapter: config.createTomSelectAdapter,
            createDefaultTomSelectAdapter: config.createDefaultTomSelectAdapter,
            TomSelect: typeof window !== 'undefined' && window ? window.TomSelect : null,
            documentRef: hasDocument || null,
            isDebugEnabled: isTagDebugEnabled
        });
        const createTagInputControllerFn =
            typeof config.createTagInputController === 'function'
                ? config.createTagInputController
                : componentsNamespace && typeof componentsNamespace.createTagInputController === 'function'
                  ? componentsNamespace.createTagInputController
                  : null;
        const tagInputController =
            typeof createTagInputControllerFn === 'function'
                ? createTagInputControllerFn({
                      TomSelect: typeof window !== 'undefined' && window ? window.TomSelect : null,
                      parseTagTokens,
                      formatTagTokens,
                      documentRef: hasDocument || null,
                      createTomSelectAdapter: config.createTomSelectAdapter,
                      resolveTomSelectAdapter: config.resolveTomSelectAdapter,
                      createDefaultTomSelectAdapter: config.createDefaultTomSelectAdapter,
                      isDebugEnabled: isTagDebugEnabled
                  })
                : null;
        const createTagSearchControllerFn =
            typeof config.createTagSearchController === 'function'
                ? config.createTagSearchController
                : componentsNamespace && typeof componentsNamespace.createTagSearchController === 'function'
                  ? componentsNamespace.createTagSearchController
                  : null;
        const tagSearchController =
            typeof createTagSearchControllerFn === 'function'
                ? createTagSearchControllerFn({
                      input: dom.tagSearchInput,
                      parseTagTokens,
                      resolveTomSelectAdapter: config.resolveTomSelectAdapter,
                      createTomSelectAdapter: config.createTomSelectAdapter,
                      createDefaultTomSelectAdapter: config.createDefaultTomSelectAdapter,
                      TomSelect: typeof window !== 'undefined' && window ? window.TomSelect : null,
                      documentRef: hasDocument || null,
                      isDebugEnabled: isTagDebugEnabled
                  })
                : (() => {
                      const changeHandlers = [];
                      let instance = null;

                      function ensureInstance() {
                          if (!tomSelectAdapter || !tomSelectAdapter.hasSupport || !dom.tagSearchInput) {
                              return null;
                          }
                          if (instance) {
                              return instance;
                          }
                          if (dom.tagSearchInput && typeof dom.tagSearchInput.setAttribute === 'function') {
                              dom.tagSearchInput.setAttribute('multiple', 'multiple');
                          }
                          instance = tomSelectAdapter.createInstance(
                              dom.tagSearchInput,
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
                          changeHandlers.forEach((handler) =>
                              tomSelectAdapter.onChange(instance, dom.tagSearchInput, handler)
                          );
                          return instance;
                      }

                      function setOptions(options = [], { clearSelection = false } = {}) {
                          const normalizedOptions = Array.isArray(options) ? options : [];
                          const inst = ensureInstance();
                          if (tomSelectAdapter) {
                              tomSelectAdapter.syncOptions(inst, dom.tagSearchInput, normalizedOptions, { clearSelection });
                              return;
                          }
                          if (hasDocument && dom.tagSearchInput) {
                              while (dom.tagSearchInput.firstChild) {
                                  dom.tagSearchInput.removeChild(dom.tagSearchInput.firstChild);
                              }
                              normalizedOptions.forEach((option) => {
                                  const value = option && option.value ? String(option.value).trim() : '';
                                  if (!value) {
                                      return;
                                  }
                                  const node = document.createElement('option');
                                  node.value = value;
                                  node.textContent = option.text || value;
                                  dom.tagSearchInput.appendChild(node);
                              });
                              if (clearSelection) {
                                  dom.tagSearchInput.selectedIndex = -1;
                              }
                          }
                      }

                      function getValues() {
                          const inst = ensureInstance();
                          if (tomSelectAdapter) {
                              return tomSelectAdapter.getValues(inst, dom.tagSearchInput, parseTagTokens);
                          }
                          if (dom.tagSearchInput && dom.tagSearchInput.selectedOptions) {
                              return Array.from(dom.tagSearchInput.selectedOptions)
                                  .map((option) => option.value)
                                  .filter((value) => value);
                          }
                          const text = dom.tagSearchInput && dom.tagSearchInput.value ? dom.tagSearchInput.value : '';
                          return parseTagTokens(text);
                      }

                      function onChange(handler) {
                          if (typeof handler !== 'function') {
                              return;
                          }
                          changeHandlers.push(handler);
                          const inst = ensureInstance();
                          if (tomSelectAdapter) {
                              tomSelectAdapter.onChange(inst, dom.tagSearchInput, handler);
                              return;
                          }
                          if (dom.tagSearchInput && typeof dom.tagSearchInput.addEventListener === 'function') {
                              dom.tagSearchInput.addEventListener('change', handler);
                          }
                      }

                      function clearSelection() {
                          const inst = ensureInstance();
                          if (tomSelectAdapter) {
                              tomSelectAdapter.clearSelection(inst, dom.tagSearchInput);
                              return;
                          }
                          if (dom.tagSearchInput) {
                              if (typeof dom.tagSearchInput.selectedIndex === 'number') {
                                  dom.tagSearchInput.selectedIndex = -1;
                              }
                              dom.tagSearchInput.value = '';
                          }
                      }

                      return { setOptions, getValues, onChange, clearSelection };
                  })();
        const filterNamespace = typeof window !== 'undefined' && window ? window.galleryFilterUtils : null;
        const renderUtilsNamespace =
            typeof window !== 'undefined' && window ? window.galleryRenderUtils : null;

        const stateControls = {
            setShowOcr(value) {
                if (stateApi && typeof stateApi.setShowOcr === 'function') {
                    stateApi.setShowOcr(value);
                    return;
                }
                state.showOcr = Boolean(value);
            },
            setItems(items) {
                if (stateApi && typeof stateApi.setItems === 'function') {
                    stateApi.setItems(items);
                    return;
                }
                state.items = Array.isArray(items) ? items : [];
            }
        };

        const buildItemSearchCaches =
            typeof config.buildItemSearchCaches === 'function'
                ? config.buildItemSearchCaches
                : filterNamespace && typeof filterNamespace.buildItemSearchCaches === 'function'
                  ? filterNamespace.buildItemSearchCaches
                  : null;

        if (typeof buildItemSearchCaches !== 'function') {
            throw new Error('createGalleryView: buildItemSearchCaches helper is required');
        }

        const filterItemsFn =
            typeof config.filterItems === 'function'
                ? config.filterItems
                : filterNamespace && typeof filterNamespace.filterItems === 'function'
                  ? filterNamespace.filterItems
                  : null;

        const evaluateItemVisibilityFn =
            typeof config.evaluateItemVisibility === 'function'
                ? config.evaluateItemVisibility
                : filterNamespace && typeof filterNamespace.evaluateItemVisibility === 'function'
                  ? filterNamespace.evaluateItemVisibility
                  : null;

        if (typeof filterItemsFn !== 'function' && typeof evaluateItemVisibilityFn !== 'function') {
            throw new Error('createGalleryView: filter helpers are not available');
        }

        const fallbackMapItemElementsToState = (items, helpers = {}) => {
            const normalizeItemColorHelper =
                typeof helpers.normalizeItemColor === 'function'
                    ? helpers.normalizeItemColor
                    : (value) => value;
            const normalizeItemRelicTypeHelper =
                typeof helpers.normalizeItemRelicType === 'function'
                    ? helpers.normalizeItemRelicType
                    : (value) => value;
            const readEffectSlotsHelper =
                typeof helpers.readEffectSlots === 'function' ? helpers.readEffectSlots : () => [];
            const readTagTokensHelper =
                typeof helpers.readTagTokens === 'function' ? helpers.readTagTokens : () => [];

            const list =
                Array.isArray(items) || (items && typeof items.length === 'number')
                    ? Array.from(items)
                    : [];

            return list.map((item) => {
                if (!item || !item.dataset) {
                    return {
                        duplicate: false,
                        searchCache: '',
                        statusCache: '',
                        effectStates: [],
                        favorite: false,
                        itemColor: '',
                        relicType: '',
                        effectValues: [],
                        tagTokens: []
                    };
                }

                const effectStates = (item.dataset.effectStates || '')
                    .split(',')
                    .map((value) => (value == null ? '' : String(value).trim()))
                    .filter((value) => value !== '');

                return {
                    duplicate: item.dataset.duplicate === 'true',
                    searchCache: item.dataset.searchCache || '',
                    statusCache: item.dataset.statusCache || '',
                    effectStates,
                    favorite: item.dataset.favorite === 'true',
                    itemColor: normalizeItemColorHelper(item.dataset.itemColor || ''),
                    relicType: normalizeItemRelicTypeHelper(item.dataset.relicType || ''),
                    effectValues: readEffectSlotsHelper(item),
                    tagTokens: readTagTokensHelper(item)
                };
            });
        };

        const mapItemElementsToStateFn =
            typeof config.mapItemElementsToState === 'function'
                ? config.mapItemElementsToState
                : renderUtilsNamespace && typeof renderUtilsNamespace.mapItemElementsToState === 'function'
                  ? renderUtilsNamespace.mapItemElementsToState
                  : fallbackMapItemElementsToState;

        const createItemStateResolverFn =
            typeof config.createItemStateResolver === 'function'
                ? config.createItemStateResolver
                : renderUtilsNamespace && typeof renderUtilsNamespace.createItemStateResolver === 'function'
                  ? renderUtilsNamespace.createItemStateResolver
                  : null;

        let itemStateResolver = null;
        let itemStateCache = [];
        let itemStateCacheDirty = true;
        let filterOptionsResolver = null;

        if (!hasDocument && typeof createElementConfig !== 'function') {
            throw new Error('createGalleryView: createElement helper is required when document is unavailable');
        }
        if (!hasDocument && typeof createFragmentConfig !== 'function') {
            throw new Error('createGalleryView: createFragment helper is required when document is unavailable');
        }

        const createElement =
            typeof createElementConfig === 'function'
                ? createElementConfig
                : (tagName, className = '', text = '') => {
                      const element = document.createElement(tagName);
                      if (className) {
                          element.className = className;
                      }
                      if (text != null) {
                          element.textContent = text;
                      }
                      return element;
                  };

        const createDocumentFragment =
            typeof createFragmentConfig === 'function'
                ? createFragmentConfig
                : () => document.createDocumentFragment();

        const ensureElement =
            typeof ensureDomElementConfig === 'function'
                ? ensureDomElementConfig
                : (current, options = {}) => {
                      const { selector = '', id = '', tagName = 'div', classNames = [], create } = options;
                      let element = current || null;

                      if (hasDocument) {
                          if (!element || !element.isConnected) {
                              if (selector) {
                                  const foundBySelector = document.querySelector(selector);
                                  if (foundBySelector) {
                                      element = foundBySelector;
                                  }
                              }
                              if (!element && id) {
                                  const foundById = document.getElementById(id);
                                  if (foundById) {
                                      element = foundById;
                                  }
                              }
                          }
                          if (!element) {
                              element = typeof create === 'function' ? create() : document.createElement(tagName);
                          }
                      } else if (typeof create === 'function') {
                          element = create();
                      }

                      if (!element) {
                          return null;
                      }

                      if (id && !element.id) {
                          element.id = id;
                      }

                      if (element.classList) {
                          classNames
                              .filter((className) => typeof className === 'string' && className.length > 0)
                              .forEach((className) => {
                                  element.classList.add(className);
                              });
                      }

                      return element;
                  };

        const applyInlineStyles =
            typeof applyInlineStylesConfig === 'function'
                ? applyInlineStylesConfig
                : (element, styles = {}) => {
                      if (!element || !styles || typeof styles !== 'object') {
                          return;
                      }
                      if (!element.style) {
                          return;
                      }
                      Object.keys(styles).forEach((key) => {
                          const value = styles[key];
                          if (value != null) {
                              element.style[key] = value;
                          }
                      });
                  };

        const normalizeStatus =
            typeof normalizeStatusConfig === 'function'
                ? normalizeStatusConfig
                : (value) => {
                      const text = (value || '').toString().trim().toLowerCase();
                      if (text === 'none') {
                          return 'none';
                      }
                      if (text === 'pass') {
                          return 'pass';
                      }
                      if (text === 'corrected') {
                          return 'corrected';
                      }
                      return 'pending';
                  };

        const renderNamespace = typeof window !== 'undefined' && window ? window.galleryRenderFactory : null;
        const createItemFactoryFn =
            typeof config.createItemFactory === 'function'
                ? config.createItemFactory
                : renderNamespace && typeof renderNamespace.createItemFactory === 'function'
                  ? renderNamespace.createItemFactory
                  : null;
        const createItemEnhancersFn =
            typeof config.createItemEnhancers === 'function'
                ? config.createItemEnhancers
                : renderNamespace && typeof renderNamespace.createItemEnhancers === 'function'
                  ? renderNamespace.createItemEnhancers
                  : null;

        if (typeof createItemFactoryFn !== 'function') {
            throw new Error('createGalleryView: createItemFactory helper is required');
        }

        const additionalItemEnhancers = Array.isArray(config.itemEnhancers) ? config.itemEnhancers.slice() : [];

        function normalizeItemEnhancer(fn) {
            if (typeof fn !== 'function') {
                return null;
            }
            if (fn.length >= 2) {
                return fn;
            }
            return (item) => {
                fn(item);
            };
        }

        let itemEnhancers = null;

        if (typeof createItemEnhancersFn === 'function') {
            const producedEnhancers = createItemEnhancersFn({
                syncDuplicateState,
                syncFavoriteState,
                syncItemColorState,
                syncItemRelicTypeState,
                syncItemTagsState,
                refreshItemCaches,
                additionalEnhancers: additionalItemEnhancers
            });
            if (Array.isArray(producedEnhancers)) {
                itemEnhancers = producedEnhancers
                    .map((enhancer) => normalizeItemEnhancer(enhancer))
                    .filter(Boolean);
            }
        }

        if (!Array.isArray(itemEnhancers)) {
            itemEnhancers = [];

            const enhancers = [
                syncDuplicateState,
                syncFavoriteState,
                syncItemColorState,
                syncItemRelicTypeState,
                syncItemTagsState,
                refreshItemCaches
            ];

            enhancers.forEach((enhancer) => {
                const normalized = normalizeItemEnhancer(enhancer);
                if (normalized) {
                    itemEnhancers.push(normalized);
                }
            });

            if (Array.isArray(additionalItemEnhancers)) {
                additionalItemEnhancers.forEach((enhancer) => {
                    const normalized = normalizeItemEnhancer(enhancer);
                    if (normalized) {
                        itemEnhancers.push(normalized);
                    }
                });
            }
        }

        const itemFactory = createItemFactoryFn({
            datasetState,
            createElement,
            createFragment: createDocumentFragment,
            bindImage,
            createEffect,
            colorOptions,
            relicTypeOptions: Array.isArray(config.relicTypeOptions)
                ? config.relicTypeOptions.slice()
                : [],
            getImagePath: (imageName) => joinPath(state.imageDir || '.', imageName),
            getDisplayName: (imageName) => getFileName(imageName),
            getLabelSymbols: () => (Array.isArray(state.labelSymbols) ? state.labelSymbols.slice() : []),
            itemEnhancers
        });

        if (!itemFactory || typeof itemFactory.createItem !== 'function') {
            throw new Error('createGalleryView: itemFactory did not provide createItem');
        }

        const { createItem } = itemFactory;

        const SUMMARY_INLINE_STYLE = {
            textAlign: 'left',
            color: '#333',
            fontSize: '14px',
            margin: '0',
            width: 'auto'
        };

        const summaryCalculator =
            typeof createSummaryCalculatorFn === 'function'
                ? createSummaryCalculatorFn({ normalizeStatus })
                : null;

        function ensureSummaryElement() {
            if (!dom) {
                return null;
            }
            const summary = ensureElement(dom.summary, {
                selector: '#gallery-summary',
                id: 'gallery-summary',
                tagName: 'p',
                classNames: ['gallery-summary']
            });
            if (!summary) {
                return null;
            }
            applyInlineStyles(summary, SUMMARY_INLINE_STYLE);
            if (!summary.parentNode && hasDocument) {
                const reference = dom.galleryStatus && dom.galleryStatus.parentNode ? dom.galleryStatus : dom.gallery;
                if (reference && reference.parentNode) {
                    reference.parentNode.insertBefore(summary, reference);
                } else if (document.body) {
                    document.body.insertBefore(summary, document.body.firstChild || null);
                }
            }
            dom.summary = summary;
            return summary;
        }

        function calculateSummaryCounts() {
            if (summaryCalculator && typeof summaryCalculator.summarize === 'function') {
                const itemStates = getItemStates();
                return summaryCalculator.summarize(Array.isArray(itemStates) ? itemStates : []);
            }

            const items = Array.isArray(state.items) ? state.items : [];
            let fullyConfirmedCount = 0;
            let pendingCount = 0;

            items.forEach((item) => {
                if (!item) {
                    return;
                }
                const effects = item.querySelectorAll ? Array.from(item.querySelectorAll('.effect')) : [];
                if (!effects.length) {
                    pendingCount += 1;
                    return;
                }
                const slotStatuses = new Map();
                let hasPending = false;
                effects.forEach((effect) => {
                    const status = normalizeStatus(effect && effect.dataset ? effect.dataset.status : '');
                    if (status === 'pending') {
                        hasPending = true;
                    }
                    const slot = effect && effect.dataset ? Number(effect.dataset.slot) : Number.NaN;
                    if (!Number.isNaN(slot)) {
                        const slotStatus = slotStatuses.get(slot) || { hasPending: false, isReviewed: false };
                        if (status === 'pending') {
                            slotStatus.hasPending = true;
                        } else {
                            slotStatus.isReviewed = true;
                        }
                        slotStatuses.set(slot, slotStatus);
                    }
                });
                if (hasPending) {
                    pendingCount += 1;
                }
                const targetSlots = [1, 2, 3];
                const allSlotsPresent = targetSlots.every((slot) => slotStatuses.has(slot));
                if (allSlotsPresent) {
                    const allReviewed = targetSlots.every((slot) => {
                        const status = slotStatuses.get(slot);
                        return status && status.isReviewed && !status.hasPending;
                    });
                    if (allReviewed && !hasPending) {
                        fullyConfirmedCount += 1;
                    }
                }
            });

            return {
                totalCount: items.length,
                fullyConfirmedCount,
                pendingCount
            };
        }

        function updateSummary() {
            const summary = ensureSummaryElement();
            if (!summary) {
                return;
            }

            const { totalCount, fullyConfirmedCount, pendingCount } = calculateSummaryCounts();
            const summaryText = `全体 ${totalCount} 件 / 確認済み ${fullyConfirmedCount} 件 / 未レビュー ${pendingCount} 件`;
            summary.textContent = summaryText;
            if (summary.style) {
                summary.style.display = 'flex';
                summary.style.justifyContent = 'flex-start';
                summary.style.textAlign = 'left';
            }
        }

        function resolveFilterStateFromDom() {
            return {
                searchTerm:
                    dom.searchInput && typeof dom.searchInput.value === 'string' ? dom.searchInput.value : '',
                statusFilter: dom.filterSelect && dom.filterSelect.value ? dom.filterSelect.value : 'all',
                colorFilter: dom.colorFilter && dom.colorFilter.value ? dom.colorFilter.value : 'all',
                includeDuplicates: Boolean(dom.showDuplicatesToggle && dom.showDuplicatesToggle.checked)
            };
        }

        function resolveFilterState() {
            if (filterOptionsResolver && typeof filterOptionsResolver.resolveState === 'function') {
                return filterOptionsResolver.resolveState();
            }
            if (filterStateResolver && typeof filterStateResolver.getState === 'function') {
                const current = filterStateResolver.getState() || {};
                return {
                    searchTerm: current.searchTerm || '',
                    statusFilter: current.statusFilter || 'all',
                    colorFilter: current.colorFilter || 'all',
                    includeDuplicates: Boolean(current.includeDuplicates)
                };
            }
            if (filterStoreApi && typeof filterStoreApi.getState === 'function') {
                const current = filterStoreApi.getState() || {};
                return {
                    searchTerm: current.searchTerm || '',
                    statusFilter: current.statusFilter || 'all',
                    colorFilter: current.colorFilter || 'all',
                    includeDuplicates: Boolean(current.includeDuplicates)
                };
            }
            return resolveFilterStateFromDom();
        }

        function includeDuplicatesNow() {
            const resolver = ensureFilterOptionsResolver();
            if (resolver && typeof resolver.includeDuplicates === 'function') {
                return Boolean(resolver.includeDuplicates());
            }
            if (filterStateResolver && typeof filterStateResolver.includeDuplicates === 'function') {
                return Boolean(filterStateResolver.includeDuplicates());
            }
            const filterState = resolveFilterState();
            return Boolean(filterState.includeDuplicates);
        }

        function ocrToggleState() {
            return Boolean(dom.showOcrToggle && dom.showOcrToggle.checked);
        }

        function fragmentHasContent(fragment) {
            if (!fragment) {
                return false;
            }
            if (typeof fragment.childNodes !== 'undefined' && fragment.childNodes !== null) {
                return fragment.childNodes.length > 0;
            }
            if (typeof fragment.children !== 'undefined' && fragment.children !== null) {
                return fragment.children.length > 0;
            }
            return Boolean(fragment.firstChild);
        }

        function deriveRenderEntries(includeDuplicates) {
            if (!Array.isArray(state.records)) {
                return [];
            }

            const visibleTotal = state.records.reduce((count, currentRecord) => {
                if (!currentRecord || typeof currentRecord !== 'object') {
                    return count;
                }
                return isRecordDuplicate(currentRecord) ? count : count + 1;
            }, 0);

            const entries = [];
            let visibleCounter = 0;

            state.records.forEach((record, index) => {
                if (!record || typeof record !== 'object') {
                    return;
                }
                const duplicateRecord = isRecordDuplicate(record);
                if (!duplicateRecord) {
                    visibleCounter += 1;
                }
                if (duplicateRecord && !includeDuplicates) {
                    return;
                }
                const visibleIndex = duplicateRecord ? (visibleCounter > 0 ? visibleCounter : 0) : visibleCounter;
                entries.push({
                    record,
                    recordIndex: index,
                    visibleIndex,
                    visibleTotal
                });
            });

            return entries;
        }

        function renderEntriesToFragment(entries) {
            const fragment = createDocumentFragment();
            const items = [];

            entries.forEach(({ record, recordIndex, visibleIndex, visibleTotal }) => {
                const item = createItem(record, recordIndex, visibleIndex, visibleTotal);
                if (item) {
                    fragment.appendChild(item);
                    items.push(item);
                }
            });

            return { fragment, items };
        }

        function setOcrVisibility(show) {
            stateControls.setShowOcr(Boolean(show));
            if (dom.showOcrToggle) {
                dom.showOcrToggle.checked = state.showOcr;
            }
            if (!dom.gallery) {
                return;
            }
            dom.gallery.querySelectorAll('.raw, .prediction').forEach((element) => {
                element.style.display = state.showOcr ? '' : 'none';
            });
        }

        function buildGallery() {
            const includeDuplicates = includeDuplicatesNow();
            clearGalleryElement();

            const entries = deriveRenderEntries(includeDuplicates);
            const { fragment, items } = renderEntriesToFragment(entries);

            stateControls.setItems(items);
            markItemStateCacheDirty();
            refreshItemStateCache({ force: true });

            if (fragmentHasContent(fragment) && dom.gallery) {
                dom.gallery.appendChild(fragment);
            }

            updateSummary();
            setOcrVisibility(ocrToggleState());

            if (!state.items.length) {
                showStatus('表示できる結果がありません。', false);
                return;
            }
            clearStatus();
            applyFilters();
        }

        function clearGalleryElement() {
            if (!dom.gallery) {
                return;
            }
            dom.gallery.textContent = '';
        }

        function resolveItemElement(element) {
            if (!element) {
                return null;
            }
            if (element.classList && element.classList.contains('item')) {
                return element;
            }
            return element.closest ? element.closest('.item') : null;
        }

        function getItemContext(element) {
            const item = resolveItemElement(element);
            if (!item) {
                return null;
            }
            const recordIndex = Number(item.dataset.recordIndex);
            const record = getRecordByIndex(recordIndex);
            if (!record) {
                return null;
            }
            return { item, recordIndex, record };
        }

        function normalizeItemColor(value) {
            const text = (value || '').toString().trim().toLowerCase();
            const option = colorOptions.find((entry) => entry.key === text);
            return option ? option.key : '';
        }

        function normalizeItemRelicType(value) {
            const text = (value || '').toString().trim().toLowerCase();
            if (!text) {
                return '';
            }
            if (text === 'normal' || text === '通常') {
                return 'normal';
            }
            if (text === 'deep' || text === '深層' || text === '深層遺物') {
                return 'deep';
            }
            return '';
        }

        function applyItemColor(item, colorKey) {
            if (!item) {
                return;
            }
            markItemStateCacheDirty();
            const normalized = normalizeItemColor(colorKey);
            colorOptions.forEach((entry) => {
                if (entry.className) {
                    item.classList.remove(entry.className);
                }
            });
            if (normalized) {
                const option = colorOptions.find((entry) => entry.key === normalized);
                if (option && option.className) {
                    item.classList.add(option.className);
                }
                item.dataset.itemColor = normalized;
            } else {
                delete item.dataset.itemColor;
            }
            const select = item.querySelector('.item-color-select');
            if (select) {
                const value = normalized || '';
                select.value = value;
                select.classList.remove('option-red', 'option-yellow', 'option-green', 'option-blue', 'option-none');
                select.classList.add(value ? `option-${value}` : 'option-none');
            }
        }

        function applyItemRelicType(item, relicType) {
            if (!item) {
                return;
            }
            markItemStateCacheDirty();
            const normalized = normalizeItemRelicType(relicType);
            if (normalized) {
                item.dataset.relicType = normalized;
            } else {
                delete item.dataset.relicType;
            }
            const select = item.querySelector('.item-relic-type-select');
            if (select) {
                const value = normalized || '';
                select.value = value;
                select.classList.remove('option-normal', 'option-deep', 'option-none');
                select.classList.add(value ? `option-${value}` : 'option-none');
            }
        }

        const normalizeItemTags =
            tagStoreApi && typeof tagStoreApi.normalizeTags === 'function'
                ? (value) => tagStoreApi.normalizeTags(value)
                : (value) => formatTagTokens(value);

        function applyItemTags(item, tagsValue) {
            if (!item) {
                return;
            }
            markItemStateCacheDirty();
            const entry = buildTagEntry(tagsValue);
            const normalized = entry.normalized;
            const tokens = Array.isArray(entry.tokens) ? entry.tokens : [];
            if (tokens.length) {
                item.dataset.tags = tokens.join(' ');
                item.dataset.tagTokens = tokens.map((token) => token.toLowerCase()).join(' ');
            } else {
                delete item.dataset.tags;
                delete item.dataset.tagTokens;
            }
            const input = item.querySelector('.item-tags-input');
            if (input) {
                const controllerHasSync = Boolean(
                    tagInputController && typeof tagInputController.syncValue === 'function'
                );
                const usesEnhancedController = controllerHasSync && tagInputController.usesNativeInput !== true;
                if (usesEnhancedController) {
                    tagInputController.syncValue(input, tokens);
                } else {
                    const displayValue = tokens.join(' ');
                    const isEditing = Boolean(
                        (input.dataset && input.dataset.editingTags === 'true') ||
                            (typeof document !== 'undefined' && document &&
                                document.activeElement === input)
                    );
                    if (!isEditing) {
                        if (controllerHasSync) {
                            tagInputController.syncValue(input, tokens);
                        } else if (input.value !== displayValue) {
                            input.value = displayValue;
                        }
                    }
                }
            }
        }

        function syncItemTagsState(item) {
            if (!item) {
                return;
            }
            const context = getItemContext(item);
            const tagsValue = context && context.record ? context.record.Tags : '';
            applyItemTags(item, tagsValue);
        }

        function updateFavoriteVisuals(item, isFavorite) {
            if (!item) {
                return;
            }
            markItemStateCacheDirty();
            const button = item.querySelector('.favorite-toggle');
            const active = Boolean(isFavorite);
            item.dataset.favorite = active ? 'true' : 'false';
            item.classList.toggle('is-favorite', active);
            if (button) {
                button.textContent = active ? '★ お気に入り' : '☆ お気に入り';
                button.classList.toggle('is-active', active);
                button.setAttribute('aria-pressed', active ? 'true' : 'false');
            }
        }

        function syncFavoriteState(item) {
            if (!item) {
                return;
            }
            const context = getItemContext(item);
            const isFavorite = context ? isRecordFavorite(context.record) : false;
            updateFavoriteVisuals(item, isFavorite);
        }

        function updateDuplicateVisuals(item, isDuplicate) {
            if (!item) {
                return;
            }
            markItemStateCacheDirty();
            const value = Boolean(isDuplicate);
            item.dataset.duplicate = value ? 'true' : 'false';
            item.classList.toggle('is-duplicate', value);

            const button = item.querySelector('.duplicate-toggle');
            if (button) {
                button.textContent = value ? '重複を解除' : '重複';
                button.setAttribute('aria-pressed', value ? 'true' : 'false');
            }
        }

        function syncDuplicateState(item) {
            if (!item) {
                return;
            }
            const context = getItemContext(item);
            const imageName = item.dataset.imageName || '';
            const recordDuplicate = context ? isRecordDuplicate(context.record) : false;
            const storedDuplicate = imageName ? duplicates.has(imageName) : false;
            const isDuplicate = recordDuplicate || storedDuplicate;
            if (imageName) {
                duplicates.set(imageName, isDuplicate);
            }
            updateDuplicateVisuals(item, isDuplicate);
        }

        function syncItemColorState(item) {
            if (!item) {
                return;
            }
            const context = getItemContext(item);
            const colorKey = context ? context.record.ItemColor : '';
            applyItemColor(item, colorKey);
        }

        function syncItemRelicTypeState(item) {
            if (!item) {
                return;
            }
            const context = getItemContext(item);
            const relicType = context ? context.record.RelicType : '';
            applyItemRelicType(item, relicType);
        }

        function normalizeSearchToken(value) {
            if (value == null) {
                return '';
            }
            return String(value).trim().toLowerCase();
        }

        function parseTagTokensValue(text) {
            if (!text) {
                return [];
            }
            return text
                .split(/\s+/)
                .map((token) => normalizeSearchToken(token))
                .filter((token) => token !== '');
        }

        function collectTagSearchOptions(records) {
            if (!Array.isArray(records) || !records.length || !parseTagTokens) {
                return [];
            }
            const seen = new Set();
            const options = [];
            records.forEach((record) => {
                const tokens = parseTagTokens(record && record.Tags);
                tokens.forEach((token) => {
                    const text = token == null ? '' : String(token).trim();
                    if (!text) {
                        return;
                    }
                    const key = text.toLowerCase();
                    if (seen.has(key)) {
                        return;
                    }
                    seen.add(key);
                    options.push({ value: text, text });
                });
            });
            return options;
        }

        function parseEffectSlotsValue(jsonText) {
            if (!jsonText) {
                return [];
            }
            try {
                const parsed = JSON.parse(jsonText);
                if (Array.isArray(parsed)) {
                    return parsed
                        .map((entry) => normalizeSearchToken(entry))
                        .filter((entry) => entry !== '')
                        .slice(0, 3);
                }
            } catch (error) {
                console.warn('効果検索キャッシュの解析に失敗しました:', error);
            }
            return [];
        }

        function normalizeEffectSearchTerms(value) {
            const text = normalizeSearchToken(value);
            if (!text) {
                return [];
            }
            return text
                .split(/\s+/)
                .map((term) => normalizeSearchToken(term))
                .filter((term) => term !== '');
        }

        function collectEffectSearchEntries() {
            if (!Array.isArray(dom.effectSearchInputs)) {
                return [];
            }
            const modes = Array.isArray(dom.effectSearchModes) ? dom.effectSearchModes : [];
            return dom.effectSearchInputs
                .map((input, index) => {
                    const terms = normalizeEffectSearchTerms(input && input.value);
                    if (!terms.length) {
                        return null;
                    }
                    const modeNode = modes[index] || null;
                    const mode = modeNode && modeNode.value === 'or' ? 'or' : 'and';
                    return { terms, mode };
                })
                .filter((entry) => entry !== null);
        }

        function getTagSearchTerms() {
            if (tagSearchController && typeof tagSearchController.getValues === 'function') {
                const selectedValues = tagSearchController.getValues();
                const normalizedSelected = parseTagTokensValue(
                    Array.isArray(selectedValues) ? selectedValues.join(' ') : selectedValues
                );
                if (normalizedSelected.length) {
                    return normalizedSelected;
                }
            }
            if (!dom.tagSearchInput) {
                return [];
            }
            return parseTagTokensValue(dom.tagSearchInput.value || '');
        }

        function ensureFilterOptionsResolver() {
            if (!filterOptionsResolver && typeof createFilterOptionsResolverFn === 'function') {
                filterOptionsResolver = createFilterOptionsResolverFn({
                    filterStateBridge: filterStateResolver,
                    filterStore: filterStoreApi,
                    resolveDomState: resolveFilterStateFromDom,
                    collectEffectSearchEntries,
                    getTagSearchTerms
                });
            }
            return filterOptionsResolver;
        }

        function resolveFilterOptions() {
            const resolver = ensureFilterOptionsResolver();
            if (resolver && typeof resolver.resolveOptions === 'function') {
                return resolver.resolveOptions();
            }

            const filterState = resolveFilterState();
            return {
                term: (filterState.searchTerm || '').trim().toLowerCase(),
                filter: filterState.statusFilter || 'all',
                colorFilter: filterState.colorFilter || 'all',
                includeDuplicates: Boolean(filterState.includeDuplicates),
                effectSearches: collectEffectSearchEntries(),
                tagTerms: getTagSearchTerms()
            };
        }

        function readEffectSlots(item) {
            if (!item || !item.dataset) {
                return [];
            }
            return parseEffectSlotsValue(item.dataset.effectSlots || '');
        }

        function readTagTokens(item) {
            if (!item || !item.dataset) {
                return [];
            }
            const tokens = item.dataset.tagTokens || item.dataset.tags || '';
            return parseTagTokensValue(tokens);
        }

        const itemStateHelpers = {
            normalizeItemColor,
            normalizeItemRelicType,
            readEffectSlots,
            readTagTokens
        };

        function getItemStateResolver() {
            if (itemStateResolver || typeof createItemStateResolverFn !== 'function') {
                return itemStateResolver;
            }
            itemStateResolver = createItemStateResolverFn({
                mapItemElementsToState: mapItemElementsToStateFn,
                helpers: itemStateHelpers
            });
            return itemStateResolver;
        }

        function markItemStateCacheDirty() {
            itemStateCacheDirty = true;
        }

        function refreshItemStateCache({ force = false } = {}) {
            const resolver = getItemStateResolver();
            if (!force && !itemStateCacheDirty) {
                if (resolver && typeof resolver.getAll === 'function') {
                    return resolver.getAll();
                }
                return itemStateCache;
            }

            const items = Array.isArray(state.items) ? state.items : [];
            if (resolver && typeof resolver.refresh === 'function') {
                itemStateCache = resolver.refresh(items, itemStateHelpers);
            } else {
                itemStateCache = mapItemElementsToStateFn(items, itemStateHelpers);
            }
            itemStateCacheDirty = false;
            return itemStateCache;
        }

        function getItemStates() {
            return refreshItemStateCache({ force: false });
        }

        function refreshItemCaches(item) {
            if (!item) {
                return;
            }
            markItemStateCacheDirty();
            const baseTokens = [];

            const imageToken = item.dataset.image;
            if (imageToken) {
                baseTokens.push(imageToken);
            }
            const baseImageToken = item.dataset.baseImage;
            if (baseImageToken) {
                baseTokens.push(baseImageToken);
            }
            const datasetToken = item.dataset.datasetLabel;
            if (datasetToken) {
                baseTokens.push(datasetToken);
            }
            const tagsToken = item.dataset.tags;
            const normalizedTagTokens = parseTagTokensValue(tagsToken);
            if (normalizedTagTokens.length) {
                normalizedTagTokens.forEach((token) => {
                    baseTokens.push(token);
                });
                item.dataset.tagTokens = normalizedTagTokens.join(' ');
            } else {
                delete item.dataset.tagTokens;
            }

            const effectEntries = [];
            const effectSlotValues = [];
            const effectSlotStatuses = [];

            item.querySelectorAll('.effect').forEach((effect) => {
                const {
                    pred = '',
                    raw = '',
                    correction = '',
                    status = 'pending',
                    level = '',
                    levelOptions = '',
                    levelCorrection = ''
                } = effect.dataset;
                effectEntries.push({
                    prediction: pred,
                    raw,
                    correction,
                    status,
                    level,
                    levelOptions,
                    levelCorrection
                });

                if (effect.dataset && effect.dataset.kind === 'effect') {
                    const slotIndex = Number.parseInt(effect.dataset.slot, 10);
                    if (Number.isFinite(slotIndex) && slotIndex > 0 && slotIndex <= 3) {
                        const effectNames = [
                            effect.dataset.correction,
                            effect.dataset.predictionValue,
                            pred,
                            raw
                        ]
                            .map((value) => normalizeSearchToken(value))
                            .filter((value) => value !== '');
                        const normalizedStatus = normalizeStatus(status);
                        if (normalizedStatus) {
                            effectSlotStatuses[slotIndex - 1] = normalizedStatus;
                        }
                        if (effectNames.length) {
                            effectSlotValues[slotIndex - 1] = effectNames.join(' ');
                        }
                    }
                }
            });

            const caches = buildItemSearchCaches({ baseTokens, effects: effectEntries }) || {};

            const { searchCache = '', statusCache = '', effectStates = [] } = caches || {};
            item.dataset.searchCache = searchCache || '';
            item.dataset.statusCache = statusCache || '';
            const effectStateList = Array.isArray(effectStates)
                ? effectStates
                : typeof effectStates === 'string'
                  ? effectStates.split(',').map((value) => value.trim()).filter((value) => value !== '')
                  : [];
            item.dataset.effectStates = effectStateList
                .filter((value) => value != null && value !== '')
                .join(',');
            const normalizedEffectSlots = effectSlotValues
                .slice(0, 3)
                .map((value) => normalizeSearchToken(value));
            if (normalizedEffectSlots.some((value) => value !== '')) {
                item.dataset.effectSlots = JSON.stringify(normalizedEffectSlots);
            } else {
                delete item.dataset.effectSlots;
            }
            const normalizedSlotStatuses = effectSlotStatuses
                .slice(0, 3)
                .map((value) => normalizeStatus(value));
            if (normalizedSlotStatuses.some((value) => value && value !== '')) {
                item.dataset.effectSlotStatuses = JSON.stringify(normalizedSlotStatuses);
            } else {
                delete item.dataset.effectSlotStatuses;
            }
        }

        function syncTagSearchOptions(records, { clearSelection = false } = {}) {
            if (!tagSearchController || !dom.tagSearchInput) {
                return;
            }
            const options = collectTagSearchOptions(records || state.records || []);
            tagSearchController.setOptions(options, { clearSelection });
        }

        function applyFilters() {
            const resolvedOptions = resolveFilterOptions() || {};
            const {
                term = '',
                filter = 'all',
                colorFilter = 'all',
                includeDuplicates: includeDuplicatesOption = false,
                effectSearches = [],
                tagTerms = []
            } = resolvedOptions;

            const normalizedOptions = {
                term,
                filter,
                colorFilter,
                includeDuplicates: Boolean(includeDuplicatesOption),
                effectSearches: Array.isArray(effectSearches) ? effectSearches : [],
                tagTerms: Array.isArray(tagTerms) ? tagTerms : []
            };

            const itemStates = getItemStates();

            const visibility =
                typeof filterItemsFn === 'function' ? filterItemsFn(itemStates, normalizedOptions) : null;

            state.items.forEach((item, index) => {
                if (!item) {
                    return;
                }
                let visible = true;
                if (Array.isArray(visibility) && index < visibility.length) {
                    visible = Boolean(visibility[index]);
                } else if (typeof evaluateItemVisibilityFn === 'function') {
                    visible = Boolean(evaluateItemVisibilityFn(itemStates[index], normalizedOptions));
                }
                item.style.display = visible ? '' : 'none';
            });
            updateSummary();
        }

        if (tagSearchController && typeof tagSearchController.onChange === 'function') {
            tagSearchController.onChange(() => applyFilters());
        }

        return {
            buildGallery,
            applyFilters,
            setOcrVisibility,
            getOcrToggleState: ocrToggleState,
            includeDuplicatesNow,
            getItemContext,
            updateFavoriteVisuals,
            updateDuplicateVisuals,
            applyItemColor,
            normalizeItemColor,
            applyItemRelicType,
            normalizeItemRelicType,
            applyItemTags,
            normalizeItemTags,
            refreshItemCaches,
            syncTagSearchOptions
        };
    }

    if (!window.galleryRenderFactory) {
        window.galleryRenderFactory = {};
    }
    window.galleryRenderFactory.createGalleryView = createGalleryView;
})();

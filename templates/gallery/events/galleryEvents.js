(() => {
    function createGalleryEvents(config = {}) {
        const {
            dom = {},
            state = {},
            datasetState = {},
            duplicates,
            showStatus = () => {},
            clearStatus = () => {},
            setStorageStatus = () => {},
            parseCsvRecords = () => [],
            loadRecordsArray = () => {},
            generateCsv = () => '',
            csvFileName = () => 'results.csv',
            sanitizeLevelList,
            sortLevelsAscending,
            updateEffectStatus,
            setCorrectionLevelCandidates,
            rebuildLevelSelectOptions,
            createCorrectionInput,
            getEffectIndexes,
            updateInputValueAttribute,
            updateLevelInputAvailability,
            applyMasterLevelOptions,
            validateMasterEffectValue = () => true,
            validateMasterDemeritValue = () => true,
            syncDemeritAvailability = () => {},
            createRecordActionHandlers: createRecordActionHandlersConfig,
            createTagInputEvents: createTagInputEventsConfig,
            tagStore
        } = config;

        if (!dom || typeof dom !== 'object') {
            throw new Error('createGalleryEvents: dom reference is required');
        }
        if (!state || typeof state !== 'object') {
            throw new Error('createGalleryEvents: state reference is required');
        }
        if (!datasetState || typeof datasetState !== 'object') {
            throw new Error('createGalleryEvents: datasetState reference is required');
        }
        if (!duplicates || typeof duplicates !== 'object') {
            throw new Error('createGalleryEvents: duplicates manager is required');
        }
        if (typeof sanitizeLevelList !== 'function') {
            throw new Error('createGalleryEvents: sanitizeLevelList helper is required');
        }
        if (typeof sortLevelsAscending !== 'function') {
            throw new Error('createGalleryEvents: sortLevelsAscending helper is required');
        }
        if (typeof updateEffectStatus !== 'function') {
            throw new Error('createGalleryEvents: updateEffectStatus helper is required');
        }
        if (typeof setCorrectionLevelCandidates !== 'function') {
            throw new Error('createGalleryEvents: setCorrectionLevelCandidates helper is required');
        }
        if (typeof rebuildLevelSelectOptions !== 'function') {
            throw new Error('createGalleryEvents: rebuildLevelSelectOptions helper is required');
        }
        if (typeof createCorrectionInput !== 'function') {
            throw new Error('createGalleryEvents: createCorrectionInput helper is required');
        }
        if (typeof getEffectIndexes !== 'function') {
            throw new Error('createGalleryEvents: getEffectIndexes helper is required');
        }
        if (typeof updateInputValueAttribute !== 'function') {
            throw new Error('createGalleryEvents: updateInputValueAttribute helper is required');
        }
        if (typeof updateLevelInputAvailability !== 'function') {
            throw new Error('createGalleryEvents: updateLevelInputAvailability helper is required');
        }
        if (typeof applyMasterLevelOptions !== 'function') {
            throw new Error('createGalleryEvents: applyMasterLevelOptions helper is required');
        }
        if (typeof syncDemeritAvailability !== 'function') {
            throw new Error('createGalleryEvents: syncDemeritAvailability helper is required');
        }
        if (typeof validateMasterEffectValue !== 'function') {
            throw new Error('createGalleryEvents: validateMasterEffectValue helper is required');
        }
        if (typeof validateMasterDemeritValue !== 'function') {
            throw new Error('createGalleryEvents: validateMasterDemeritValue helper is required');
        }

        const handlersNamespace = typeof window !== 'undefined' && window ? window.galleryEventHandlersFactory : null;
        const createRecordActionHandlersFn =
            typeof createRecordActionHandlersConfig === 'function'
                ? createRecordActionHandlersConfig
                : handlersNamespace && typeof handlersNamespace.createRecordActionHandlers === 'function'
                  ? handlersNamespace.createRecordActionHandlers
                  : null;

        const eventsNamespace = typeof window !== 'undefined' && window ? window.galleryEventsFactory : null;
        const createTagInputEventsFn =
            typeof createTagInputEventsConfig === 'function'
                ? createTagInputEventsConfig
                : eventsNamespace && typeof eventsNamespace.createTagInputEvents === 'function'
                  ? eventsNamespace.createTagInputEvents
                  : null;

        if (typeof createRecordActionHandlersFn !== 'function') {
            throw new Error('createGalleryEvents: createRecordActionHandlers helper is required');
        }

        function openLightbox(img) {
            if (!img || !dom.lightbox || !dom.lightboxImg) {
                return;
            }
            dom.lightboxImg.src = img.dataset.full || img.src;
            dom.lightboxImg.alt = img.alt || '';
            dom.lightbox.classList.add('show');
            dom.lightbox.setAttribute('aria-hidden', 'false');
            if (dom.lightboxClose) {
                dom.lightboxClose.focus();
            }
        }

        function closeLightbox() {
            if (!dom.lightbox || !dom.lightboxImg) {
                return;
            }
            dom.lightbox.classList.remove('show');
            dom.lightbox.setAttribute('aria-hidden', 'true');
            dom.lightboxImg.src = '';
            dom.lightboxImg.alt = '';
        }

        function bindImage(img) {
            if (!img) {
                return;
            }
            img.addEventListener('click', () => openLightbox(img));
            img.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ' || event.keyCode === 13 || event.keyCode === 32) {
                    event.preventDefault();
                    openLightbox(img);
                }
            });
        }

        function handleCsvExport() {
            if (!Array.isArray(state.records) || !state.records.length) {
                setStorageStatus('エクスポート可能なデータがありません。', true);
                return;
            }

            const csvText = generateCsv(state.records);
            if (!csvText) {
                setStorageStatus('エクスポート失敗: CSVを生成できませんでした。', true);
                return;
            }

            const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = csvFileName();
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            setStorageStatus('CSVをダウンロードしました。', false);
        }

        async function handleCsvImportFile(file) {
            if (!file) {
                return;
            }
            setStorageStatus('ローカルファイルからのインポートは無効化されています。結果フォルダ内のCSVを直接編集してください。', true);
            if (dom.uploadCsvInput) {
                dom.uploadCsvInput.value = '';
            }
        }

        function attachEventHandlers(handlers = {}) {
            if (dom.gallery && dom.gallery.dataset.eventsBound === 'true') {
                return;
            }
            if (dom.gallery) {
                dom.gallery.dataset.eventsBound = 'true';
            }

            const {
                switchDataset = () => {},
                setRelicTypeFilter = () => {},
                buildGallery = () => {},
                applyFilters = () => {},
                setOcrVisibility = () => {},
                getOcrToggleState = () => false,
                getItemContext = () => null,
                updateFavoriteVisuals = () => {},
                updateDuplicateVisuals = () => {},
                applyItemColor = () => {},
                normalizeItemColor = (value) => value,
                applyItemRelicType = () => {},
                normalizeItemRelicType = (value) => value,
                applyItemTags = () => {},
                normalizeItemTags = (value) => value,
                refreshItemCaches = () => {},
                tagStore = null,
                applyMasterDataForRelicType = () => {},
                isRecordDuplicate = () => false,
                isRecordFavorite = () => false,
                setRecordDuplicate = () => false,
                setRecordFavorite = () => false,
                setRecordItemColor = () => false,
                setRecordItemRelicType = () => false,
                setRecordTags = () => false,
                recordStatusChange = () => false,
                updateRecordEffectValue = () => false,
                updateRecordLevelValue = () => false,
                updateRecordLevelOptions = () => false,
                scheduleSave = () => {}
            } = handlers;

            function resolveTagsInputTarget(target) {
                if (!target || typeof target.closest !== 'function') {
                    return null;
                }
                const direct = target.closest('.item-tags-input');
                if (direct) {
                    return direct;
                }
                const root = target.closest('[data-tag-input-root="true"]');
                if (!root || typeof root.querySelector !== 'function') {
                    return null;
                }
                const input = root.querySelector('.item-tags-input');
                return input || null;
            }

            const recordActions = createRecordActionHandlersFn({
                duplicates,
                scheduleSave,
                applyFilters,
                buildGallery,
                applyItemColor,
                applyItemRelicType,
                applyItemTags,
                updateFavoriteVisuals,
                updateDuplicateVisuals,
                refreshItemCaches,
                getItemContext,
                normalizeItemColor,
                normalizeItemRelicType,
                normalizeItemTags,
                tagStore,
                isRecordDuplicate,
                isRecordFavorite,
                setRecordDuplicate,
                setRecordFavorite,
                setRecordItemColor,
                setRecordItemRelicType,
                setRecordTags,
                applyMasterDataForRelicType,
                recordStatusChange,
                updateRecordEffectValue,
                updateRecordLevelValue,
                updateRecordLevelOptions,
                updateEffectStatus,
                sanitizeLevelList,
                sortLevelsAscending,
                createCorrectionInput,
                setCorrectionLevelCandidates,
                rebuildLevelSelectOptions,
                getEffectIndexes,
                updateInputValueAttribute,
                updateLevelInputAvailability,
                applyMasterLevelOptions,
                syncDemeritAvailability,
                validateMasterEffectValue,
                validateMasterDemeritValue
            });

            const {
                toggleDuplicate,
                toggleFavorite,
                toggleItemColor,
                toggleItemRelicType,
                updateItemTags,
                changeEffectCorrection,
                changeEffectLevel,
                toggleReviewStatus
            } = recordActions;

            const tagInputEventsFactory =
                typeof createTagInputEventsFn === 'function'
                    ? createTagInputEventsFn
                    : ({ galleryElement, resolveTagsInputTarget: resolveTarget, updateItemTags: updateTags, getItemContext: getContext, tagStore: store }) => {
                          if (!galleryElement || typeof galleryElement.addEventListener !== 'function') {
                              return null;
                          }
                          const storeApi = store && typeof store.readRecordTags === 'function' ? store : null;

                          const syncFromStore = (input) => {
                              if (!storeApi || !input || typeof getContext !== 'function') {
                                  return;
                              }
                              const context = getContext(input);
                              if (!context || !context.item) {
                                  return;
                              }
                              const entry = storeApi.readRecordTags(context.recordIndex);
                              const tokens = Array.isArray(entry.tokens) ? entry.tokens : [];
                              const normalized = entry.normalized || '';
                              if (input.dataset && input.dataset.tagInputEnhanced === 'true') {
                                  return;
                              }
                              const display = tokens.length ? tokens.join(' ') : normalized;
                              if (typeof input.value === 'string' && input.value !== display) {
                                  input.value = display;
                              }
                          };

                          return {
                              bind() {
                                  galleryElement.addEventListener('input', (event) => {
                                      const target = resolveTarget(event.target);
                                      if (!target) {
                                          return;
                                      }
                                      if (target.dataset) {
                                          target.dataset.editingTags = 'true';
                                      }
                                      updateTags(target);
                                  });
                                  galleryElement.addEventListener('focusin', (event) => {
                                      const target = resolveTarget(event.target);
                                      if (target && target.dataset) {
                                          target.dataset.editingTags = 'true';
                                      }
                                  });
                                  galleryElement.addEventListener('focusout', (event) => {
                                      const target = resolveTarget(event.target);
                                      if (!target) {
                                          return;
                                      }
                                      if (target.dataset) {
                                          delete target.dataset.editingTags;
                                      }
                                      updateTags(target);
                                      syncFromStore(target);
                                  });
                              },
                              handleChange(event) {
                                  const target = resolveTarget(event.target);
                                  if (!target) {
                                      return false;
                                  }
                                  updateTags(target);
                                  return true;
                              }
                          };
                      };

            const tagInputEvents =
                typeof tagInputEventsFactory === 'function'
                    ? tagInputEventsFactory({
                          galleryElement: dom.gallery,
                          resolveTagsInputTarget,
                          updateItemTags,
                          getItemContext,
                          tagStore
                      })
                    : null;

            if (tagInputEvents && typeof tagInputEvents.bind === 'function') {
                tagInputEvents.bind();
            }

            if (dom.relicTypeSelect) {
                dom.relicTypeSelect.addEventListener('change', (event) => {
                    setRelicTypeFilter(event.target.value);
                });
            }

            if (dom.datasetSelect) {
                dom.datasetSelect.addEventListener('change', (event) => {
                    const value = Number.parseInt(event.target.value, 10);
                    if (Number.isNaN(value)) {
                        return;
                    }
                    void switchDataset(value);
                });
            }

            if (dom.gallery) {
                dom.gallery.addEventListener('click', (event) => {
                    const duplicateButton = event.target.closest('.duplicate-toggle');
                    if (duplicateButton) {
                        event.preventDefault();
                        toggleDuplicate(duplicateButton);
                        return;
                    }

                    const favoriteButton = event.target.closest('.favorite-toggle');
                    if (favoriteButton) {
                        event.preventDefault();
                        toggleFavorite(favoriteButton);
                        return;
                    }

                    const button = event.target.closest('.review-button');
                    if (!button) {
                        return;
                    }
                    const effect = button.closest('.effect');
                    if (!effect) {
                        return;
                    }
                    toggleReviewStatus(effect, button);
                });

                dom.gallery.addEventListener('change', (event) => {
                    if (tagInputEvents && typeof tagInputEvents.handleChange === 'function') {
                        const handled = tagInputEvents.handleChange(event);
                        if (handled) {
                            return;
                        }
                    }
                    const relicTypeSelect = event.target.closest('.item-relic-type-select');
                    if (relicTypeSelect) {
                        toggleItemRelicType(relicTypeSelect);
                        return;
                    }
                    const colorSelect = event.target.closest('.item-color-select');
                    if (colorSelect) {
                        toggleItemColor(colorSelect);
                        return;
                    }
                    const correctionInput = event.target.closest('.correction-input');
                    if (correctionInput) {
                        const effect = correctionInput.closest('.effect');
                        if (effect) {
                            changeEffectCorrection(effect, correctionInput);
                        }
                        return;
                    }
                    const levelInput = event.target.closest('.level-input');
                    if (levelInput) {
                        const effect = levelInput.closest('.effect');
                        if (effect) {
                            changeEffectLevel(effect, levelInput);
                        }
                    }
                });
            }

            if (dom.searchInput) {
                dom.searchInput.addEventListener('input', applyFilters);
            }
            if (Array.isArray(dom.effectSearchInputs)) {
                dom.effectSearchInputs.forEach((input) => {
                    input.addEventListener('input', applyFilters);
                });
            }
            if (Array.isArray(dom.effectSearchModes)) {
                dom.effectSearchModes.forEach((select) => {
                    if (select) {
                        select.addEventListener('change', applyFilters);
                    }
                });
            }
            if (dom.tagSearchInput) {
                dom.tagSearchInput.addEventListener('input', applyFilters);
            }
            if (dom.filterSelect) {
                dom.filterSelect.addEventListener('change', applyFilters);
            }
            if (dom.colorFilter) {
                dom.colorFilter.addEventListener('change', applyFilters);
            }
            if (dom.showDuplicatesToggle) {
                dom.showDuplicatesToggle.addEventListener('change', () => {
                    buildGallery();
                });
            }
            if (dom.showOcrToggle) {
                dom.showOcrToggle.addEventListener('change', () => {
                    setOcrVisibility(getOcrToggleState());
                });
            }
            if (dom.downloadCsvButton) {
                dom.downloadCsvButton.addEventListener('click', handleCsvExport);
            }
            if (dom.uploadCsvButton && dom.uploadCsvInput) {
                dom.uploadCsvButton.addEventListener('click', () => {
                    dom.uploadCsvInput.value = '';
                    dom.uploadCsvInput.click();
                });
                dom.uploadCsvInput.addEventListener('change', () => {
                    const files = dom.uploadCsvInput.files || [];
                    const file = files.length ? files[0] : null;
                    if (file) {
                        void handleCsvImportFile(file);
                    }
                });
            }
            if (dom.lightboxClose) {
                dom.lightboxClose.addEventListener('click', closeLightbox);
            }
            if (dom.lightbox) {
                dom.lightbox.addEventListener('click', (event) => {
                    if (event.target === dom.lightbox) {
                        closeLightbox();
                    }
                });
            }
            document.addEventListener('keydown', (event) => {
                if ((event.key === 'Escape' || event.keyCode === 27) && dom.lightbox && dom.lightbox.classList.contains('show')) {
                    closeLightbox();
                }
            });
        }

        return { bindImage, attachEventHandlers, closeLightbox };
    }

    if (!window.galleryEventsFactory) {
        window.galleryEventsFactory = {};
    }
    window.galleryEventsFactory.createGalleryEvents = createGalleryEvents;
})();

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
            updateLevelBadge,
            getEffectIndexes,
            updateInputValueAttribute,
            updateLevelInputAvailability,
            applyMasterLevelOptions
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
        if (typeof updateLevelBadge !== 'function') {
            throw new Error('createGalleryEvents: updateLevelBadge helper is required');
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
                buildGallery = () => {},
                applyFilters = () => {},
                setOcrVisibility = () => {},
                getOcrToggleState = () => false,
                getItemContext = () => null,
                updateFavoriteVisuals = () => {},
                updateDuplicateVisuals = () => {},
                applyItemColor = () => {},
                normalizeItemColor = (value) => value,
                refreshItemCaches = () => {},
                getRecordByIndex = () => null,
                isRecordDuplicate = () => false,
                isRecordFavorite = () => false,
                setRecordDuplicate = () => false,
                setRecordFavorite = () => false,
                setRecordItemColor = () => false,
                recordStatusChange = () => false,
                updateRecordCorrection = () => false,
                updateRecordLevelCorrection = () => false,
                updateRecordLevelSuppressed = () => false,
                updateRecordLevelValue = () => false,
                updateRecordLevelOptions = () => false,
                scheduleSave = () => {}
            } = handlers;

            function handleDuplicateToggle(button) {
                if (!button) {
                    return;
                }
                const context = getItemContext(button);
                if (!context) {
                    return;
                }
                const { item, record, recordIndex } = context;
                const imageName = button.dataset.image || item.dataset.imageName || '';
                const currentState = isRecordDuplicate(record) || item.dataset.duplicate === 'true';
                const nextState = !currentState;
                if (imageName) {
                    button.dataset.image = imageName;
                    duplicates.set(imageName, nextState);
                }
                const recordChanged = setRecordDuplicate(recordIndex, nextState);
                updateDuplicateVisuals(item, nextState);
                if (recordChanged) {
                    scheduleSave();
                }
                buildGallery();
            }

            function handleFavoriteToggle(button) {
                if (!button) {
                    return;
                }
                const context = getItemContext(button);
                if (!context) {
                    return;
                }
                const { item, record, recordIndex } = context;
                const nextState = !isRecordFavorite(record);
                const recordChanged = setRecordFavorite(recordIndex, nextState);
                updateFavoriteVisuals(item, nextState);
                if (recordChanged) {
                    scheduleSave();
                }
                applyFilters();
            }

            function handleItemColorToggle(button) {
                if (!button) {
                    return;
                }
                const context = getItemContext(button);
                if (!context) {
                    return;
                }
                const { item, record, recordIndex } = context;
                const targetColor = (button.value || '').trim().toLowerCase();
                const currentColor = normalizeItemColor(record.ItemColor);
                const nextColor = currentColor === targetColor ? '' : targetColor;
                const recordChanged = setRecordItemColor(recordIndex, nextColor);
                if (recordChanged) {
                    scheduleSave();
                }
                applyItemColor(item, nextColor);
                applyFilters();
            }

            function handleCorrectionChange(effect, input) {
                if (!effect || !input) {
                    return;
                }
                updateInputValueAttribute(input);
                const selected = input.value.trim();
                const indexes = getEffectIndexes(effect);
                if (!indexes) {
                    return;
                }
                const nextStatus = selected ? 'corrected' : 'pending';
                const statusChanged = recordStatusChange(effect, nextStatus);
                const correctionChanged = updateRecordCorrection(indexes.recordIndex, indexes.slotIndex, selected);
                effect.dataset.correction = selected ? selected.toLowerCase() : '';
                effect.dataset.preserveOriginalLevel = selected ? 'false' : 'true';
                updateEffectStatus(effect, nextStatus);

                const suppressLevel = Boolean(selected);
                const suppressedChanged = updateRecordLevelSuppressed(indexes.recordIndex, indexes.slotIndex, suppressLevel);
                let levelDataCleared = false;
                if (suppressLevel) {
                    const clearedLevelValue = updateRecordLevelValue(indexes.recordIndex, indexes.slotIndex, '');
                    const clearedLevelOptions = updateRecordLevelOptions(indexes.recordIndex, indexes.slotIndex, '');
                    levelDataCleared = Boolean(clearedLevelValue || clearedLevelOptions);
                }
                if (suppressLevel) {
                    effect.dataset.levelOptionsBaseJson = JSON.stringify([]);
                } else {
                    const baseString = effect.dataset.levelOptionsBase || '';
                    const restored = baseString ? sanitizeLevelList(baseString.split('|')) : [];
                    const restoredSorted = sortLevelsAscending(restored);
                    effect.dataset.levelOptionsBaseJson = JSON.stringify(restoredSorted);
                }

                let levelCleared = false;
                const levelSelect = effect.querySelector('.level-input');
                if (levelSelect) {
                    if (updateRecordLevelCorrection(indexes.recordIndex, indexes.slotIndex, '')) {
                        levelCleared = true;
                    }
                    effect.dataset.levelCorrection = '';
                    effect.dataset.levelCorrectionValue = '';
                    const originalLevelValue = effect.dataset.levelOriginalValue || '';
                    const preserveOriginalLevel = effect.dataset.preserveOriginalLevel !== 'false';
                    const effectiveLevel = preserveOriginalLevel ? originalLevelValue : '';
                    effect.dataset.level = effectiveLevel ? effectiveLevel.toLowerCase() : '';
                    levelSelect.value = '';
                    updateLevelInputAvailability(levelSelect, []);
                    applyMasterLevelOptions(effect, levelSelect, selected, {
                        setCorrectionLevelCandidates,
                        rebuildLevelSelectOptions
                    });
                }

                const item = effect.closest('.item');
                if (item) {
                    refreshItemCaches(item);
                }
                if (!statusChanged && (correctionChanged || levelCleared || suppressedChanged || levelDataCleared)) {
                    scheduleSave();
                }
                applyFilters();
            }

            function handleLevelChange(effect, input) {
                if (!effect || !input) {
                    return;
                }
                const selected = input.value.trim();
                const previous = effect.dataset.levelCorrectionValue || '';
                if (selected === previous) {
                    return;
                }
                const indexes = getEffectIndexes(effect);
                if (!indexes) {
                    return;
                }

                const levelChanged = updateRecordLevelCorrection(indexes.recordIndex, indexes.slotIndex, selected);
                effect.dataset.levelCorrection = selected ? selected.toLowerCase() : '';
                effect.dataset.levelCorrectionValue = selected;

                const originalValue = effect.dataset.levelOriginalValue || '';
                const finalLevel = selected || originalValue;
                effect.dataset.level = finalLevel ? finalLevel.toLowerCase() : '';

                updateLevelBadge(effect);
                const item = effect.closest('.item');
                if (item) {
                    refreshItemCaches(item);
                }

                const hasEffectCorrection = Boolean(effect.dataset.correction);
                const currentStatus = effect.dataset.status || 'pending';
                let nextStatus = currentStatus;
                if (selected) {
                    nextStatus = 'corrected';
                } else if (!hasEffectCorrection && currentStatus === 'corrected') {
                    nextStatus = 'pending';
                }

                let statusChanged = false;
                if (nextStatus !== currentStatus) {
                    statusChanged = recordStatusChange(effect, nextStatus);
                    if (statusChanged) {
                        updateEffectStatus(effect, nextStatus);
                    }
                }

                if (!statusChanged && levelChanged) {
                    scheduleSave();
                }
                applyFilters();
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
                        handleDuplicateToggle(duplicateButton);
                        return;
                    }

                    const favoriteButton = event.target.closest('.favorite-toggle');
                    if (favoriteButton) {
                        event.preventDefault();
                        handleFavoriteToggle(favoriteButton);
                        return;
                    }

                    const colorSelect = event.target.closest('.item-color-select');
                    if (colorSelect) {
                        event.preventDefault();
                        handleItemColorToggle(colorSelect);
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
                    const item = effect.closest('.item');
                    const current = effect.dataset.status || 'pending';
                    const targetValue = button.dataset.value || 'pass';
                    const next = current === targetValue ? 'pending' : targetValue;
                    updateEffectStatus(effect, next);
                    const statusChanged = recordStatusChange(effect, next);
                    if (next === 'pass') {
                        const indexes = getEffectIndexes(effect);
                        if (indexes) {
                            const correctionChanged = updateRecordCorrection(indexes.recordIndex, indexes.slotIndex, '');
                            let levelChanged = updateRecordLevelCorrection(indexes.recordIndex, indexes.slotIndex, '');
                            effect.dataset.correction = '';
                            effect.dataset.levelCorrection = '';
                            effect.dataset.levelCorrectionValue = '';
                            effect.dataset.preserveOriginalLevel = 'true';
                            const originalLevelValue = effect.dataset.levelOriginalValue || '';
                            effect.dataset.level = originalLevelValue ? originalLevelValue.toLowerCase() : '';

                            const baseString = effect.dataset.levelOptionsBase || '';
                            const restoredBase = baseString ? sanitizeLevelList(baseString.split('|')) : [];
                            const restoredBaseSorted = sortLevelsAscending(restoredBase);
                            effect.dataset.levelOptionsBaseJson = JSON.stringify(restoredBaseSorted);

                            const input = effect.querySelector('.correction-input');
                            if (input) {
                                const predictionDefault = effect.dataset.predictionValue || '';
                                const replacement = createCorrectionInput('', predictionDefault);
                                input.replaceWith(replacement);
                            }

                            const suppressRecordChanged = updateRecordLevelSuppressed(indexes.recordIndex, indexes.slotIndex, false);

                            const levelInput = effect.querySelector('.level-input');
                            if (levelInput) {
                                levelInput.value = '';
                                rebuildLevelSelectOptions(effect, levelInput);
                            }
                            setCorrectionLevelCandidates(effect, []);
                            updateLevelBadge(effect);

                            if (!statusChanged && (correctionChanged || levelChanged || suppressRecordChanged)) {
                                scheduleSave();
                            }
                        }
                    }
                    if (item) {
                        refreshItemCaches(item);
                    }
                    applyFilters();
                });

                dom.gallery.addEventListener('change', (event) => {
                    const correctionInput = event.target.closest('.correction-input');
                    if (correctionInput) {
                        const effect = correctionInput.closest('.effect');
                        if (effect) {
                            handleCorrectionChange(effect, correctionInput);
                        }
                        return;
                    }
                    const levelInput = event.target.closest('.level-input');
                    if (levelInput) {
                        const effect = levelInput.closest('.effect');
                        if (effect) {
                            handleLevelChange(effect, levelInput);
                        }
                    }
                });
            }

            if (dom.searchInput) {
                dom.searchInput.addEventListener('input', applyFilters);
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

(() => {
    function createRecordActionHandlers(deps = {}) {
        const {
            duplicates,
            scheduleSave,
            applyFilters,
            buildGallery,
            applyItemColor,
            applyItemRelicType,
            updateFavoriteVisuals,
            updateDuplicateVisuals,
            refreshItemCaches,
            getItemContext,
            normalizeItemColor,
            normalizeItemRelicType,
            isRecordDuplicate,
            isRecordFavorite,
            setRecordDuplicate,
            setRecordFavorite,
            setRecordItemColor,
            setRecordItemRelicType,
            recordStatusChange,
            updateRecordCorrection,
            updateRecordLevelCorrection,
            updateRecordLevelValue,
            updateRecordLevelOptions,
            updateRecordLevelSuppressed,
            updateEffectStatus,
            sanitizeLevelList,
            sortLevelsAscending,
            createCorrectionInput,
            setCorrectionLevelCandidates,
            rebuildLevelSelectOptions,
            updateLevelBadge,
            getEffectIndexes,
            updateInputValueAttribute,
            updateLevelInputAvailability,
            applyMasterLevelOptions,
            applyMasterDataForRelicType
        } = deps;

        if (!duplicates || typeof duplicates.set !== 'function') {
            throw new Error('createRecordActionHandlers: duplicates.set is required');
        }

        const requiredFunctions = {
            getItemContext,
            isRecordDuplicate,
            isRecordFavorite,
            setRecordDuplicate,
            setRecordFavorite,
            setRecordItemColor,
            setRecordItemRelicType,
            recordStatusChange,
            updateRecordCorrection,
            updateRecordLevelCorrection,
            updateRecordLevelValue,
            updateRecordLevelOptions,
            updateRecordLevelSuppressed,
            updateEffectStatus,
            sanitizeLevelList,
            sortLevelsAscending,
            createCorrectionInput,
            setCorrectionLevelCandidates,
            rebuildLevelSelectOptions,
            updateLevelBadge,
            getEffectIndexes,
            updateInputValueAttribute,
            updateLevelInputAvailability,
            applyMasterLevelOptions,
            applyMasterDataForRelicType
        };

        Object.entries(requiredFunctions).forEach(([name, fn]) => {
            if (typeof fn !== 'function') {
                throw new Error(`createRecordActionHandlers: ${name} must be a function`);
            }
        });

        const safeScheduleSave = typeof scheduleSave === 'function' ? scheduleSave : () => {};
        const safeApplyFilters = typeof applyFilters === 'function' ? applyFilters : () => {};
        const safeBuildGallery = typeof buildGallery === 'function' ? buildGallery : () => {};
        const safeApplyItemColor = typeof applyItemColor === 'function' ? applyItemColor : () => {};
        const safeApplyItemRelicType =
            typeof applyItemRelicType === 'function' ? applyItemRelicType : () => {};
        const safeApplyMasterDataForRelicType =
            typeof applyMasterDataForRelicType === 'function' ? applyMasterDataForRelicType : () => {};
        const safeUpdateFavoriteVisuals =
            typeof updateFavoriteVisuals === 'function' ? updateFavoriteVisuals : () => {};
        const safeUpdateDuplicateVisuals =
            typeof updateDuplicateVisuals === 'function' ? updateDuplicateVisuals : () => {};
        const safeRefreshItemCaches = typeof refreshItemCaches === 'function' ? refreshItemCaches : () => {};
        const normalizeColor =
            typeof normalizeItemColor === 'function' ? normalizeItemColor : (value) => value;
        const normalizeRelicType =
            typeof normalizeItemRelicType === 'function' ? normalizeItemRelicType : (value) => value;

        function getItemActionContext(control) {
            if (!control) {
                return null;
            }
            const context = getItemContext(control);
            if (!context || !context.item) {
                return null;
            }
            return context;
        }

        function refreshItemFromEffect(effect) {
            const item = effect && typeof effect.closest === 'function' ? effect.closest('.item') : null;
            if (item) {
                safeRefreshItemCaches(item);
            }
        }

        function toDatasetValue(value) {
            return value ? String(value).toLowerCase() : '';
        }

        function setLevelOptions(effect, options) {
            const list = Array.isArray(options) ? options : [];
            effect.dataset.levelOptionsBaseJson = JSON.stringify(list);
        }

        function restoreLevelOptions(effect) {
            const baseString = effect.dataset.levelOptionsBase || '';
            if (!baseString) {
                setLevelOptions(effect, []);
                return;
            }
            const restored = sanitizeLevelList(baseString.split('|'));
            setLevelOptions(effect, sortLevelsAscending(restored));
        }

        function computeEffectiveLevel(effect) {
            const originalValue = effect.dataset.levelOriginalValue || '';
            const preserveOriginal = effect.dataset.preserveOriginalLevel !== 'false';
            const effective = preserveOriginal ? originalValue : '';
            return effective ? effective.toLowerCase() : '';
        }

        function resetLevelSelection(effect, indexes, correctionValue, { updateCandidates } = {}) {
            if (effect && effect.dataset && effect.dataset.kind === 'demerit') {
                effect.dataset.levelCorrection = '';
                effect.dataset.levelCorrectionValue = '';
                effect.dataset.level = '';
                if (updateCandidates) {
                    updateCandidates([]);
                } else {
                    setCorrectionLevelCandidates(effect, []);
                }
                return false;
            }
            let levelCleared = false;
            if (indexes) {
                levelCleared = Boolean(
                    updateRecordLevelCorrection(indexes.recordIndex, indexes.slotIndex, '', indexes.kind)
                );
            }
            effect.dataset.levelCorrection = '';
            effect.dataset.levelCorrectionValue = '';
            effect.dataset.level = computeEffectiveLevel(effect);

            const levelInput = effect.querySelector ? effect.querySelector('.level-input') : null;
            if (levelInput) {
                levelInput.value = '';
                updateLevelInputAvailability(levelInput, []);
                applyMasterLevelOptions(effect, levelInput, correctionValue || '', {
                    setCorrectionLevelCandidates,
                    rebuildLevelSelectOptions
                });
            } else if (updateCandidates) {
                setCorrectionLevelCandidates(effect, []);
            }

            return levelCleared;
        }

        function resetCorrectionInput(effect) {
            const input = effect.querySelector ? effect.querySelector('.correction-input') : null;
            if (!input) {
                return;
            }
            const predictionDefault = effect.dataset.predictionValue || '';
            const isDemerit = Boolean(effect && effect.dataset && effect.dataset.kind === 'demerit');
            const replacement = createCorrectionInput({ isDemerit }, '', predictionDefault);
            if (replacement && typeof input.replaceWith === 'function') {
                input.replaceWith(replacement);
            }
        }

        function toggleDuplicate(button) {
            const context = getItemActionContext(button);
            if (!context) {
                return;
            }
            const { item, record, recordIndex } = context;
            const imageName = button.dataset.image || (item.dataset ? item.dataset.imageName : '') || '';
            const currentState = Boolean(
                isRecordDuplicate(record) || (item.dataset && item.dataset.duplicate === 'true')
            );
            const nextState = !currentState;

            if (imageName) {
                button.dataset.image = imageName;
                duplicates.set(imageName, nextState);
            }

            const recordChanged = setRecordDuplicate(recordIndex, nextState);
            safeUpdateDuplicateVisuals(item, nextState);
            if (recordChanged) {
                safeScheduleSave();
            }
            safeBuildGallery();
        }

        function toggleFavorite(button) {
            const context = getItemActionContext(button);
            if (!context) {
                return;
            }
            const { item, record, recordIndex } = context;
            const nextState = !isRecordFavorite(record);
            const recordChanged = setRecordFavorite(recordIndex, nextState);
            safeUpdateFavoriteVisuals(item, nextState);
            if (recordChanged) {
                safeScheduleSave();
            }
            safeApplyFilters();
        }

        function toggleItemColor(control) {
            const context = getItemActionContext(control);
            if (!context) {
                return;
            }
            const { item, record, recordIndex } = context;
            const targetColor = toDatasetValue((control.value || '').trim());
            const currentColor = normalizeColor(record ? record.ItemColor : '');
            const nextColor = currentColor === targetColor ? '' : targetColor;
            const recordChanged = setRecordItemColor(recordIndex, nextColor);
            if (recordChanged) {
                safeScheduleSave();
            }
            safeApplyItemColor(item, nextColor);
            safeApplyFilters();
        }

        function toggleItemRelicType(control) {
            const context = getItemActionContext(control);
            if (!context) {
                return;
            }
            const { item, record, recordIndex } = context;
            const targetType = normalizeRelicType((control.value || '').trim());
            const currentType = normalizeRelicType(record ? record.RelicType : '');
            const nextType = currentType === targetType ? '' : targetType;
            const recordChanged = setRecordItemRelicType(recordIndex, nextType);
            if (recordChanged) {
                safeScheduleSave();
            }
            safeApplyItemRelicType(item, nextType);
            safeApplyMasterDataForRelicType(nextType, { item, record, recordIndex });
            safeApplyFilters();
        }

        function changeEffectCorrection(effect, input) {
            if (!effect || !input) {
                return;
            }
            updateInputValueAttribute(input);
            const selected = input.value.trim();
            const indexes = getEffectIndexes(effect);
            if (!indexes) {
                return;
            }

            const isDemerit = indexes.kind === 'demerit';

            const nextStatus = selected ? 'corrected' : 'pending';
            const statusChanged = recordStatusChange(effect, nextStatus);
            const correctionChanged = updateRecordCorrection(
                indexes.recordIndex,
                indexes.slotIndex,
                selected,
                indexes.kind
            );
            effect.dataset.correction = toDatasetValue(selected);
            if (!isDemerit) {
                effect.dataset.preserveOriginalLevel = selected ? 'false' : 'true';
            }
            updateEffectStatus(effect, nextStatus);

            let shouldSchedule = correctionChanged;

            if (!isDemerit) {
                const suppressLevel = Boolean(selected);
                const suppressedChanged = updateRecordLevelSuppressed(
                    indexes.recordIndex,
                    indexes.slotIndex,
                    suppressLevel,
                    indexes.kind
                );

                let levelStorageCleared = false;
                if (suppressLevel) {
                    const clearedLevelValue = updateRecordLevelValue(
                        indexes.recordIndex,
                        indexes.slotIndex,
                        '',
                        indexes.kind
                    );
                    const clearedLevelOptions = updateRecordLevelOptions(
                        indexes.recordIndex,
                        indexes.slotIndex,
                        '',
                        indexes.kind
                    );
                    levelStorageCleared = Boolean(clearedLevelValue || clearedLevelOptions);
                    setLevelOptions(effect, []);
                } else {
                    restoreLevelOptions(effect);
                }

                const levelCleared = resetLevelSelection(effect, indexes, selected);
                shouldSchedule =
                    correctionChanged || suppressedChanged || levelStorageCleared || levelCleared;
            } else {
                effect.dataset.levelCorrection = '';
                effect.dataset.levelCorrectionValue = '';
                effect.dataset.level = '';
            }

            refreshItemFromEffect(effect);
            if (!statusChanged && shouldSchedule) {
                safeScheduleSave();
            }
            safeApplyFilters();
        }

        function changeEffectLevel(effect, input) {
            if (!effect || !input) {
                return;
            }
            const selected = input.value.trim();
            const previous = effect.dataset.levelCorrectionValue || '';
            if (selected === previous) {
                return;
            }
            const indexes = getEffectIndexes(effect);
            if (!indexes || indexes.kind === 'demerit') {
                return;
            }

            const levelChanged = updateRecordLevelCorrection(
                indexes.recordIndex,
                indexes.slotIndex,
                selected,
                indexes.kind
            );
            effect.dataset.levelCorrection = toDatasetValue(selected);
            effect.dataset.levelCorrectionValue = selected;

            const originalValue = effect.dataset.levelOriginalValue || '';
            const finalLevel = selected || originalValue;
            effect.dataset.level = toDatasetValue(finalLevel);

            updateLevelBadge(effect);
            refreshItemFromEffect(effect);

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
                safeScheduleSave();
            }
            safeApplyFilters();
        }

        function toggleReviewStatus(effect, button) {
            if (!effect || !button) {
                return;
            }
            const current = effect.dataset.status || 'pending';
            const targetValue = button.dataset.value || 'pass';
            const next = current === targetValue ? 'pending' : targetValue;
            updateEffectStatus(effect, next);
            const statusChanged = recordStatusChange(effect, next);

            let changeDetected = false;
            if (next === 'pass') {
                const indexes = getEffectIndexes(effect);
                if (indexes) {
                    const isDemerit = indexes.kind === 'demerit';
                const correctionChanged = updateRecordCorrection(
                    indexes.recordIndex,
                    indexes.slotIndex,
                    '',
                    indexes.kind
                );
                    let levelChanged = false;
                    let suppressChanged = false;

                    effect.dataset.correction = '';
                    effect.dataset.levelCorrection = '';
                    effect.dataset.levelCorrectionValue = '';
                    effect.dataset.level = '';

                    if (!isDemerit) {
                        levelChanged = updateRecordLevelCorrection(
                            indexes.recordIndex,
                            indexes.slotIndex,
                            '',
                            indexes.kind
                        );
                        suppressChanged = updateRecordLevelSuppressed(
                            indexes.recordIndex,
                            indexes.slotIndex,
                            false,
                            indexes.kind
                        );

                        effect.dataset.preserveOriginalLevel = 'true';
                        effect.dataset.level = computeEffectiveLevel(effect);

                        restoreLevelOptions(effect);
                        resetCorrectionInput(effect);

                        const levelInput = effect.querySelector
                            ? effect.querySelector('.level-input')
                            : null;
                        if (levelInput) {
                            levelInput.value = '';
                            rebuildLevelSelectOptions(effect, levelInput);
                        }
                        setCorrectionLevelCandidates(effect, []);
                        updateLevelBadge(effect);
                    } else {
                        resetCorrectionInput(effect);
                        setCorrectionLevelCandidates(effect, []);
                    }

                    changeDetected = correctionChanged || levelChanged || suppressChanged;
                }
            }

            refreshItemFromEffect(effect);
            if (!statusChanged && changeDetected) {
                safeScheduleSave();
            }
            safeApplyFilters();
        }

        return {
            toggleDuplicate,
            toggleFavorite,
            toggleItemColor,
            toggleItemRelicType,
            changeEffectCorrection,
            changeEffectLevel,
            toggleReviewStatus
        };
    }

    if (!window.galleryEventHandlersFactory) {
        window.galleryEventHandlersFactory = {};
    }

    window.galleryEventHandlersFactory.createRecordActionHandlers = createRecordActionHandlers;
})();

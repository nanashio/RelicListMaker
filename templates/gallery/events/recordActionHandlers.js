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
            syncDemeritAvailability = () => {},
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

        function syncLinkedDemeritEffect(effect) {
            if (typeof syncDemeritAvailability !== 'function') {
                return;
            }
            if (!effect || typeof effect.closest !== 'function') {
                return;
            }
            const indexes = getEffectIndexes(effect);
            if (!indexes) {
                return;
            }
            if (indexes.kind === 'demerit') {
                syncDemeritAvailability(effect, { refreshStatus: true });
                return;
            }
            const item = effect.closest('.item');
            if (!item) {
                return;
            }
            const slot = indexes.slotIndex;
            if (!Number.isFinite(slot)) {
                return;
            }
            const selector = `.effect[data-kind="demerit"][data-slot="${slot}"]`;
            const demeritEffect = item.querySelector(selector);
            if (demeritEffect) {
                syncDemeritAvailability(demeritEffect, { refreshStatus: true });
            }
        }

        function toDatasetValue(value) {
            return value ? String(value).toLowerCase() : '';
        }

        function toStoredLevelValue(value) {
            if (value == null) {
                return 'none';
            }
            const text = String(value).trim();
            if (!text) {
                return 'none';
            }
            return text.toLowerCase() === 'none' ? 'none' : text;
        }

        function applyDatasetLevel(effect, value) {
            if (!effect || !effect.dataset) {
                return;
            }
            const stored = toStoredLevelValue(value);
            const datasetSource = stored === 'none' ? '' : stored;
            effect.dataset.level = toDatasetValue(datasetSource);
        }

        function optionsRepresentNone(options) {
            if (!Array.isArray(options) || options.length === 0) {
                return true;
            }
            return options.every((entry) => {
                if (entry == null) {
                    return true;
                }
                const text = String(entry).trim();
                if (!text) {
                    return true;
                }
                return text.toLowerCase() === 'none';
            });
        }

        function setLevelOptions(effect, options) {
            const list = Array.isArray(options) ? options : [];
            const sanitized = sanitizeLevelList(list);
            const sorted = sortLevelsAscending(sanitized);
            effect.dataset.levelOptionsBaseJson = JSON.stringify(sorted);
        }

        function applyLevelOptionsToRecord(effect, options) {
            if (!effect) {
                return false;
            }
            const indexes = getEffectIndexes(effect);
            if (!indexes || indexes.kind === 'demerit') {
                return false;
            }
            const list = Array.isArray(options) ? options : [];
            const sanitized = sanitizeLevelList(list);
            const sorted = sortLevelsAscending(sanitized);
            const serialized = sorted.length ? sorted.join('|') : 'none';
            const optionsChanged = updateRecordLevelOptions(
                indexes.recordIndex,
                indexes.slotIndex,
                serialized,
                indexes.kind
            );
            let levelChanged = false;
            if (optionsRepresentNone(sorted)) {
                const storedLevel = toStoredLevelValue('');
                levelChanged = updateRecordLevelValue(
                    indexes.recordIndex,
                    indexes.slotIndex,
                    storedLevel,
                    indexes.kind
                );
                applyDatasetLevel(effect, storedLevel);
            }
            return optionsChanged || levelChanged;
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

        function resetLevelSelection(
            effect,
            indexes,
            correctionValue,
            { updateCandidates, skipRecordLevelValue, onOptionsApplied } = {}
        ) {
            if (effect && effect.dataset && effect.dataset.kind === 'demerit') {
                effect.dataset.levelCorrection = '';
                effect.dataset.levelCorrectionValue = '';
                effect.dataset.level = '';
                if (updateCandidates) {
                    updateCandidates([]);
                } else {
                    setCorrectionLevelCandidates(effect, []);
                }
                if (typeof onOptionsApplied === 'function') {
                    onOptionsApplied(effect, []);
                }
                return false;
            }
            const actionContext = getItemActionContext(effect);
            const record = actionContext && actionContext.record ? actionContext.record : null;
            let levelCleared = false;
            effect.dataset.levelCorrection = '';
            effect.dataset.levelCorrectionValue = '';
            const originalValue = effect.dataset.levelOriginalValue || '';
            const preserveOriginal = effect.dataset.preserveOriginalLevel !== 'false';
            const finalLevelValue = preserveOriginal ? originalValue : '';
            const storedLevelValue = toStoredLevelValue(finalLevelValue);
            let levelValueRestored = false;
            if (indexes && !skipRecordLevelValue) {
                levelValueRestored = Boolean(
                    updateRecordLevelValue(
                        indexes.recordIndex,
                        indexes.slotIndex,
                        storedLevelValue,
                        indexes.kind
                    )
                );
            }
            applyDatasetLevel(effect, storedLevelValue);

            const levelInput = effect.querySelector ? effect.querySelector('.level-input') : null;
            const applyOptions =
                typeof onOptionsApplied === 'function'
                    ? (targetEffect, options) => onOptionsApplied(targetEffect, options)
                    : () => {};
            if (levelInput) {
                levelInput.value = '';
                updateLevelInputAvailability(levelInput, []);
                applyMasterLevelOptions(effect, levelInput, correctionValue || '', {
                    setCorrectionLevelCandidates,
                    rebuildLevelSelectOptions,
                    onOptionsApplied: applyOptions,
                    sanitizeLevelList,
                    sortLevelsAscending
                });
            } else if (updateCandidates) {
                setCorrectionLevelCandidates(effect, []);
                applyOptions(effect, []);
            } else {
                applyOptions(effect, []);
            }

            return levelCleared || levelValueRestored;
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

            const originalPrediction =
                (effect.dataset && effect.dataset.predictionOriginalValue) || '';
            const currentPrediction = (effect.dataset && effect.dataset.predictionValue) || '';
            const fallbackPrediction = originalPrediction || currentPrediction;
            const fallbackNormalized = fallbackPrediction ? String(fallbackPrediction).trim() : '';
            const selectedValue = selected ? String(selected).trim() : '';
            const hasManualEntry = Boolean(selectedValue) && selectedValue !== fallbackNormalized;
            const nextValue = hasManualEntry ? selectedValue : fallbackNormalized;
            const effectValueChanged = updateRecordEffectValue(
                indexes.recordIndex,
                indexes.slotIndex,
                nextValue,
                indexes.kind
            );
            effect.dataset.predictionValue = nextValue;
            effect.dataset.pred = toDatasetValue(nextValue);

            const currentStatus = effect.dataset.status || 'pending';
            const previousCorrection = effect.dataset.correction || '';
            const hasLevelCorrection = Boolean(effect.dataset.levelCorrectionValue);

            let nextStatus = currentStatus;
            const normalizedCurrentPrediction = currentPrediction
                ? String(currentPrediction).trim()
                : '';
            const normalizedNextValue = nextValue ? String(nextValue).trim() : '';
            const valueUnchanged = !effectValueChanged && normalizedCurrentPrediction === normalizedNextValue;

            if (hasManualEntry) {
                nextStatus = 'corrected';
            } else if (valueUnchanged) {
                nextStatus = currentStatus;
            } else if (!hasLevelCorrection && (previousCorrection || currentStatus === 'corrected')) {
                nextStatus = 'pending';
            }

            const statusChanged = recordStatusChange(effect, nextStatus);
            effect.dataset.correction = hasManualEntry ? toDatasetValue(selectedValue) : '';
            if (!isDemerit) {
                effect.dataset.preserveOriginalLevel = hasManualEntry ? 'false' : 'true';
            }
            updateEffectStatus(effect, nextStatus);

            let shouldSchedule = effectValueChanged;
            let levelOptionsChanged = false;
            let levelOptionsScheduled = false;

            if (!isDemerit) {
                const handleOptionsApplied = (targetEffect, options) => {
                    if (targetEffect !== effect) {
                        return false;
                    }
                    const changed = applyLevelOptionsToRecord(targetEffect, options);
                    if (changed) {
                        levelOptionsChanged = true;
                        if (!statusChanged && !levelOptionsScheduled) {
                            safeScheduleSave();
                            levelOptionsScheduled = true;
                        }
                    }
                    return changed;
                };

                setLevelOptions(effect, []);
                const restoreOriginalLevel = !selected;
                let levelValueCleared = false;
                if (!restoreOriginalLevel) {
                    levelValueCleared = updateRecordLevelValue(
                        indexes.recordIndex,
                        indexes.slotIndex,
                        toStoredLevelValue(''),
                        indexes.kind
                    );
                }

                const levelCleared = resetLevelSelection(effect, indexes, selected, {
                    skipRecordLevelValue: !restoreOriginalLevel,
                    onOptionsApplied: handleOptionsApplied
                });
                shouldSchedule =
                    effectValueChanged || levelValueCleared || levelCleared || levelOptionsChanged;
            } else {
                effect.dataset.levelCorrection = '';
                effect.dataset.levelCorrectionValue = '';
                effect.dataset.level = '';
            }

            refreshItemFromEffect(effect);
            syncLinkedDemeritEffect(effect);
            if (!statusChanged && shouldSchedule && !levelOptionsScheduled) {
                safeScheduleSave();
                levelOptionsScheduled = true;
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

            effect.dataset.levelCorrection = toDatasetValue(selected);
            effect.dataset.levelCorrectionValue = selected;

            const originalValue = effect.dataset.levelOriginalValue || '';
            const preserveOriginal = effect.dataset.preserveOriginalLevel !== 'false';
            const finalLevel = selected || (preserveOriginal ? originalValue : '');
            const storedLevel = toStoredLevelValue(finalLevel);
            const levelValueChanged = updateRecordLevelValue(
                indexes.recordIndex,
                indexes.slotIndex,
                storedLevel,
                indexes.kind
            );
            applyDatasetLevel(effect, storedLevel);

            refreshItemFromEffect(effect);
            syncLinkedDemeritEffect(effect);

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

            if (!statusChanged && levelValueChanged) {
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
                    let levelValueReset = false;
                    let effectValueReset = false;

                    effect.dataset.correction = '';
                    effect.dataset.levelCorrection = '';
                    effect.dataset.levelCorrectionValue = '';
                    effect.dataset.level = '';
                    const originalText =
                        (effect.dataset && effect.dataset.predictionOriginalValue) || '';
                    const restoredEffectValue = originalText ? String(originalText).trim() : '';
                    effectValueReset = updateRecordEffectValue(
                        indexes.recordIndex,
                        indexes.slotIndex,
                        restoredEffectValue,
                        indexes.kind
                    );
                    changeDetected = effectValueReset;
                    effect.dataset.predictionValue = restoredEffectValue;
                    effect.dataset.pred = toDatasetValue(restoredEffectValue);

                    if (!isDemerit) {
                        effect.dataset.preserveOriginalLevel = 'true';
                        effect.dataset.level = computeEffectiveLevel(effect);
                        const restoredLevel = toStoredLevelValue(
                            effect.dataset.levelOriginalValue || ''
                        );
                        levelValueReset = Boolean(
                            updateRecordLevelValue(
                                indexes.recordIndex,
                                indexes.slotIndex,
                                restoredLevel,
                                indexes.kind
                            )
                        );

                        applyDatasetLevel(effect, restoredLevel);

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
                    } else {
                        resetCorrectionInput(effect);
                        setCorrectionLevelCandidates(effect, []);
                    }

                    changeDetected = changeDetected || levelValueReset;
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

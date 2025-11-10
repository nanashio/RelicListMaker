(() => {
    function createEffectFactory(config = {}) {
        const {
            state,
            datasetState,
            masterDatalistId = 'master-relic-options',
            createElement,
            sanitizeLevelList,
            sortLevelsAscending,
            applyMasterLevelOptions,
            normalizeStatus,
            statusLabel,
            effectViewModel: effectViewModelConfig
        } = config;

        if (!state || typeof state !== 'object') {
            throw new Error('createEffectFactory: state object is required');
        }
        if (!datasetState || typeof datasetState !== 'object') {
            throw new Error('createEffectFactory: datasetState object is required');
        }
        if (typeof createElement !== 'function') {
            throw new Error('createEffectFactory: createElement helper is required');
        }
        if (typeof sanitizeLevelList !== 'function') {
            throw new Error('createEffectFactory: sanitizeLevelList helper is required');
        }
        if (typeof sortLevelsAscending !== 'function') {
            throw new Error('createEffectFactory: sortLevelsAscending helper is required');
        }
        if (typeof applyMasterLevelOptions !== 'function') {
            throw new Error('createEffectFactory: applyMasterLevelOptions helper is required');
        }
        if (typeof normalizeStatus !== 'function') {
            throw new Error('createEffectFactory: normalizeStatus helper is required');
        }
        if (typeof statusLabel !== 'function') {
            throw new Error('createEffectFactory: statusLabel helper is required');
        }

        const resolvedViewModel =
            effectViewModelConfig && typeof effectViewModelConfig === 'object'
                ? effectViewModelConfig
                : window.galleryRenderFactory && window.galleryRenderFactory.effectViewModel;

        const {
            createEffectContext,
            buildLevelChoices,
            parseLevelOptions: parseLevelOptionsImpl
        } = resolvedViewModel || {};

        if (typeof createEffectContext !== 'function') {
            throw new Error('createEffectFactory: effectViewModel.createEffectContext is required');
        }
        if (typeof buildLevelChoices !== 'function') {
            throw new Error('createEffectFactory: effectViewModel.buildLevelChoices is required');
        }
        if (typeof parseLevelOptionsImpl !== 'function') {
            throw new Error('createEffectFactory: effectViewModel.parseLevelOptions is required');
        }

        function updateInputValueAttribute(input) {
            if (!input) {
                return;
            }
            const current = input.value == null ? '' : String(input.value);
            input.setAttribute('value', current);
        }

        function setCorrectionLevelCandidates(effect, candidates) {
            const sanitized = sanitizeLevelList(candidates);
            const sorted = sortLevelsAscending(sanitized);
            if (!effect) {
                return sorted;
            }
            const input = effect.querySelector ? effect.querySelector('.correction-input') : null;
            if (input) {
                input.dataset.levelCandidates = JSON.stringify(sorted);
            }
            return sorted;
        }

        function updateLevelInputAvailability(select, options) {
            if (!select) {
                return;
            }
            const hasUsableOption =
                Array.isArray(options) &&
                options.some((value) => {
                    if (value == null) {
                        return false;
                    }
                    return String(value).trim() !== '';
                });
            select.disabled = !hasUsableOption;
            if (!hasUsableOption) {
                select.value = '';
            }
        }

        function getBaseLevelOptions(effect) {
            if (!effect) {
                return [];
            }
            const json = effect.dataset.levelOptionsBaseJson;
            if (json) {
                try {
                    const parsed = JSON.parse(json);
                    return sanitizeLevelList(parsed);
                } catch (error) {
                    console.warn('レベル候補(base json)の解析に失敗しました:', error);
                }
            }
            const legacyBase = effect.dataset.levelOptionsBase;
            if (legacyBase != null) {
                return sanitizeLevelList(legacyBase.split('|'));
            }
            const display = effect.dataset.levelOptionsDisplay;
            if (display != null) {
                return sanitizeLevelList(display.split('|'));
            }
            return [];
        }

        function createEffect(record, slot, symbol, imageName, recordIndex, options = {}) {
            const kindOption =
                options && typeof options.kind === 'string' ? options.kind : undefined;
            const skipNested = Boolean(options && options.skipDemerit);
            const context = createEffectContext(record, slot, symbol, imageName, recordIndex, {
                normalizeStatus,
                parseLevelOptions: parseLevelOptionsImpl,
                kind: kindOption
            });
            if (!context) {
                return null;
            }

            const effect = buildEffectElement(context, { nested: false });

            if (!context.isDemerit && !skipNested) {
                const nestedDemerit = createNestedDemerit(
                    record,
                    slot,
                    symbol,
                    imageName,
                    recordIndex
                );
                if (nestedDemerit) {
                    effect.classList.add('effect--with-demerit');
                    effect.appendChild(nestedDemerit);
                }
            }

            return effect;
        }

        function buildEffectElement(context, options = {}) {
            const effect = createEffectElement(context, options);

            const predictionLine = createEffectPredictionLine(context);
            effect.appendChild(predictionLine);
            updateLevelBadge(effect);

            const rawLine = createEffectRawLine(context);
            effect.appendChild(rawLine);

            const decisionElements = createEffectDecision(effect, context);
            effect.appendChild(decisionElements.container);

            if (!context.isDemerit && decisionElements.levelInput) {
                populateEffectLevelOptions(effect, decisionElements.levelInput, context);

                applyMasterLevelOptions(effect, decisionElements.levelInput, context.effectNameForLevels, {
                    setCorrectionLevelCandidates,
                    rebuildLevelSelectOptions,
                    sanitizeLevelList,
                    sortLevelsAscending
                });
            }

            if (datasetState.kind === 'merged') {
                decisionElements.passButton.disabled = true;
                decisionElements.correctionInput.disabled = true;
                if (decisionElements.levelInput) {
                    decisionElements.levelInput.disabled = true;
                }
            }

            updateEffectStatus(effect, context.statusValue);

            return effect;
        }

        function createNestedDemerit(record, slot, symbol, imageName, recordIndex) {
            const demeritContext = createEffectContext(
                record,
                slot,
                symbol,
                imageName,
                recordIndex,
                {
                    normalizeStatus,
                    parseLevelOptions: parseLevelOptionsImpl,
                    kind: 'demerit'
                }
            );
            if (!demeritContext) {
                return null;
            }

            const demeritElement = buildEffectElement(demeritContext, { nested: true });
            demeritElement.classList.add('effect--nested-demerit');
            return demeritElement;
        }

        function createEffectElement(context, options = {}) {
            const nested = Boolean(options && options.nested);
            const effect = createElement('div', 'effect');
            effect.dataset.slot = String(context.slot);
            effect.dataset.image = context.imageNameLower;
            effect.dataset.pred = context.predictionLower;
            effect.dataset.predictionValue = context.predictionText;
            effect.dataset.raw = context.rawLower;
            effect.dataset.recordIndex = String(context.recordIndex);
            effect.dataset.kind = context.effectKind || 'effect';
            effect.dataset.preserveOriginalLevel = context.preserveOriginalLevel ? 'true' : 'false';
            effect.dataset.level = context.displayLevelLower;
            effect.dataset.levelOriginal = context.levelValueLower;
            effect.dataset.levelOriginalValue = context.levelValue;
            effect.dataset.levelOptions = context.levelOptionsLower.join('|');
            effect.dataset.levelOptionsDisplay = context.levelOptionsDisplay;
            effect.dataset.levelOptionsBase = context.levelOptionsDisplay;
            effect.dataset.levelCorrection = context.levelCorrectionLower;
            effect.dataset.levelCorrectionValue = context.levelCorrection;
            effect.dataset.correction = context.correctionValueLower;
            if (context.lowConfidence) {
                effect.classList.add('low-confidence');
                effect.dataset.lowConfidence = 'true';
            }
            if (context.isDemerit) {
                effect.classList.add('effect--demerit');
            }
            if (nested) {
                effect.classList.add('effect--nested');
            }
            return effect;
        }

        function createEffectPredictionLine(context) {
            const predictionLine = createElement('div', 'prediction');
            const labelText = context.isDemerit ? 'デメリット:' : '推定:';
            const predictionLabel = createElement('span', 'prediction-label', labelText);
            const predictionValueNode = createElement(
                'span',
                'prediction-value',
                context.predictionText || '--'
            );
            predictionLine.appendChild(predictionLabel);
            predictionLine.appendChild(predictionValueNode);
            predictionLine.style.display = state.showOcr ? '' : 'none';
            return predictionLine;
        }

        function createEffectRawLine(context) {
            const rawLine = createElement(
                'div',
                'raw',
                `OCR: ${context.ocrDisplay} / 一致度 ${context.scoreDisplay}`
            );
            rawLine.style.display = state.showOcr ? '' : 'none';
            return rawLine;
        }

        function createEffectDecision(effect, context) {
            const decision = createElement('div', 'decision');
            const decisionRow = createElement('div', 'decision-row');
            const passButton = createElement('button', 'review-button pass', '合致');
            passButton.type = 'button';
            passButton.dataset.value = 'pass';

            const correctionInput = createCorrectionInput(context.correctionValue, context.predictionText);

            decisionRow.appendChild(passButton);
            decisionRow.appendChild(correctionInput);
            let levelInput = null;
            if (!context.isDemerit) {
                levelInput = document.createElement('select');
                levelInput.id = `level-input-${context.recordIndex}-${context.slot}`;
                levelInput.className = 'level-input';
                decisionRow.appendChild(levelInput);
            }
            decision.appendChild(decisionRow);

            return {
                container: decision,
                passButton,
                correctionInput,
                levelInput
            };
        }

        function populateEffectLevelOptions(effect, levelInput, context) {
            const sortedLevelChoices = buildLevelChoices(context, { sortLevelsAscending });

            const emptyOption = document.createElement('option');
            emptyOption.value = '';
            emptyOption.textContent = '';
            levelInput.appendChild(emptyOption);

            sortedLevelChoices.forEach((option) => {
                const optionNode = document.createElement('option');
                optionNode.value = option;
                optionNode.textContent = option;
                levelInput.appendChild(optionNode);
            });

            effect.dataset.levelOptionsBaseJson = JSON.stringify(sortedLevelChoices);

            const initialLevelValue =
                context.levelCorrection || (context.preserveOriginalLevel ? context.levelValue : '') || '';
            levelInput.value = initialLevelValue;
            updateLevelInputAvailability(levelInput, sortedLevelChoices);
        }

        function updateLevelBadge(effect) {
            const predictionLine = effect.querySelector('.prediction');
            if (!predictionLine) {
                return;
            }
            let badge = predictionLine.querySelector('.level-badge');
            const originalValue = effect.dataset.levelOriginalValue || '';
            const preserveOriginalLevel = effect.dataset.preserveOriginalLevel !== 'false';
            const correctionValue = effect.dataset.levelCorrectionValue || '';
            const optionsDisplay = effect.dataset.levelOptionsDisplay || '';
            const optionsList = optionsDisplay
                ? optionsDisplay
                      .split('|')
                      .map((value) => value.trim())
                      .filter((value) => value)
                : [];

            if (correctionValue) {
                if (!badge) {
                    badge = createElement('span', 'level-badge level-badge--corrected');
                    predictionLine.appendChild(badge);
                }
                badge.textContent = correctionValue;
                badge.className = 'level-badge level-badge--corrected';
                badge.title = originalValue ? `OCR: ${originalValue}` : '';
                return;
            }

            if (originalValue && preserveOriginalLevel) {
                if (!badge) {
                    badge = createElement('span', 'level-badge');
                    predictionLine.appendChild(badge);
                }
                badge.textContent = originalValue;
                badge.className = 'level-badge';
                badge.title = '';
                return;
            }

            if (optionsList.length) {
                const primaryOption = optionsList[0];
                if (!badge) {
                    badge = createElement('span', 'level-badge level-badge--missing');
                    predictionLine.appendChild(badge);
                }
                badge.textContent = primaryOption;
                badge.className = 'level-badge level-badge--missing';
                if (optionsList.length > 1) {
                    const tooltipText = optionsList.join(' / ');
                    badge.title = `候補: ${tooltipText}`;
                } else {
                    badge.title = `候補: ${primaryOption}`;
                }
                return;
            }

            if (badge) {
                badge.remove();
            }
        }

        function updateEffectStatus(effect, status) {
            const normalized = normalizeStatus(status);
            effect.dataset.status = normalized;
            effect.classList.toggle('pending', normalized === 'pending');

            const indicator = effect.querySelector('.status-indicator');
            if (indicator) {
                indicator.textContent = statusLabel(normalized);
            }

            effect.querySelectorAll('.review-button').forEach((button) => {
                button.classList.toggle('selected', button.dataset.value === normalized);
            });
        }

        function createCorrectionInput(selectedValue, fallbackValue) {
            const input = document.createElement('input');
            input.type = 'search';
            input.className = 'correction-input';
            if (state.masterOptions.length) {
                input.setAttribute('list', masterDatalistId);
                input.placeholder = 'master_relicsから選択';
            } else {
                input.placeholder = 'マスターデータ未設定';
                input.disabled = true;
            }
            const initialValue = selectedValue || fallbackValue || '';
            input.value = initialValue;
            updateInputValueAttribute(input);
            return input;
        }

        function rebuildLevelSelectOptions(effect, select, baseOptionsOverride, extraOptions) {
            if (!effect || !select) {
                return;
            }

            const previousValue = select.value == null ? '' : String(select.value);
            const baseOptions = Array.isArray(baseOptionsOverride)
                ? sanitizeLevelList(baseOptionsOverride)
                : getBaseLevelOptions(effect);

            const extrasSource = Array.isArray(extraOptions)
                ? extraOptions
                : extraOptions == null
                    ? []
                    : [extraOptions];
            const extras = sanitizeLevelList(extrasSource);

            const finalValues = [];
            const seen = new Set();

            const pushOption = (value) => {
                if (value == null) {
                    return;
                }
                const text = String(value).trim();
                if (!text) {
                    return;
                }
                const lower = text.toLowerCase();
                if (seen.has(lower)) {
                    return;
                }
                seen.add(lower);
                finalValues.push(text);
            };

            const originalValue = effect.dataset.levelOriginalValue || '';
            const preserveOriginalLevel = effect.dataset.preserveOriginalLevel !== 'false';
            const originalLower = originalValue ? originalValue.toLowerCase() : '';
            let originalEncountered = false;

            const addCandidate = (candidate) => {
                const text = candidate == null ? '' : String(candidate).trim();
                if (!text) {
                    return;
                }
                const lower = text.toLowerCase();
                if (originalLower && lower === originalLower) {
                    originalEncountered = true;
                    if (preserveOriginalLevel) {
                        pushOption(text);
                    }
                    return;
                }
                pushOption(text);
            };

            baseOptions.forEach(addCandidate);
            extras.forEach(addCandidate);

            if (originalValue) {
                if (preserveOriginalLevel) {
                    pushOption(originalValue);
                } else if (originalEncountered && finalValues.length) {
                    pushOption(originalValue);
                }
            }

            const levelCorrectionValue = effect.dataset.levelCorrectionValue || '';
            pushOption(levelCorrectionValue);

            const sortedFinalValues = sortLevelsAscending(finalValues);

            select.textContent = '';

            const emptyOption = document.createElement('option');
            emptyOption.value = '';
            emptyOption.textContent = '';
            select.appendChild(emptyOption);

            sortedFinalValues.forEach((value) => {
                const optionNode = document.createElement('option');
                optionNode.value = value;
                optionNode.textContent = value;
                select.appendChild(optionNode);
            });

            const candidates = [previousValue, levelCorrectionValue, originalValue, baseOptions[0], extras[0]];
            let applied = '';
            for (let index = 0; index < candidates.length; index += 1) {
                const candidate = candidates[index];
                if (!candidate) {
                    continue;
                }
                const lower = candidate.toLowerCase();
                if (sortedFinalValues.some((value) => value.toLowerCase() === lower)) {
                    applied = candidate;
                    break;
                }
            }
            if (!applied && sortedFinalValues.length) {
                applied = sortedFinalValues[0];
            }
            select.value = applied || '';
            updateLevelInputAvailability(select, sortedFinalValues);

            effect.dataset.levelOptionsDisplay = sortedFinalValues.join('|');
            effect.dataset.levelOptions = sortedFinalValues.map((value) => value.toLowerCase()).join('|');
            updateLevelBadge(effect);
        }

        function getEffectIndexes(effect) {
            const recordIndex = Number(effect.dataset.recordIndex);
            const slotIndex = Number(effect.dataset.slot);
            if (Number.isNaN(recordIndex) || Number.isNaN(slotIndex)) {
                return null;
            }
            const kind = effect.dataset.kind === 'demerit' ? 'demerit' : 'effect';
            return { recordIndex, slotIndex, kind };
        }

        return {
            createEffect,
            updateEffectStatus,
            updateLevelBadge,
            rebuildLevelSelectOptions,
            setCorrectionLevelCandidates,
            getEffectIndexes,
            createCorrectionInput,
            updateInputValueAttribute,
            updateLevelInputAvailability,
            parseLevelOptions: parseLevelOptionsImpl
        };
    }

    if (!window.galleryRenderFactory) {
        window.galleryRenderFactory = {};
    }
    window.galleryRenderFactory.createEffectFactory = createEffectFactory;
})();

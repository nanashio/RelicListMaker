(() => {
    function createEffectFactory(config = {}) {
        const {
            state,
            datasetState,
            masterDatalistId = 'master-relic-options',
            demeritDatalistId = 'master-demerit-options',
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

        function isNonePlaceholder(value) {
            if (value == null) {
                return false;
            }
            const text = String(value).trim();
            if (!text) {
                return false;
            }
            return text.toLowerCase() === 'none';
        }

        function toLevelOptionValue(value) {
            if (value == null) {
                return '';
            }
            return String(value).trim();
        }

        function formatLevelOptionLabel(value) {
            const text = toLevelOptionValue(value);
            return text && !isNonePlaceholder(text) ? text : '';
        }

        function buildLevelOptionsDisplay(values) {
            if (!Array.isArray(values)) {
                return '';
            }
            const displayValues = values
                .map((value) => formatLevelOptionLabel(value))
                .filter((value) => value !== '');
            return displayValues.join('|');
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

        function normalizeLevelToken(value) {
            if (value == null) {
                return '';
            }
            return String(value)
                .trim()
                .replace(/[﹢＋+]/g, '＋')
                .replace(/[﹣－−-]/g, '－')
                .replace(/\s+/g, '');
        }

        function normalizeRelicTypeValue(value) {
            if (value == null) {
                return '';
            }
            const text = String(value).trim().toLowerCase();
            if (!text) {
                return '';
            }
            if (text === 'none') {
                return '';
            }
            if (text === 'deep' || text === '深層' || text === '深層遺物') {
                return 'deep';
            }
            if (text === 'normal' || text === '通常') {
                return 'normal';
            }
            if (text === 'merged' || text === 'all' || text === '統合') {
                return 'merged';
            }
            return text;
        }

        function resolveRecordRelicType(record) {
            const recordType = normalizeRelicTypeValue(record && record.RelicType);
            if (recordType) {
                return recordType;
            }
            const datasetType = normalizeRelicTypeValue(datasetState.relicType || '');
            if (datasetType && datasetType !== 'merged') {
                return datasetType;
            }
            return '';
        }

        function getSlotEffectName(record, slot) {
            if (!record) {
                return '';
            }
            const slotIndex = Number(slot);
            if (!Number.isFinite(slotIndex)) {
                return '';
            }
            const correction = record[`Effect${slotIndex}Correction`];
            if (typeof correction === 'string' && correction.trim()) {
                return correction.trim();
            }
            const prediction = record[`Effect${slotIndex}`];
            if (typeof prediction === 'string' && prediction.trim()) {
                return prediction.trim();
            }
            const rawValue = record[`RawText${slotIndex}`];
            if (typeof rawValue === 'string' && rawValue.trim()) {
                return rawValue.trim();
            }
            return '';
        }

        function getSlotEffectLevel(record, slot) {
            if (!record) {
                return '';
            }
            const slotIndex = Number(slot);
            if (!Number.isFinite(slotIndex)) {
                return '';
            }
            const correction = record[`Effect${slotIndex}LevelCorrection`];
            if (typeof correction === 'string' && correction.trim()) {
                return correction.trim();
            }
            const level = record[`Effect${slotIndex}Level`];
            if (typeof level === 'string' && level.trim()) {
                return level.trim();
            }
            return '';
        }

        function normalizeEffectKey(value) {
            if (value == null) {
                return '';
            }
            const text = String(value).trim().toLowerCase();
            if (!text) {
                return '';
            }
            const hyphenOnlyPattern = /^[\-‐‑‒–—―−﹣－ー﹘﹣]+$/;
            if (hyphenOnlyPattern.test(text)) {
                return '';
            }
            return text;
        }

        function evaluateDemeritAvailability(record, slot) {
            const relicType = resolveRecordRelicType(record);
            if (relicType === 'normal') {
                return { disable: true, placeholder: '通常遺物ではデメリットなし', hide: true };
            }
            if (!relicType) {
                return { disable: true, placeholder: 'デメリット対象外' };
            }
            if (relicType !== 'deep') {
                return { disable: true, placeholder: 'デメリット対象外' };
            }
            const rules = state && state.masterDemeritRules;
            if (!rules || typeof rules !== 'object') {
                return { disable: false };
            }
            const effectName = getSlotEffectName(record, slot);
            const effectKey = normalizeEffectKey(effectName);
            if (!effectKey) {
                return { disable: true, placeholder: 'デメリット対象外' };
            }
            const entry = rules[effectKey];
            if (!entry || typeof entry !== 'object') {
                return { disable: true, placeholder: 'デメリット対象外' };
            }
            if (!entry.hasDemerit) {
                return { disable: true, placeholder: 'デメリット対象外' };
            }
            const levels = Array.isArray(entry.levels) ? entry.levels : [];
            if (!levels.length) {
                return { disable: false };
            }
            const levelValue = getSlotEffectLevel(record, slot);
            if (!levelValue) {
                return { disable: true, placeholder: '指定レベルのデメリットなし' };
            }
            const normalizedLevel = normalizeLevelToken(levelValue);
            if (!normalizedLevel) {
                return { disable: true, placeholder: '指定レベルのデメリットなし' };
            }
            const matched = levels.some((candidate) => {
                if (candidate == null) {
                    return false;
                }
                return normalizeLevelToken(candidate) === normalizedLevel;
            });
            return matched
                ? { disable: false }
                : { disable: true, placeholder: '指定レベルのデメリットなし' };
        }

        function applyDemeritAvailability(effect, context, decisionElements, options = {}) {
            if (!effect || !context || !context.isDemerit) {
                return;
            }
            const record = context.record;
            const slotIndex = Number(context.slot);
            if (!Number.isFinite(slotIndex)) {
                return;
            }
            const input =
                decisionElements && decisionElements.correctionInput
                    ? decisionElements.correctionInput
                    : effect.querySelector
                        ? effect.querySelector('.correction-input')
                        : null;
            const passButton =
                decisionElements && decisionElements.passButton
                    ? decisionElements.passButton
                    : effect.querySelector
                        ? effect.querySelector('.review-button.pass')
                        : null;
            if (!input) {
                return;
            }
            const evaluation = evaluateDemeritAvailability(record, slotIndex);
            const shouldDisable = Boolean(evaluation && evaluation.disable);
            const shouldHide = Boolean(evaluation && evaluation.hide);
            if (shouldDisable) {
                const placeholder = evaluation && evaluation.placeholder ? evaluation.placeholder : 'デメリット対象外';
                if (input.value) {
                    input.value = '';
                }
                updateInputValueAttribute(input);
                input.disabled = true;
                input.placeholder = placeholder;
                if (passButton) {
                    passButton.disabled = true;
                }
                effect.dataset.correction = '';
                const correctionKey = `Demerit${slotIndex}Correction`;
                if (correctionKey && record && Object.prototype.hasOwnProperty.call(record, correctionKey)) {
                    delete record[correctionKey];
                }
                const statusKey = `Demerit${slotIndex}Status`;
                if (statusKey && record && record[statusKey] !== 'pending') {
                    record[statusKey] = 'pending';
                }
                if (context) {
                    context.correctionValue = '';
                    context.correctionValueLower = '';
                    context.statusValue = 'pending';
                }
                if (shouldHide) {
                    effect.dataset.hiddenDemerit = 'true';
                    if (typeof effect.setAttribute === 'function') {
                        effect.setAttribute('aria-hidden', 'true');
                    }
                    effect.style.display = 'none';
                } else {
                    delete effect.dataset.hiddenDemerit;
                    if (typeof effect.removeAttribute === 'function') {
                        effect.removeAttribute('aria-hidden');
                    }
                    effect.style.display = '';
                }
                if (options && options.refreshStatus) {
                    updateEffectStatus(effect, 'pending');
                }
                return;
            }

            const defaultPlaceholder = input.dataset.placeholderDefault || input.placeholder;
            if (datasetState.kind !== 'merged') {
                input.disabled = false;
            }
            if (passButton && datasetState.kind !== 'merged') {
                passButton.disabled = false;
            }
            if (defaultPlaceholder) {
                input.placeholder = defaultPlaceholder;
            }
            delete effect.dataset.hiddenDemerit;
            if (typeof effect.removeAttribute === 'function') {
                effect.removeAttribute('aria-hidden');
            }
            effect.style.display = '';
            if (options && options.refreshStatus && context && context.statusValue) {
                updateEffectStatus(effect, context.statusValue);
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
            const context = createEffectContext(record, slot, symbol, imageName, recordIndex, {
                normalizeStatus,
                parseLevelOptions: parseLevelOptionsImpl,
                kind: kindOption
            });
            if (!context) {
                return null;
            }

            const effect = buildEffectElement(context, { nested: false });
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

            if (context.isDemerit) {
                applyDemeritAvailability(effect, context, decisionElements);
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

        function createEffectElement(context, options = {}) {
            const nested = Boolean(options && options.nested);
            const effect = createElement('div', 'effect');
            effect.dataset.slot = String(context.slot);
            effect.dataset.image = context.imageNameLower;
            effect.dataset.pred = context.predictionLower;
            effect.dataset.predictionValue = context.predictionText;
            effect.dataset.predictionOriginalValue = context.predictionText;
            effect.dataset.raw = context.rawLower;
            effect.dataset.recordIndex = String(context.recordIndex);
            effect.dataset.kind = context.effectKind || 'effect';
            effect.dataset.preserveOriginalLevel = context.preserveOriginalLevel ? 'true' : 'false';
            effect.dataset.level = context.displayLevelLower;
            effect.dataset.levelOriginal = context.levelValueLower;
            effect.dataset.levelOriginalValue = context.levelValue;
            const levelOptionsRaw = Array.isArray(context.levelOptions) ? context.levelOptions : [];
            const levelOptionsDisplay =
                context.levelOptionsDisplay || buildLevelOptionsDisplay(levelOptionsRaw);
            const levelOptionsBase =
                context.levelOptionsDisplayRaw != null
                    ? String(context.levelOptionsDisplayRaw)
                    : levelOptionsRaw.join('|');
            effect.dataset.levelOptions = context.levelOptionsLower.join('|');
            effect.dataset.levelOptionsDisplay = levelOptionsDisplay;
            effect.dataset.levelOptionsBase = levelOptionsBase;
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

            const correctionInput = createCorrectionInput(context, context.correctionValue, context.predictionText);

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

            levelInput.textContent = '';
            const hasNonePlaceholder = sortedLevelChoices.some((option) => isNonePlaceholder(option));

            if (!hasNonePlaceholder) {
                const emptyOption = document.createElement('option');
                emptyOption.value = '';
                emptyOption.textContent = '';
                levelInput.appendChild(emptyOption);
            }

            sortedLevelChoices.forEach((option) => {
                const valueText = toLevelOptionValue(option);
                if (!valueText) {
                    return;
                }
                const optionNode = document.createElement('option');
                optionNode.value = valueText;
                optionNode.textContent = formatLevelOptionLabel(valueText);
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
                      .filter((value) => value && !isNonePlaceholder(value))
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

        function createCorrectionInput(context, selectedValue, fallbackValue) {
            const input = document.createElement('input');
            input.type = 'search';
            input.className = 'correction-input';
            const isDemerit = Boolean(context && context.isDemerit);
            const optionsSource = isDemerit ? state.masterDemeritOptions : state.masterOptions;
            const hasOptions = Array.isArray(optionsSource) && optionsSource.length > 0;
            if (hasOptions) {
                const datalistId = isDemerit ? demeritDatalistId : masterDatalistId;
                input.setAttribute('list', datalistId);
                input.placeholder = isDemerit ? 'デメリット候補から選択' : 'master_relicsから選択';
            } else {
                input.placeholder = isDemerit ? 'デメリットデータ未設定' : 'マスターデータ未設定';
                input.disabled = true;
            }
            input.dataset.placeholderDefault = input.placeholder;
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

            const hasNonePlaceholder = sortedFinalValues.some((value) => isNonePlaceholder(value));

            if (!hasNonePlaceholder) {
                const emptyOption = document.createElement('option');
                emptyOption.value = '';
                emptyOption.textContent = '';
                select.appendChild(emptyOption);
            }

            sortedFinalValues.forEach((value) => {
                const valueText = toLevelOptionValue(value);
                if (!valueText) {
                    return;
                }
                const optionNode = document.createElement('option');
                optionNode.value = valueText;
                optionNode.textContent = formatLevelOptionLabel(valueText);
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

            effect.dataset.levelOptionsDisplay = buildLevelOptionsDisplay(sortedFinalValues);
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

        function syncDemeritAvailability(effect, options = {}) {
            if (!effect || effect.dataset.kind !== 'demerit') {
                return;
            }
            const recordIndex = Number(effect.dataset.recordIndex);
            if (!Array.isArray(state.records) || Number.isNaN(recordIndex)) {
                return;
            }
            const record = state.records[recordIndex];
            if (!record || typeof record !== 'object') {
                return;
            }
            const slotIndex = Number(effect.dataset.slot);
            if (!Number.isFinite(slotIndex)) {
                return;
            }
            const input = effect.querySelector ? effect.querySelector('.correction-input') : null;
            const passButton = effect.querySelector
                ? effect.querySelector('.review-button.pass')
                : null;
            const context = {
                record,
                slot: slotIndex,
                isDemerit: true,
                correctionValue: record[`Demerit${slotIndex}Correction`] || '',
                correctionValueLower: '',
                statusValue: record[`Demerit${slotIndex}Status`] || 'pending'
            };
            if (context.correctionValue) {
                context.correctionValueLower = context.correctionValue.toLowerCase();
            }
            applyDemeritAvailability(
                effect,
                context,
                { correctionInput: input, passButton },
                options
            );
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
            syncDemeritAvailability,
            parseLevelOptions: parseLevelOptionsImpl
        };
    }

    if (!window.galleryRenderFactory) {
        window.galleryRenderFactory = {};
    }
    window.galleryRenderFactory.createEffectFactory = createEffectFactory;
})();

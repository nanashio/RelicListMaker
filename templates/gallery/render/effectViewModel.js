(() => {
    function parseLevelOptions(raw) {
        if (raw == null) {
            return [];
        }
        if (Array.isArray(raw)) {
            return raw
                .map((value) => (value == null ? '' : String(value).trim()))
                .filter((value) => value !== '');
        }
        if (typeof raw === 'string') {
            if (!raw.includes('|')) {
                const text = raw.trim();
                return text ? [text] : [];
            }
            return raw
                .split('|')
                .map((value) => value.trim())
                .filter((value) => value !== '');
        }
        return [];
    }

    function normalizeZeroLevelToken(value) {
        if (value == null) {
            return '';
        }
        return String(value)
            .trim()
            .replace(/[﹢＋+]/g, '+')
            .replace(/[﹣－−-]/g, '-')
            .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xFEE0))
            .replace(/\s+/g, '');
    }

    function hasZeroLevelToken(value) {
        const normalized = normalizeZeroLevelToken(value);
        return normalized === '0' || normalized === '+0' || normalized === '-0';
    }

    function normalizeLevelDisplayValue(value) {
        const text = value == null ? '' : String(value).trim();
        if (!text) {
            return '';
        }
        return hasZeroLevelToken(text) ? '' : text;
    }

    function createEffectContext(record, slot, symbol, imageName, recordIndex, options = {}) {
        if (!record || typeof record !== 'object') {
            return null;
        }

        const {
            normalizeStatus = (value) => value,
            parseLevelOptions: parseOptions = parseLevelOptions,
            kind: requestedKind
        } = options;

        const normalizedKind =
            typeof requestedKind === 'string' && requestedKind.trim().toLowerCase() === 'demerit'
                ? 'demerit'
                : 'effect';

        if (normalizedKind === 'demerit') {
            const predictionRaw = record[`Demerit${slot}`];
            const raw = record[`DemeritRawText${slot}`];
            const score = record[`DemeritScore${slot}`];

            const predictionText = predictionRaw == null ? '' : String(predictionRaw);
            const rawText = raw == null ? '' : String(raw);
            const hasScoreValue = score != null && !Number.isNaN(Number(score));

            if (!predictionText && !rawText && !hasScoreValue) {
                return null;
            }

            const numericScore = Number(score);
            const hasFiniteScore = Number.isFinite(numericScore);
            const scoreDisplay = hasFiniteScore ? `${numericScore.toFixed(1)}%` : '--';
            const ocrDisplay = rawText || '--';

            const correctionKey = `Demerit${slot}Correction`;
            const correctionValue = record[correctionKey] == null ? '' : String(record[correctionKey]);
            const initialStatus = normalizeStatus(record[`Demerit${slot}Status`]) || 'pending';
            const statusValue = correctionValue && initialStatus !== 'pass' ? 'corrected' : initialStatus;

            const predictionLower = predictionText.toLowerCase();
            const rawLower = rawText.toLowerCase();
            const correctionValueLower = correctionValue.toLowerCase();

            const normalizedImageName = imageName == null ? '' : String(imageName);
            const imageNameLower = normalizedImageName.toLowerCase();
            const effectNameForLevels = correctionValue || predictionText || rawText;

            return {
                record,
                slot,
                symbol,
                imageName: normalizedImageName,
                imageNameLower,
                recordIndex,
                predictionText,
                predictionLower,
                rawText,
                rawLower,
                effectKind: 'demerit',
                isDemerit: true,
                numericScore,
                hasFiniteScore,
                scoreDisplay,
                ocrDisplay,
                statusValue,
                levelValue: '',
                levelValueLower: '',
                levelOptions: [],
                levelOptionsLower: [],
                levelOptionsDisplay: '',
                levelCorrection: '',
                levelCorrectionLower: '',
                preserveOriginalLevel: true,
                displayLevel: '',
                displayLevelLower: '',
                correctionValue,
                correctionValueLower,
                effectNameForLevels,
                lowConfidence: hasFiniteScore && numericScore < 60
            };
        }

        const prediction = record[`Effect${slot}`];
        const raw = record[`RawText${slot}`];
        const score = record[`Effect${slot}Score`];

        const predictionText = prediction == null ? '' : String(prediction);
        const rawText = raw == null ? '' : String(raw);
        const hasScoreValue = score != null && !Number.isNaN(Number(score));

        if (!predictionText && !rawText && !hasScoreValue) {
            return null;
        }

        const numericScore = Number(score);
        const hasFiniteScore = Number.isFinite(numericScore);
        const scoreDisplay = hasFiniteScore ? `${numericScore.toFixed(1)}%` : '--';
        const ocrDisplay = rawText || '--';

        const levelValueRaw = record[`Effect${slot}Level`];
        const levelValue = normalizeLevelDisplayValue(levelValueRaw);
        const levelOptionsRaw = record[`Effect${slot}LevelOptions`];
        const parsedLevelOptions = parseOptions(levelOptionsRaw);
        const levelOptions = [];
        const levelOptionsLower = [];
        const levelOptionSeen = new Set();
        let hasZeroLevelOption = false;
        parsedLevelOptions.forEach((option) => {
            const text = option == null ? '' : String(option).trim();
            if (!text) {
                return;
            }
            if (hasZeroLevelToken(text)) {
                hasZeroLevelOption = true;
                return;
            }
            const lower = text.toLowerCase();
            if (levelOptionSeen.has(lower)) {
                return;
            }
            levelOptionSeen.add(lower);
            levelOptions.push(text);
            levelOptionsLower.push(lower);
        });

        const levelCorrectionKey = `Effect${slot}LevelCorrection`;
        const levelCorrectionRaw = record[levelCorrectionKey];
        const levelCorrection = levelCorrectionRaw == null ? '' : String(levelCorrectionRaw).trim();
        const levelSuppressedRaw = record[`Effect${slot}LevelSuppressed`];
        const levelSuppressed =
            typeof levelSuppressedRaw === 'boolean'
                ? levelSuppressedRaw
                : String(levelSuppressedRaw || '').trim().toLowerCase() === 'true';
        const preserveOriginalLevel = !levelSuppressed;
        const levelOptionsDisplay = levelOptions.join('|');
        const displayLevel = levelCorrection || (preserveOriginalLevel ? levelValue : '');

        const correctionKey = `Effect${slot}Correction`;
        const correctionValue = record[correctionKey] == null ? '' : String(record[correctionKey]);

        const initialStatus = normalizeStatus(record[`Effect${slot}Status`]) || 'pending';
        const statusValue = correctionValue && initialStatus !== 'pass' ? 'corrected' : initialStatus;

        const predictionLower = predictionText.toLowerCase();
        const rawLower = rawText.toLowerCase();
        const levelValueLower = levelValue ? levelValue.toLowerCase() : '';
        const displayLevelLower = displayLevel ? displayLevel.toLowerCase() : '';
        const levelCorrectionLower = levelCorrection ? levelCorrection.toLowerCase() : '';
        const correctionValueLower = correctionValue.toLowerCase();

        const normalizedImageName = imageName == null ? '' : String(imageName);
        const imageNameLower = normalizedImageName.toLowerCase();

        const effectNameForLevels = correctionValue || predictionText || rawText;

        return {
            record,
            slot,
            symbol,
            imageName: normalizedImageName,
            imageNameLower,
            recordIndex,
            predictionText,
            predictionLower,
            rawText,
            rawLower,
            effectKind: 'effect',
            isDemerit: false,
            numericScore,
            hasFiniteScore,
            scoreDisplay,
            ocrDisplay,
            statusValue,
            levelValue,
            levelValueLower,
            levelOptions,
            levelOptionsLower,
            levelOptionsDisplay,
            hasZeroLevelOption,
            levelCorrection,
            levelCorrectionLower,
            preserveOriginalLevel,
            displayLevel,
            displayLevelLower,
            correctionValue,
            correctionValueLower,
            effectNameForLevels,
            lowConfidence: hasFiniteScore && numericScore < 60
        };
    }

    function buildLevelChoices(context, options = {}) {
        if (!context || typeof context !== 'object') {
            return [];
        }

        const { sortLevelsAscending = (values) => (Array.isArray(values) ? values.slice() : []) } = options;

        const levelChoices = [];
        const seenLevels = new Set();

        const pushLevelChoice = (value) => {
            if (value == null) {
                return;
            }
            const text = String(value).trim();
            if (!text) {
                return;
            }
            const key = text.toLowerCase();
            if (seenLevels.has(key)) {
                return;
            }
            seenLevels.add(key);
            levelChoices.push(text);
        };

        const levelOptions = Array.isArray(context.levelOptions) ? context.levelOptions : [];
        const levelValueLower = context.levelValueLower || '';
        let originalInOptions = false;

        levelOptions.forEach((option) => {
            const text = option == null ? '' : String(option).trim();
            if (!text) {
                return;
            }
            const lower = text.toLowerCase();
            if (levelValueLower && lower === levelValueLower) {
                originalInOptions = true;
                if (context.preserveOriginalLevel) {
                    pushLevelChoice(text);
                }
                return;
            }
            pushLevelChoice(text);
        });

        if (context.levelValue) {
            if (context.preserveOriginalLevel) {
                pushLevelChoice(context.levelValue);
            } else if (originalInOptions && levelChoices.length) {
                pushLevelChoice(context.levelValue);
            }
        }

        pushLevelChoice(context.levelCorrection);

        return sortLevelsAscending(levelChoices);
    }

    if (!window.galleryRenderFactory) {
        window.galleryRenderFactory = {};
    }

    window.galleryRenderFactory.effectViewModel = {
        parseLevelOptions,
        createEffectContext,
        buildLevelChoices
    };
})();

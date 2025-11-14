(() => {
    function parseLevelOptions(raw) {
        if (raw == null) {
            return [];
        }
        if (Array.isArray(raw)) {
            return raw
                .map((value) => (value == null ? '' : String(value).trim()))
                .filter((value) => value !== '' && value.toLowerCase() !== 'none');
        }
        if (typeof raw === 'string') {
            if (!raw.includes('|')) {
                const text = raw.trim();
                if (!text || text.toLowerCase() === 'none') {
                    return [];
                }
                return [text];
            }
            return raw
                .split('|')
                .map((value) => value.trim())
                .filter((value) => value !== '' && value.toLowerCase() !== 'none');
        }
        return [];
    }

    function createEffectContext(record, slot, symbol, imageName, recordIndex, options = {}) {
        if (!record || typeof record !== 'object') {
            return null;
        }

        const {
            normalizeStatus = (value) => value,
            parseLevelOptions: parseOptions = parseLevelOptions,
            kind: requestedKind,
            allowEmptyDemerit = false
        } = options;

        const normalizedKind =
            typeof requestedKind === 'string' && requestedKind.trim().toLowerCase() === 'demerit'
                ? 'demerit'
                : 'effect';

        if (normalizedKind === 'demerit') {
            const predictionRaw = record[`Demerit${slot}`];
            const raw = record[`Demerit${slot}RawText`];
            const score = record[`Demerit${slot}Score`];

            const predictionText = predictionRaw == null ? '' : String(predictionRaw);
            const rawText = raw == null ? '' : String(raw);
            const hasScoreValue = score != null && !Number.isNaN(Number(score));

            if (!predictionText && !rawText && !hasScoreValue && !allowEmptyDemerit) {
                return null;
            }

            const numericScore = Number(score);
            const hasFiniteScore = Number.isFinite(numericScore);
            const scoreDisplay = hasFiniteScore ? `${numericScore.toFixed(1)}%` : '--';
            const ocrDisplay = rawText || '--';

            const predictionLower = predictionText.toLowerCase();
            const rawLower = rawText.toLowerCase();

            const normalizedImageName = imageName == null ? '' : String(imageName);
            const imageNameLower = normalizedImageName.toLowerCase();
            const effectNameForLevels = predictionText || rawText;

            const statusValue = normalizeStatus(record[`Demerit${slot}Status`]) || 'pending';

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
                correctionValue: '',
                correctionValueLower: '',
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
        const levelValue = levelValueRaw == null ? '' : String(levelValueRaw).trim();
        const levelOptionsRaw = record[`Effect${slot}LevelOptions`];
        const levelOptions = parseOptions(levelOptionsRaw);
        const levelOptionsLower = levelOptions.map((value) => (value == null ? '' : String(value).toLowerCase()));
        const levelOptionsDisplayValues = levelOptions
            .map((value) => (value == null ? '' : String(value).trim()))
            .filter((value) => value && value.toLowerCase() !== 'none');
        const levelOptionsDisplay = levelOptionsDisplayValues.join('|');
        const levelOptionsDisplayRaw = levelOptions.join('|');

        const levelValueLower = levelValue ? levelValue.toLowerCase() : '';
        const hasLevelOptions = levelOptions.length > 0;
        const hasOriginalLevel = Boolean(levelValue && levelValueLower !== 'none');
        const preserveOriginalLevel = hasLevelOptions || hasOriginalLevel;
        const displayLevel = preserveOriginalLevel ? levelValue : '';

        const statusValue = normalizeStatus(record[`Effect${slot}Status`]) || 'pending';

        const predictionLower = predictionText.toLowerCase();
        const rawLower = rawText.toLowerCase();
        const displayLevelLower = displayLevel ? displayLevel.toLowerCase() : '';
        const levelCorrection = '';
        const levelCorrectionLower = '';
        const correctionValue = '';
        const correctionValueLower = '';

        const normalizedImageName = imageName == null ? '' : String(imageName);
        const imageNameLower = normalizedImageName.toLowerCase();

        const effectNameForLevels = predictionText || rawText;

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
            levelOptionsDisplayRaw,
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

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

    function createEffectContext(record, slot, symbol, imageName, recordIndex, options = {}) {
        if (!record || typeof record !== 'object') {
            return null;
        }

        const {
            normalizeStatus = (value) => value,
            parseLevelOptions: parseOptions = parseLevelOptions
        } = options;

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
        const kindValueRaw = record[`Effect${slot}Kind`];
        const kindText =
            kindValueRaw == null
                ? ''
                : String(kindValueRaw)
                      .trim()
                      .toLowerCase();
        const effectKind = kindText || 'effect';
        const isDemerit = effectKind === 'demerit';

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

        const initialStatus = normalizeStatus(record[`Effect${slot}Status`]);
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
            effectKind,
            isDemerit,
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

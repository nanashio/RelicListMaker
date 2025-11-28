(() => {
    function createStatusNormalizer(normalizeStatus) {
        if (typeof normalizeStatus === 'function') {
            return normalizeStatus;
        }
        return (value) => {
            const text = value == null ? '' : String(value).trim().toLowerCase();
            if (text === 'pass') {
                return 'pass';
            }
            if (text === 'corrected') {
                return 'corrected';
            }
            if (text === 'pending') {
                return 'pending';
            }
            if (text === 'fail') {
                return 'fail';
            }
            return text || 'pending';
        };
    }

    function normalizeStatusList(values, normalizeStatus) {
        if (!values) {
            return [];
        }
        if (Array.isArray(values)) {
            return values
                .map((entry) => normalizeStatus(entry))
                .filter((entry) => entry != null && entry !== '');
        }
        if (typeof values === 'string') {
            const trimmed = values.trim();
            if (!trimmed) {
                return [];
            }
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    return parsed
                        .map((entry) => normalizeStatus(entry))
                        .filter((entry) => entry != null && entry !== '');
                }
            } catch (error) {
                // JSON ではない場合はカンマ区切りで処理する
            }
            return trimmed
                .split(',')
                .map((entry) => normalizeStatus(entry))
                .filter((entry) => entry != null && entry !== '');
        }
        return [];
    }

    function resolveSlotStatuses(itemState, normalizeStatus) {
        if (!itemState || typeof itemState !== 'object') {
            return [];
        }
        if (Array.isArray(itemState.effectSlotStatuses)) {
            return itemState.effectSlotStatuses
                .map((entry) => normalizeStatus(entry))
                .filter((entry) => entry != null && entry !== '');
        }
        if (typeof itemState.effectSlotStatuses === 'string') {
            return normalizeStatusList(itemState.effectSlotStatuses, normalizeStatus);
        }
        return [];
    }

    function resolveEffectStates(itemState, normalizeStatus) {
        if (!itemState || typeof itemState !== 'object') {
            return [];
        }
        if (Array.isArray(itemState.effectStates) || typeof itemState.effectStates === 'string') {
            return normalizeStatusList(itemState.effectStates, normalizeStatus);
        }
        return [];
    }

    function createSummaryCalculator(options = {}) {
        const normalizeStatus = createStatusNormalizer(options.normalizeStatus);

        function summarize(items = []) {
            if (!Array.isArray(items)) {
                return { totalCount: 0, fullyConfirmedCount: 0, pendingCount: 0 };
            }

            let fullyConfirmedCount = 0;
            let pendingCount = 0;

            items.forEach((itemState) => {
                if (!itemState || typeof itemState !== 'object') {
                    return;
                }
                const slotStatuses = resolveSlotStatuses(itemState, normalizeStatus).slice(0, 3);
                const effectStates = resolveEffectStates(itemState, normalizeStatus);

                const hasSlotStatuses = slotStatuses.some((status) => status && status !== '');
                const hasEffectStates = effectStates.some((status) => status && status !== '');
                const hasPending = (hasSlotStatuses ? slotStatuses : effectStates).some(
                    (status) => status === 'pending'
                );

                if (!hasSlotStatuses && !hasEffectStates) {
                    pendingCount += 1;
                    return;
                }

                if (hasPending) {
                    pendingCount += 1;
                }

                const hasAllSlots = slotStatuses.length >= 3 && slotStatuses.every((status) => status);
                if (hasAllSlots && !hasPending) {
                    fullyConfirmedCount += 1;
                }
            });

            return {
                totalCount: items.length,
                fullyConfirmedCount,
                pendingCount
            };
        }

        return { summarize };
    }

    const namespace = window.gallerySummaryUtils ? { ...window.gallerySummaryUtils } : {};
    namespace.createSummaryCalculator = createSummaryCalculator;
    window.gallerySummaryUtils = namespace;
})();

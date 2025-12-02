(() => {
    function defaultQueryTagInput(target) {
        if (!target || typeof target.querySelector !== 'function') {
            return null;
        }
        return target.querySelector('.item-tags-input');
    }

    function createTagStateBridge(config = {}) {
        const { tagStore, tagInputController, documentRef = typeof document !== 'undefined' ? document : null } = config;
        const storeApi = tagStore && typeof tagStore.buildEntry === 'function' ? tagStore : null;
        if (!storeApi) {
            throw new Error('createTagStateBridge: tagStore with buildEntry is required');
        }

        const controller =
            tagInputController && typeof tagInputController.syncValue === 'function' ? tagInputController : null;
        const queryTagInput = typeof config.queryTagInput === 'function' ? config.queryTagInput : defaultQueryTagInput;

        function applyDataset(target, entry) {
            if (!target || !target.dataset) {
                return;
            }
            const tokens = Array.isArray(entry.tokens) ? entry.tokens : [];
            if (tokens.length) {
                target.dataset.tags = tokens.join(' ');
                target.dataset.tagTokens = entry.tokenKeys ? entry.tokenKeys.join(' ') : tokens.join(' ');
                return;
            }
            delete target.dataset.tags;
            delete target.dataset.tagTokens;
        }

        function syncInput(target, entry, { allowWhileEditing = false } = {}) {
            const input = queryTagInput(target);
            if (!input) {
                return;
            }
            const tokens = Array.isArray(entry.tokens) ? entry.tokens : [];
            const usesEnhancedController = controller && controller.usesNativeInput !== true;
            const isEditing = Boolean(
                input.dataset?.editingTags === 'true' || (documentRef && documentRef.activeElement === input)
            );
            if (!allowWhileEditing && isEditing && !usesEnhancedController) {
                return;
            }
            if (controller) {
                controller.syncValue(input, tokens);
                return;
            }
            const displayValue = tokens.join(' ');
            if (!allowWhileEditing && isEditing) {
                return;
            }
            if (input.value !== displayValue) {
                input.value = displayValue;
            }
        }

        function applyTags(target, tagsValue, options = {}) {
            const entry = storeApi.buildEntry(tagsValue);
            applyDataset(target, entry);
            syncInput(target, entry, options);
            return entry;
        }

        return {
            applyTags,
            applyDataset,
            syncInput,
            normalizeTags: typeof storeApi.normalizeTags === 'function' ? storeApi.normalizeTags : (value) => value,
            normalizeTokens:
                typeof storeApi.normalizeTokens === 'function' ? (value) => storeApi.normalizeTokens(value) : (value) => value,
            buildEntry: (value) => storeApi.buildEntry(value)
        };
    }

    if (!window.galleryStores) {
        window.galleryStores = {};
    }
    window.galleryStores.createTagStateBridge = createTagStateBridge;
})();

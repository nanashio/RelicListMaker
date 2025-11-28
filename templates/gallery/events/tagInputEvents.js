(() => {
    function createTagInputEvents(config = {}) {
        const {
            galleryElement,
            resolveTagsInputTarget,
            updateItemTags,
            getItemContext,
            tagStore,
            tagInputController
        } = config;

        if (!galleryElement || typeof galleryElement.addEventListener !== 'function') {
            return null;
        }
        if (typeof resolveTagsInputTarget !== 'function') {
            throw new Error('createTagInputEvents: resolveTagsInputTarget must be a function');
        }
        if (typeof updateItemTags !== 'function') {
            throw new Error('createTagInputEvents: updateItemTags must be a function');
        }
        if (typeof getItemContext !== 'function') {
            throw new Error('createTagInputEvents: getItemContext must be a function');
        }

        const editingInputs = new WeakSet();
        const tagStoreApi = tagStore && typeof tagStore.readRecordTags === 'function' ? tagStore : null;
        const enhancedController =
            tagInputController && typeof tagInputController.syncValue === 'function' ? tagInputController : null;

        function markEditing(input) {
            if (!input) {
                return;
            }
            editingInputs.add(input);
            if (input.dataset) {
                input.dataset.editingTags = 'true';
            }
        }

        function clearEditing(input) {
            if (!input) {
                return;
            }
            editingInputs.delete(input);
            if (input.dataset) {
                delete input.dataset.editingTags;
            }
        }

        function syncNativeDisplay(input) {
            if (!input || !tagStoreApi) {
                return;
            }
            const context = getItemContext(input);
            if (!context || !context.item) {
                return;
            }
            const entry = tagStoreApi.readRecordTags(context.recordIndex);
            const tokens = Array.isArray(entry.tokens) ? entry.tokens : [];
            const normalized = entry.normalized || '';

            if (enhancedController && tagInputController.usesNativeInput !== true) {
                enhancedController.syncValue(input, tokens);
                return;
            }

            if (editingInputs.has(input)) {
                return;
            }

            const displayValue = tokens.length ? tokens.join(' ') : normalized;
            if (displayValue != null && input.value !== displayValue) {
                input.value = displayValue;
            }
        }

        function handleInput(event) {
            const target = resolveTagsInputTarget(event.target);
            if (!target) {
                return;
            }
            markEditing(target);
            updateItemTags(target);
        }

        function handleFocusIn(event) {
            const target = resolveTagsInputTarget(event.target);
            if (!target) {
                return;
            }
            markEditing(target);
        }

        function handleFocusOut(event) {
            const target = resolveTagsInputTarget(event.target);
            if (!target) {
                return;
            }
            clearEditing(target);
            updateItemTags(target);
            if (target.dataset.tagInputEnhanced !== 'true') {
                syncNativeDisplay(target);
            }
        }

        function handleChange(event) {
            const target = resolveTagsInputTarget(event.target);
            if (!target) {
                return false;
            }
            updateItemTags(target);
            return true;
        }

        function bind() {
            galleryElement.addEventListener('input', handleInput);
            galleryElement.addEventListener('focusin', handleFocusIn);
            galleryElement.addEventListener('focusout', handleFocusOut);
        }

        return { bind, handleChange };
    }

    if (!window.galleryEventsFactory) {
        window.galleryEventsFactory = {};
    }
    window.galleryEventsFactory.createTagInputEvents = createTagInputEvents;
})();

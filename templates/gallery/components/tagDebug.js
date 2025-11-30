(() => {
    function defaultIsTagDebugEnabled() {
        if (typeof window === 'undefined' || !window) {
            return false;
        }
        if (typeof window.galleryDebugTags !== 'undefined') {
            return Boolean(window.galleryDebugTags);
        }
        try {
            return window.localStorage && window.localStorage.getItem('galleryDebugTags') === 'true';
        } catch (error) {
            return false;
        }
    }

    function createTagDebugResolver(config = {}) {
        const isDebugEnabled = typeof config.isDebugEnabled === 'function' ? config.isDebugEnabled : null;
        return () => {
            if (isDebugEnabled) {
                try {
                    return Boolean(isDebugEnabled());
                } catch (error) {
                    return defaultIsTagDebugEnabled();
                }
            }
            return defaultIsTagDebugEnabled();
        };
    }

    if (!window.galleryComponents) {
        window.galleryComponents = {};
    }

    window.galleryComponents.defaultIsTagDebugEnabled = defaultIsTagDebugEnabled;
    window.galleryComponents.createTagDebugResolver = createTagDebugResolver;
})();

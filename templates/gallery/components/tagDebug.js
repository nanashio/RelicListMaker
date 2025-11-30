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

    function resolveTagDebugResolver(config = {}) {
        const namespace = typeof window !== 'undefined' && window ? window.galleryComponents : null;
        const createResolver =
            namespace && typeof namespace.createTagDebugResolver === 'function'
                ? namespace.createTagDebugResolver
                : createTagDebugResolver;
        const defaultResolver =
            namespace && typeof namespace.defaultIsTagDebugEnabled === 'function'
                ? namespace.defaultIsTagDebugEnabled
                : defaultIsTagDebugEnabled;
        const { isDebugEnabled } = config;

        try {
            const resolver = createResolver({ isDebugEnabled });
            if (typeof resolver === 'function') {
                return resolver;
            }
        } catch (error) {
            // fall through to the default resolver
        }

        return () => {
            if (typeof isDebugEnabled === 'function') {
                try {
                    return Boolean(isDebugEnabled());
                } catch (error) {
                    return defaultResolver();
                }
            }
            return defaultResolver();
        };
    }

    if (!window.galleryComponents) {
        window.galleryComponents = {};
    }

    window.galleryComponents.defaultIsTagDebugEnabled = defaultIsTagDebugEnabled;
    window.galleryComponents.createTagDebugResolver = createTagDebugResolver;
    window.galleryComponents.resolveTagDebugResolver = resolveTagDebugResolver;
})();

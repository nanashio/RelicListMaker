(() => {
    function defaultIsTagDebugEnabled() {
        if (typeof window === 'undefined' || !window) {
            return false;
        }
        try {
            if (typeof window.galleryDebugTags !== 'undefined') {
                return Boolean(window.galleryDebugTags);
            }
            return window.localStorage && window.localStorage.getItem('galleryDebugTags') === 'true';
        } catch (error) {
            return false;
        }
    }

    function resolveTagDebugResolverWithFallback(config = {}) {
        const namespace = typeof window !== 'undefined' && window ? window.galleryComponents : null;
        const resolver =
            namespace && typeof namespace.resolveTagDebugResolver === 'function'
                ? namespace.resolveTagDebugResolver
                : null;
        const defaultResolver =
            namespace && typeof namespace.defaultIsTagDebugEnabled === 'function'
                ? namespace.defaultIsTagDebugEnabled
                : defaultIsTagDebugEnabled;

        if (resolver) {
            try {
                const resolved = resolver(config);
                if (typeof resolved === 'function') {
                    return resolved;
                }
            } catch (error) {
                // fall through to the default resolver
            }
        }

        const { isDebugEnabled } = config;
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

    function resolveSharedTomSelectAdapterWithDebug(config = {}) {
        const namespace = typeof window !== 'undefined' && window ? window.galleryComponents : null;
        const resolver =
            namespace && typeof namespace.resolveSharedTomSelectAdapter === 'function'
                ? namespace.resolveSharedTomSelectAdapter
                : null;
        const isDebugEnabled = resolveTagDebugResolverWithFallback({ isDebugEnabled: config.isDebugEnabled });

        if (resolver) {
            return resolver({
                resolveTomSelectAdapter: config.resolveTomSelectAdapter,
                createTomSelectAdapter: config.createTomSelectAdapter,
                createDefaultTomSelectAdapter: config.createDefaultTomSelectAdapter,
                TomSelect: config.TomSelect,
                documentRef: config.documentRef,
                isDebugEnabled
            });
        }

        return null;
    }

    if (!window.galleryComponents) {
        window.galleryComponents = {};
    }

    window.galleryComponents.resolveTagDebugResolverWithFallback = resolveTagDebugResolverWithFallback;
    window.galleryComponents.resolveSharedTomSelectAdapterWithDebug = resolveSharedTomSelectAdapterWithDebug;
})();

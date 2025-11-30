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

    function resolveSharedTagDebugResolver(config = {}) {
        return resolveTagDebugResolverWithFallback(config);
    }

    function resolveSharedTomSelectAdapterWithDebug(config = {}) {
        const namespace = typeof window !== 'undefined' && window ? window.galleryComponents : null;
        const sharedResolver =
            namespace && typeof namespace.resolveSharedTomSelectAdapter === 'function'
                ? namespace.resolveSharedTomSelectAdapter
                : null;
        const resolverWithResolver =
            namespace && typeof namespace.resolveTomSelectAdapterWithResolver === 'function'
                ? namespace.resolveTomSelectAdapterWithResolver
                : null;
        const resolverBasic =
            namespace && typeof namespace.resolveTomSelectAdapter === 'function'
                ? namespace.resolveTomSelectAdapter
                : null;
        const defaultFactory =
            typeof config.createDefaultTomSelectAdapter === 'function'
                ? config.createDefaultTomSelectAdapter
                : namespace && typeof namespace.createDefaultTomSelectAdapter === 'function'
                  ? namespace.createDefaultTomSelectAdapter
                  : null;
        const isDebugEnabled = resolveTagDebugResolverWithFallback({ isDebugEnabled: config.isDebugEnabled });

        const adapterConfig = {
            resolveTomSelectAdapter: config.resolveTomSelectAdapter,
            createTomSelectAdapter: config.createTomSelectAdapter,
            createDefaultTomSelectAdapter: defaultFactory,
            TomSelect: config.TomSelect,
            documentRef: config.documentRef,
            isDebugEnabled
        };

        const resolverCandidates = [sharedResolver, resolverWithResolver, resolverBasic].filter(
            (resolver) => typeof resolver === 'function'
        );

        for (const resolver of resolverCandidates) {
            try {
                const adapter = resolver(adapterConfig);
                if (adapter) {
                    return adapter;
                }
            } catch (error) {
                // try next resolver
            }
        }

        if (typeof defaultFactory === 'function') {
            return defaultFactory(config.TomSelect, config.documentRef);
        }

        return null;
    }

    if (!window.galleryComponents) {
        window.galleryComponents = {};
    }

    window.galleryComponents.resolveTagDebugResolverWithFallback = resolveTagDebugResolverWithFallback;
    window.galleryComponents.resolveSharedTagDebugResolver = resolveSharedTagDebugResolver;
    window.galleryComponents.resolveSharedTomSelectAdapterWithDebug = resolveSharedTomSelectAdapterWithDebug;
})();

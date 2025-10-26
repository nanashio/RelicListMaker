(() => {
    function createStorageManager(config = {}) {
        const {
            storageUtils = typeof window !== 'undefined' ? window.galleryStorageUtils : null,
            factories,
            ...managerConfig
        } = config;

        const factoryList = Array.isArray(factories) ? factories.slice() : [];
        const opfsFactory =
            typeof config.createOpfsManager === 'function'
                ? config.createOpfsManager
                : storageUtils && typeof storageUtils.createOpfsManager === 'function'
                  ? storageUtils.createOpfsManager
                  : null;

        if (!factoryList.length && opfsFactory) {
            factoryList.push((options) => opfsFactory(options));
        }

        if (!factoryList.length) {
            throw new Error('createStorageManager: no storage factory available');
        }

        let activeManager = null;
        let lastError = null;
        const baseConfig = { ...managerConfig };

        factoryList.some((factory) => {
            if (typeof factory !== 'function') {
                return false;
            }
            try {
                const candidate = factory(baseConfig);
                if (candidate) {
                    activeManager = candidate;
                    return true;
                }
            } catch (error) {
                lastError = error;
            }
            return false;
        });

        if (!activeManager) {
            if (lastError) {
                throw lastError;
            }
            throw new Error('createStorageManager: unable to initialize storage manager');
        }

        function call(methodName, ...args) {
            if (!activeManager || typeof activeManager[methodName] !== 'function') {
                return undefined;
            }
            return activeManager[methodName](...args);
        }

        return {
            get active() {
                return activeManager;
            },
            get supported() {
                return Boolean(activeManager && activeManager.supported !== false);
            },
            get usesOpfs() {
                return Boolean(activeManager && activeManager.usesOpfs);
            },
            get usesLocalBackup() {
                return Boolean(activeManager && activeManager.usesLocalBackup);
            },
            get fileName() {
                return activeManager && typeof activeManager.fileName === 'string'
                    ? activeManager.fileName
                    : '';
            },
            scheduleSave(...args) {
                call('scheduleSave', ...args);
            },
            async flushNow(...args) {
                return await call('flushNow', ...args);
            },
            async prepare(...args) {
                return await call('prepare', ...args);
            },
            async tryLoad(...args) {
                if (!activeManager || typeof activeManager.tryLoad !== 'function') {
                    return null;
                }
                return await activeManager.tryLoad(...args);
            }
        };
    }

    if (!window.galleryStorageManagerFactory) {
        window.galleryStorageManagerFactory = {};
    }

    window.galleryStorageManagerFactory.createStorageManager = createStorageManager;
})();

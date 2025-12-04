const ESM_ENTRY_GROUP = {
    id: 'esm-foundation',
    description:
        'ES Modules that expose shared resolvers and pure functions consumed by legacy components.',
    entries: [
        {
            id: 'tagTokens',
            specifier: './js/modules/tagTokens.js',
            role: 'Shared tag token utilities and globals'
        },
        {
            id: 'tagTokenResolvers',
            specifier: './js/modules/tagTokenResolvers.js',
            role: 'Shared tag token resolver defaults and bridges'
        },
        {
            id: 'filterPredicates',
            specifier: './js/modules/filterPredicates.js',
            role: 'Filter evaluation helpers consumed by IIFE renderers'
        }
    ]
};

const LEGACY_COMPAT_GROUP = {
    id: 'legacy-compat-layer',
    description:
        'IIFE components and stores that still rely on globals but must load after ESM foundations.',
    entries: [
        { id: 'dom', specifier: './utils/dom.js' },
        { id: 'data', specifier: './utils/data.js' },
        { id: 'records', specifier: './utils/records.js' },
        { id: 'datasetUtils', specifier: './dataset/utils.js' },
        { id: 'filterUtils', specifier: './utils/filter.js' },
        { id: 'filterState', specifier: './utils/filterState.js' },
        { id: 'renderData', specifier: './utils/renderData.js' },
        { id: 'summary', specifier: './utils/summary.js' },
        { id: 'stateStore', specifier: './state/store.js' },
        { id: 'filterStore', specifier: './stores/filterStore.js' },
        { id: 'tagStore', specifier: './stores/tagStore.js' },
        { id: 'tagStateBridge', specifier: './stores/tagStateBridge.js' },
        { id: 'layout', specifier: './app/layout.js' },
        { id: 'stateApi', specifier: './app/stateApi.js' },
        { id: 'datasetManager', specifier: './dataset/manager.js' },
        { id: 'storageUtils', specifier: './storage/utils.js' },
        { id: 'storageManager', specifier: './storage/manager.js' },
        { id: 'controller', specifier: './app/controller.js' },
        { id: 'sharedResolvers', specifier: './components/sharedResolvers.js' },
        { id: 'tagTokenDefaults', specifier: './components/tagTokenDefaults.js' },
        { id: 'tagTokenParsersBridge', specifier: './components/tagTokenParsersBridge.js' },
        { id: 'tagTokenResolversComponent', specifier: './components/tagTokenResolvers.js' },
        { id: 'tagDebug', specifier: './components/tagDebug.js' },
        { id: 'tomSelectAdapterFactory', specifier: './components/tomSelectAdapterFactory.js' },
        { id: 'tomSelectAdapter', specifier: './components/tomSelectAdapter.js' },
        { id: 'tagSearch', specifier: './components/tagSearch.js' },
        { id: 'tagInput', specifier: './components/tagInput.js' },
        { id: 'effectViewModel', specifier: './render/effectViewModel.js' },
        { id: 'effectFactory', specifier: './render/effectFactory.js' },
        { id: 'itemEnhancers', specifier: './render/itemEnhancers.js' },
        { id: 'itemFactory', specifier: './render/itemFactory.js' },
        { id: 'galleryView', specifier: './render/galleryView.js' },
        { id: 'recordActionHandlers', specifier: './events/recordActionHandlers.js' },
        { id: 'tagInputEvents', specifier: './events/tagInputEvents.js' },
        { id: 'galleryEvents', specifier: './events/galleryEvents.js' }
    ]
};

export const MODULE_ENTRY_GROUPS = [ESM_ENTRY_GROUP, LEGACY_COMPAT_GROUP];

export function listModuleDependencies(options = {}) {
    const includeLegacyCompat =
        options.includeLegacyCompat !== undefined ? options.includeLegacyCompat : true;

    const dependencies = [];
    MODULE_ENTRY_GROUPS.forEach((group) => {
        if (!includeLegacyCompat && group.id === LEGACY_COMPAT_GROUP.id) {
            return;
        }
        group.entries.forEach((entry) => {
            dependencies.push(entry.specifier);
        });
    });
    return dependencies;
}

export function registerModuleEntryManifest(target = typeof globalThis !== 'undefined' ? globalThis : undefined) {
    if (!target) {
        return null;
    }

    const resolvedTarget = target && target.window ? target.window : target;
    if (!resolvedTarget) {
        return null;
    }

    const manifest = {
        groups: MODULE_ENTRY_GROUPS,
        dependencies: listModuleDependencies({ includeLegacyCompat: true })
    };
    const namespace = resolvedTarget.galleryModules || (resolvedTarget.galleryModules = {});
    namespace.moduleEntryManifest = manifest;

    if (resolvedTarget !== target) {
        const directNamespace = target.galleryModules || (target.galleryModules = {});
        directNamespace.moduleEntryManifest = manifest;
    }

    return manifest;
}

registerModuleEntryManifest();

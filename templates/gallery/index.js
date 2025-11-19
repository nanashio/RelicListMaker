const MODULE_DEPENDENCIES = [
    './utils/dom.js',
    './utils/data.js',
    './utils/records.js',
    './dataset/utils.js',
    './utils/filter.js',
    './state/store.js',
    './app/stateApi.js',
    './dataset/manager.js',
    './storage/utils.js',
    './storage/manager.js',
    './app/controller.js',
    './components/tagInput.js',
    './render/effectViewModel.js',
    './render/effectFactory.js',
    './render/itemEnhancers.js',
    './render/itemFactory.js',
    './render/galleryView.js',
    './events/recordActionHandlers.js',
    './events/galleryEvents.js'
];

function resolveModuleUrl(specifier, baseUrl) {
    try {
        return new URL(specifier, baseUrl).href;
    } catch (error) {
        console.error('モジュールの解決に失敗しました:', specifier, error);
        return null;
    }
}

async function loadDependencies() {
    const baseUrl = import.meta.url;
    for (const specifier of MODULE_DEPENDENCIES) {
        const resolved = resolveModuleUrl(specifier, baseUrl);
        if (!resolved) {
            continue;
        }
        await import(resolved);
    }
}

function resolveCoreScriptUrl(rawSpecifier) {
    if (!rawSpecifier) {
        return resolveModuleUrl('./gallery.js', import.meta.url);
    }
    const trimmed = rawSpecifier.trim();
    if (!trimmed) {
        return resolveModuleUrl('./gallery.js', import.meta.url);
    }
    try {
        return new URL(trimmed, document.baseURI).href;
    } catch (error) {
        console.error('コアスクリプトの解決に失敗しました:', rawSpecifier, error);
        return resolveModuleUrl(trimmed, import.meta.url);
    }
}

async function bootstrapGallery() {
    try {
        await loadDependencies();
        const body = document.body;
        const coreScript = body && body.dataset ? body.dataset.coreScript : '';
        const coreScriptUrl = resolveCoreScriptUrl(coreScript);
        if (!coreScriptUrl) {
            console.error('コアスクリプトのURLが解決できませんでした。');
            return;
        }
        await import(coreScriptUrl);
    } catch (error) {
        console.error('ギャラリー初期化中にエラーが発生しました:', error);
    }
}

function startWhenReady() {
    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            () => {
                void bootstrapGallery();
            },
            { once: true }
        );
        return;
    }
    void bootstrapGallery();
}

startWhenReady();

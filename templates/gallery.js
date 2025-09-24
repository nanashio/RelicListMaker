(() => {
    'use strict';

    const body = document.body;
    const {
        resultsJson: initialJsonPath = '',
        imgDir: imageDir = '.',
        labelSymbols: labelSymbolsJson = '[]'
    } = body.dataset || {};

    const dom = {
        gallery: document.getElementById('gallery'),
        galleryStatus: document.getElementById('gallery-status'),
        searchInput: document.getElementById('search-input'),
        filterSelect: document.getElementById('filter-status'),
        lightbox: document.getElementById('lightbox'),
        lightboxImg: document.querySelector('#lightbox img'),
        lightboxClose: document.getElementById('lightbox-close'),
        importButton: document.getElementById('pick-json'),
        exportButton: document.getElementById('download-json'),
        storageStatus: document.getElementById('storage-status')
    };

    if (!dom.gallery) {
        return;
    }

    const state = {
        records: [],
        items: [],
        labelSymbols: parseLabelSymbols(labelSymbolsJson),
        imageDir: imageDir || '.',
        jsonPath: initialJsonPath
    };

    const storage = createOpfsManager(() => state.records);
    if (!storage.supported) {
        setStorageStatus('OPFS非対応ブラウザのため、自動保存は無効です。', true);
    }

    attachEventHandlers();
    loadInitialData();

    function parseLabelSymbols(jsonText) {
        try {
            const parsed = JSON.parse(jsonText || '[]');
            if (Array.isArray(parsed) && parsed.length) {
                return parsed
                    .map((symbol) => (symbol == null ? '' : String(symbol)))
                    .filter((symbol) => symbol !== '')
                    .slice();
            }
        } catch (error) {
            console.warn('label symbolsの解析に失敗しました:', error);
        }
        return ['①', '②', '③'];
    }

    function showStatus(message, isError) {
        if (!dom.galleryStatus) {
            return;
        }
        dom.galleryStatus.textContent = message || '';
        dom.galleryStatus.classList.toggle('error', Boolean(isError));
        dom.galleryStatus.style.display = message ? 'block' : 'none';
    }

    function clearStatus() {
        showStatus('', false);
    }

    function setStorageStatus(message, isError) {
        if (!dom.storageStatus) {
            return;
        }
        dom.storageStatus.textContent = message || '';
        dom.storageStatus.classList.toggle('error', Boolean(isError));
        dom.storageStatus.style.display = message ? 'inline' : 'none';
    }

    function toggleExportVisibility(visible) {
        if (dom.exportButton) {
            dom.exportButton.hidden = !visible;
        }
    }

    function createElement(tag, className, text) {
        const element = document.createElement(tag);
        if (className) {
            element.className = className;
        }
        if (text != null) {
            element.textContent = text;
        }
        return element;
    }

    function joinPath(base, leaf) {
        if (!leaf) {
            return base || '';
        }
        if (!base) {
            return leaf;
        }
        const cleanBase = base.replace(/[\/]+$/, '');
        const cleanLeaf = leaf.replace(/^[\/]+/, '');
        return `${cleanBase}/${cleanLeaf}`;
    }

    function normalizeStatus(value) {
        const text = (value || '').toString().toLowerCase();
        if (text === 'pass' || text === 'fail') {
            return text;
        }
        return 'pending';
    }

    function statusLabel(status) {
        if (status === 'pass') {
            return '○ 確認済み';
        }
        if (status === 'fail') {
            return '× 要確認';
        }
        return '未レビュー';
    }

    function ensureLabelCoverage(records) {
        let maxSlot = state.labelSymbols.length;
        records.forEach((record) => {
            if (!record || typeof record !== 'object') {
                return;
            }
            Object.keys(record).forEach((key) => {
                const match = /^Effect(\d+)$/.exec(key);
                if (match) {
                    const slot = parseInt(match[1], 10);
                    if (!Number.isNaN(slot) && slot > maxSlot) {
                        maxSlot = slot;
                    }
                }
            });
        });
        for (let slot = state.labelSymbols.length + 1; slot <= maxSlot; slot += 1) {
            state.labelSymbols.push(`Slot ${slot}`);
        }
    }

    function buildGallery() {
        dom.gallery.textContent = '';
        state.items = [];

        state.records.forEach((record, index) => {
            const item = createItem(record, index);
            if (item) {
                dom.gallery.appendChild(item);
                state.items.push(item);
            }
        });

        if (!state.items.length) {
            showStatus('表示できる結果がありません。', false);
            return;
        }
        clearStatus();
        applyFilters();
    }

    function createItem(record, recordIndex) {
        if (!record || typeof record !== 'object') {
            return null;
        }
        const imageName = record.Image == null ? '' : String(record.Image);
        const item = document.createElement('div');
        item.className = 'item';
        item.dataset.image = imageName.toLowerCase();

        const imagePath = joinPath(state.imageDir, imageName);
        const img = createElement('img');
        img.src = imagePath;
        img.alt = imageName;
        img.dataset.full = imagePath;
        img.tabIndex = 0;
        item.appendChild(img);

        const filename = createElement('div', 'filename', imageName);
        item.appendChild(filename);
        bindImage(img);

        let hasEffect = false;
        state.labelSymbols.forEach((symbol, index) => {
            const effect = createEffect(record, index + 1, symbol || `Slot ${index + 1}`, imageName, recordIndex);
            if (effect) {
                item.appendChild(effect);
                hasEffect = true;
            }
        });

        if (!hasEffect) {
            const placeholder = document.createElement('p');
            placeholder.className = 'no-effect';
            placeholder.textContent = '効果情報がありません。';
            item.appendChild(placeholder);
        }

        return item;
    }

    function createEffect(record, slot, symbol, imageName, recordIndex) {
        const prediction = record[`Effect${slot}`];
        const raw = record[`RawText${slot}`];
        const score = record[`Effect${slot}Score`];
        const statusValue = normalizeStatus(record[`Effect${slot}Status`]);

        const predictionText = prediction == null ? '' : String(prediction);
        const rawText = raw == null ? '' : String(raw);
        const hasContent = predictionText || rawText || (!Number.isNaN(Number(score)) && score != null);
        if (!hasContent) {
            return null;
        }

        const effect = createElement('div', 'effect');
        effect.dataset.slot = String(slot);
        effect.dataset.image = (imageName || '').toLowerCase();
        effect.dataset.pred = predictionText.toLowerCase();
        effect.dataset.raw = rawText.toLowerCase();
        effect.dataset.recordIndex = String(recordIndex);

        const numericScore = Number(score);
        const scoreText = Number.isFinite(numericScore) ? `一致度 ${numericScore.toFixed(1)}%` : '一致度 --';

        const header = createElement('div', 'effect-header');
        header.appendChild(createElement('span', 'effect-label', symbol));
        header.appendChild(createElement('span', 'effect-score', scoreText));

        const predictionLine = createElement('div', 'prediction', `推定: ${predictionText}`);
        const rawLine = createElement('div', 'raw', `OCR: ${rawText}`);

        const decision = createElement('div', 'decision');
        const passButton = createElement('button', 'review-button pass', '○ 合致');
        passButton.type = 'button';
        passButton.dataset.value = 'pass';
        const failButton = createElement('button', 'review-button fail', '× 不一致');
        failButton.type = 'button';
        failButton.dataset.value = 'fail';
        const indicator = createElement('span', 'status-indicator');

        decision.appendChild(passButton);
        decision.appendChild(failButton);
        decision.appendChild(indicator);

        effect.appendChild(header);
        effect.appendChild(predictionLine);
        effect.appendChild(rawLine);
        effect.appendChild(decision);

        updateEffectStatus(effect, statusValue);
        return effect;
    }

    function updateEffectStatus(effect, status) {
        const normalized = normalizeStatus(status);
        effect.dataset.status = normalized;

        const indicator = effect.querySelector('.status-indicator');
        if (indicator) {
            indicator.textContent = statusLabel(normalized);
        }

        effect.querySelectorAll('.review-button').forEach((button) => {
            button.classList.toggle('selected', button.dataset.value === normalized);
        });
    }

    function recordStatusChange(effect, status) {
        const recordIndex = Number(effect.dataset.recordIndex);
        const slotIndex = Number(effect.dataset.slot);

        if (Number.isNaN(recordIndex) || Number.isNaN(slotIndex)) {
            return;
        }
        const record = state.records[recordIndex];
        if (!record) {
            return;
        }

        const key = `Effect${slotIndex}Status`;
        if (record[key] !== status) {
            record[key] = status;
            storage.scheduleSave();
        }
    }

    function applyFilters() {
        const term = (dom.searchInput && dom.searchInput.value ? dom.searchInput.value : '').trim().toLowerCase();
        const filter = dom.filterSelect ? dom.filterSelect.value : 'all';

        state.items.forEach((item) => {
            const imageMatch = item.dataset.image && item.dataset.image.includes(term);
            let matchesSearch = !term || imageMatch;
            let matchesFilter = filter === 'all';

            item.querySelectorAll('.effect').forEach((effect) => {
                if (!matchesSearch && term) {
                    matchesSearch = effect.dataset.pred.includes(term) || effect.dataset.raw.includes(term);
                }
                if (!matchesFilter && effect.dataset.status === filter) {
                    matchesFilter = true;
                }
            });

            item.style.display = matchesSearch && matchesFilter ? '' : 'none';
        });
    }

    function bindImage(img) {
        if (!img) {
            return;
        }
        img.addEventListener('click', () => openLightbox(img));
        img.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ' || event.keyCode === 13 || event.keyCode === 32) {
                event.preventDefault();
                openLightbox(img);
            }
        });
    }

    function openLightbox(img) {
        if (!img || !dom.lightbox || !dom.lightboxImg) {
            return;
        }
        dom.lightboxImg.src = img.dataset.full || img.src;
        dom.lightboxImg.alt = img.alt || '';
        dom.lightbox.classList.add('show');
        dom.lightbox.setAttribute('aria-hidden', 'false');
        if (dom.lightboxClose) {
            dom.lightboxClose.focus();
        }
    }

    function closeLightbox() {
        if (!dom.lightbox || !dom.lightboxImg) {
            return;
        }
        dom.lightbox.classList.remove('show');
        dom.lightbox.setAttribute('aria-hidden', 'true');
        dom.lightboxImg.src = '';
        dom.lightboxImg.alt = '';
    }

    async function loadInitialData() {
        const preferredName = getFileName(state.jsonPath) || 'results.json';

        try {
            const text = await storage.tryLoad(preferredName);
            if (text) {
                loadRecordsArray(JSON.parse(text));
                toggleExportVisibility(true);
                clearStatus();
                setStorageStatus('OPFSから読み込みました。', false);
                return;
            }
        } catch (error) {
            console.warn('OPFSからの読み込みに失敗しました:', error);
        }

        if (!state.jsonPath) {
            showStatus('JSONファイルを選択してください。', false);
            return;
        }

        try {
            showStatus('読み込み中...', false);
            const response = await fetch(state.jsonPath, { cache: 'no-cache' });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            loadRecordsArray(data);
            toggleExportVisibility(true);
            clearStatus();
            if (storage.supported) {
                await storage.prepare(preferredName);
                await storage.flushNow();
            }
        } catch (error) {
            console.error('JSONのロードに失敗しました:', error);
            showStatus(`データの読み込みに失敗しました: ${error.message || error}. 下の「JSONを選択」を使用してください。`, true);
        }
    }

    function loadRecordsArray(data) {
        const records = Array.isArray(data) ? data.slice() : data && typeof data === 'object' ? [data] : [];
        ensureLabelCoverage(records);
        state.records = records;
        buildGallery();
    }

    async function handleImport() {
        try {
            const source = await chooseJsonFile();
            const payload = await toFilePayload(source);
            const text = await payload.file.text();
            const data = JSON.parse(text);

            loadRecordsArray(data);
            toggleExportVisibility(true);
            clearStatus();
            setStorageStatus('JSONを読み込みました。', false);

            if (storage.supported) {
                const name = payload.file.name || getFileName(state.jsonPath) || 'results.json';
                await storage.prepare(name);
                await storage.flushNow();
            }
        } catch (error) {
            if (error && (error.name === 'AbortError' || error.message === 'The user aborted a request.')) {
                setStorageStatus('ファイル選択をキャンセルしました。', false);
                return;
            }
            console.error('JSONの取り込みに失敗しました:', error);
            setStorageStatus(`読み込み失敗: ${error.message || error}`, true);
        }
    }

    function handleExport() {
        if (!state.records.length) {
            setStorageStatus('エクスポート可能なデータがありません。', true);
            return;
        }
        let text;
        try {
            text = JSON.stringify(state.records, null, 2);
        } catch (error) {
            console.error('JSON生成に失敗しました:', error);
            setStorageStatus('エクスポート失敗: JSON生成に失敗しました。', true);
            return;
        }
        const blob = new Blob([text], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = storage.fileName || getFileName(state.jsonPath) || 'results.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setStorageStatus('JSONをダウンロードしました。', false);
    }

    function attachEventHandlers() {
        dom.gallery.addEventListener('click', (event) => {
            const button = event.target.closest('.review-button');
            if (!button) {
                return;
            }
            const effect = button.closest('.effect');
            if (!effect) {
                return;
            }
            const current = effect.dataset.status || 'pending';
            const next = current === button.dataset.value ? 'pending' : button.dataset.value;
            updateEffectStatus(effect, next);
            recordStatusChange(effect, next);
            applyFilters();
        });

        if (dom.searchInput) {
            dom.searchInput.addEventListener('input', applyFilters);
        }
        if (dom.filterSelect) {
            dom.filterSelect.addEventListener('change', applyFilters);
        }
        if (dom.importButton) {
            dom.importButton.addEventListener('click', handleImport);
        }
        if (dom.exportButton) {
            dom.exportButton.addEventListener('click', handleExport);
        }
        if (dom.lightboxClose) {
            dom.lightboxClose.addEventListener('click', closeLightbox);
        }
        if (dom.lightbox) {
            dom.lightbox.addEventListener('click', (event) => {
                if (event.target === dom.lightbox) {
                    closeLightbox();
                }
            });
        }
        document.addEventListener('keydown', (event) => {
            if ((event.key === 'Escape' || event.keyCode === 27) && dom.lightbox && dom.lightbox.classList.contains('show')) {
                closeLightbox();
            }
        });
    }

    function getFileName(path) {
        if (!path) {
            return '';
        }
        const parts = path.split(/[\\/]/);
        return parts[parts.length - 1] || '';
    }

    async function chooseJsonFile() {
        if (window.showOpenFilePicker) {
            const [handle] = await window.showOpenFilePicker({
                multiple: false,
                types: [{ description: 'JSON Files', accept: { 'application/json': ['.json'] } }]
            });
            if (!handle) {
                throw new DOMException('ファイルが選択されませんでした', 'AbortError');
            }
            return handle;
        }

        return new Promise((resolve, reject) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,application/json';
            input.style.display = 'none';

            const cleanup = () => {
                window.removeEventListener('focus', onFocus, true);
                if (input.parentNode) {
                    input.parentNode.removeChild(input);
                }
            };

            const onFocus = () => {
                setTimeout(() => {
                    if (!input.files || !input.files.length) {
                        cleanup();
                        reject(new DOMException('ユーザーがキャンセルしました', 'AbortError'));
                    }
                }, 0);
            };

            input.addEventListener('change', () => {
                if (input.files && input.files[0]) {
                    const file = input.files[0];
                    cleanup();
                    resolve(file);
                } else {
                    cleanup();
                    reject(new DOMException('ファイルが選択されませんでした', 'AbortError'));
                }
            });

            window.addEventListener('focus', onFocus, true);
            document.body.appendChild(input);
            input.click();
        });
    }

    function toFilePayload(source) {
        if (!source) {
            return Promise.reject(new DOMException('ファイルが選択されませんでした', 'AbortError'));
        }
        if (typeof source.getFile === 'function') {
            return source.getFile().then((file) => ({ file, handle: source }));
        }
        if (source instanceof File) {
            return Promise.resolve({ file: source, handle: null });
        }
        return Promise.reject(new Error('未知のファイルソースです'));
    }

    function createOpfsManager(getData) {
        const supported = Boolean(navigator.storage && navigator.storage.getDirectory);
        const state = {
            directoryPromise: null,
            fileHandle: null,
            fileName: '',
            saving: false,
            requeue: false,
            timer: null
        };

        async function ensureDirectory() {
            if (!supported) {
                throw new Error('OPFSはサポートされていません。');
            }
            if (!state.directoryPromise) {
                state.directoryPromise = navigator.storage.getDirectory();
            }
            return state.directoryPromise;
        }

        async function ensureHandle(name, create) {
            if (!name) {
                throw new Error('ファイル名が指定されていません。');
            }
            const directory = await ensureDirectory();
            return directory.getFileHandle(name, { create: Boolean(create) });
        }

        async function tryLoad(defaultName) {
            if (!supported) {
                return null;
            }
            const targetName = state.fileName || defaultName;
            if (!targetName) {
                return null;
            }
            try {
                const handle = await ensureHandle(targetName, false);
                const file = await handle.getFile();
                const text = await file.text();
                state.fileHandle = handle;
                state.fileName = targetName;
                return text;
            } catch (error) {
                if (error && (error.name === 'NotFoundError' || error.code === 8)) {
                    return null;
                }
                throw error;
            }
        }

        async function prepare(name) {
            if (!supported) {
                return;
            }
            const handle = await ensureHandle(name, true);
            state.fileHandle = handle;
            state.fileName = name;
            toggleExportVisibility(true);
        }

        async function writeOnce() {
            if (!supported || !state.fileHandle) {
                return;
            }
            let text;
            try {
                text = JSON.stringify(getData(), null, 2);
            } catch (error) {
                console.error('JSON生成に失敗しました:', error);
                setStorageStatus('保存失敗: JSON生成に失敗しました。', true);
                return;
            }

            if (state.saving) {
                state.requeue = true;
                return;
            }

            state.saving = true;
            state.requeue = false;
            setStorageStatus('保存中...', false);

            try {
                const writable = await state.fileHandle.createWritable();
                await writable.write(text);
                await writable.close();
                setStorageStatus(`保存済み ${new Date().toLocaleTimeString()}`, false);
            } catch (error) {
                console.error('OPFS書き込みに失敗しました:', error);
                setStorageStatus(`保存失敗: ${error.message || error}`, true);
            } finally {
                state.saving = false;
                if (state.requeue) {
                    state.requeue = false;
                    writeOnce();
                }
            }
        }

        function scheduleSave() {
            if (!supported || !state.fileHandle) {
                return;
            }
            if (state.timer) {
                clearTimeout(state.timer);
            }
            state.timer = setTimeout(() => {
                state.timer = null;
                void writeOnce();
            }, 400);
        }

        return {
            supported,
            get fileName() {
                return state.fileName;
            },
            async tryLoad(name) {
                try {
                    return await tryLoad(name);
                } catch (error) {
                    console.warn('OPFS読み込みに失敗しました:', error);
                    setStorageStatus(`OPFS読み込み失敗: ${error.message || error}`, true);
                    return null;
                }
            },
            async prepare(name) {
                try {
                    await prepare(name);
                } catch (error) {
                    console.warn('OPFS初期化に失敗しました:', error);
                    setStorageStatus(`OPFS初期化に失敗しました: ${error.message || error}`, true);
                }
            },
            scheduleSave,
            async flushNow() {
                if (!supported || !state.fileHandle) {
                    return;
                }
                await writeOnce();
            }
        };
    }
})();

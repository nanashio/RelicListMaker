(() => {
    'use strict';

    const MASTER_DATALIST_ID = 'master-relic-options';
    const DUPLICATE_KEY = 'Duplicate';

    const body = document.body;
    const {
        resultsJson: initialJsonPath = '',
        imgDir: imageDir = '.',
        labelSymbols: labelSymbolsJson = '[]',
        masterCsv: masterCsvPath = '',
        masterJson: masterJsonPath = '',
        masterOptions: masterOptionsJson = '[]'
    } = body.dataset || {};

    const dom = {
        gallery: document.getElementById('gallery'),
        galleryStatus: document.getElementById('gallery-status'),
        searchInput: document.getElementById('search-input'),
        filterSelect: document.getElementById('filter-status'),
        showDuplicatesToggle: document.getElementById('show-duplicates'),
        lightbox: document.getElementById('lightbox'),
        lightboxImg: document.querySelector('#lightbox img'),
        lightboxClose: document.getElementById('lightbox-close'),
        downloadCsvButton: document.getElementById('download-csv'),
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
        jsonPath: initialJsonPath,
        masterCsvPath: masterCsvPath || '',
        masterJsonPath: masterJsonPath || '',
        masterOptions: parseMasterOptions(masterOptionsJson),
        masterDatalistPrepared: false
    };

    const duplicates = createDuplicateManager(() => state.jsonPath);

    const storage = createOpfsManager(() => state.records);
    if (!storage.supported) {
        setStorageStatus('自動保存に対応していないブラウザです。CSV ダウンロードでバックアップしてください。', true);
    } else if (!storage.usesOpfs && storage.usesLocalBackup) {
        setStorageStatus('OPFS非対応のため、ローカルストレージに保存します。', false);
    }

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

    function parseMasterOptions(source) {
        let list = source;
        if (typeof source === 'string') {
            if (!source) {
                return [];
            }
            try {
                list = JSON.parse(source);
            } catch (error) {
                console.warn('master optionsの解析に失敗しました:', error);
                return [];
            }
        }

        if (!Array.isArray(list)) {
            return [];
        }

        return list
            .map((value) => (value == null ? '' : String(value).trim()))
            .filter((value) => value !== '');
    }

    function setupMasterOptions() {
        state.masterDatalistPrepared = false;
    }

    function ensureMasterDatalist() {
        if (state.masterDatalistPrepared) {
            return;
        }
        let datalist = document.getElementById(MASTER_DATALIST_ID);
        if (!datalist) {
            datalist = document.createElement('datalist');
            datalist.id = MASTER_DATALIST_ID;
            document.body.appendChild(datalist);
        } else {
            datalist.textContent = '';
        }

        state.masterOptions.forEach((value) => {
            const option = document.createElement('option');
            option.value = value;
            datalist.appendChild(option);
        });

        state.masterDatalistPrepared = true;
    }

    async function ensureMasterOptions() {
        if (state.masterOptions.length) {
            setupMasterOptions();
            ensureMasterDatalist();
            return;
        }

        if (!state.masterJsonPath) {
            setupMasterOptions();
            ensureMasterDatalist();
            return;
        }

        try {
            const response = await fetch(state.masterJsonPath, { cache: 'no-cache' });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            state.masterOptions = parseMasterOptions(data);
        } catch (error) {
            console.error('マスターデータの読み込みに失敗しました:', error);
            setStorageStatus(`マスターデータの読み込みに失敗しました: ${error.message || error}`, true);
            state.masterOptions = [];
        }

        setupMasterOptions();
        ensureMasterDatalist();
    }

    function csvFileName() {
        const baseName = storage.fileName || getFileName(state.jsonPath) || 'results.json';
        const converted = baseName.replace(/\.json$/i, '_review.csv');
        return converted === baseName ? `${baseName}.csv` : converted;
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
        if (text === 'pass') {
            return 'pass';
        }
        if (text === 'corrected') {
            return 'corrected';
        }
        if (text === 'fail') {
            return 'pending';
        }
        return 'pending';
    }

    function statusLabel(status) {
        if (status === 'pass') {
            return '○ 確認済み';
        }
        if (status === 'corrected') {
            return '修正済み';
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

    function includeDuplicatesNow() {
        return Boolean(dom.showDuplicatesToggle && dom.showDuplicatesToggle.checked);
    }

    function buildGallery() {
        const includeDuplicates = includeDuplicatesNow();
        dom.gallery.textContent = '';
        state.items = [];

        const fragment = document.createDocumentFragment();

        state.records.forEach((record, index) => {
            if (isRecordDuplicate(record) && !includeDuplicates) {
                return;
            }
            const item = createItem(record, index);
            if (item) {
                fragment.appendChild(item);
                state.items.push(item);
            }
        });

        if (fragment.childNodes.length) {
            dom.gallery.appendChild(fragment);
        }

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
        item.dataset.imageName = imageName;
        item.dataset.recordIndex = String(recordIndex);

        const imagePath = joinPath(state.imageDir, imageName);
        const img = createElement('img');
        img.src = imagePath;
        img.alt = imageName;
        img.dataset.full = imagePath;
        img.tabIndex = 0;
        item.appendChild(img);

        const controls = createElement('div', 'item-controls');
        const duplicateButton = createElement('button', 'duplicate-toggle');
        duplicateButton.type = 'button';
        duplicateButton.dataset.image = imageName;
        duplicateButton.dataset.action = 'toggle-duplicate';
        duplicateButton.setAttribute('aria-pressed', 'false');
        controls.appendChild(duplicateButton);

        const filename = createElement('span', 'filename', imageName);
        filename.setAttribute('title', imageName);
        controls.appendChild(filename);

        item.appendChild(controls);
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

        syncDuplicateState(item);
        refreshItemCaches(item);
        return item;
    }

    function normalizeDuplicateFlag(value) {
        if (value === true) {
            return true;
        }
        if (value === false || value == null) {
            return false;
        }
        if (typeof value === 'number') {
            return value === 1;
        }
        if (typeof value === 'string') {
            const text = value.trim().toLowerCase();
            return text === 'true' || text === '1' || text === 'yes' || text === 'duplicate';
        }
        return false;
    }

    function isRecordDuplicate(record) {
        if (!record || typeof record !== 'object') {
            return false;
        }
        return normalizeDuplicateFlag(record[DUPLICATE_KEY]);
    }

    function setRecordDuplicate(recordIndex, isDuplicate) {
        if (Number.isNaN(recordIndex)) {
            return false;
        }
        const record = state.records[recordIndex];
        if (!record || typeof record !== 'object') {
            return false;
        }
        if (isDuplicate) {
            if (normalizeDuplicateFlag(record[DUPLICATE_KEY])) {
                return false;
            }
            record[DUPLICATE_KEY] = true;
            return true;
        }
        if (Object.prototype.hasOwnProperty.call(record, DUPLICATE_KEY)) {
            delete record[DUPLICATE_KEY];
            return true;
        }
        return false;
    }

    function updateDuplicateVisuals(item, isDuplicate) {
        if (!item) {
            return;
        }
        const value = Boolean(isDuplicate);
        item.dataset.duplicate = value ? 'true' : 'false';
        item.classList.toggle('is-duplicate', value);

        const button = item.querySelector('.duplicate-toggle');
        if (button) {
            button.textContent = value ? '重複を解除' : '重複として隠す';
            button.setAttribute('aria-pressed', value ? 'true' : 'false');
        }

    }

    function syncDuplicateState(item) {
        if (!item) {
            return;
        }
        const imageName = item.dataset.imageName || '';
        const recordIndex = Number(item.dataset.recordIndex);
        const record = Number.isNaN(recordIndex) ? null : state.records[recordIndex];
        const recordDuplicate = isRecordDuplicate(record);
        const storedDuplicate = imageName ? duplicates.has(imageName) : false;
        const isDuplicate = recordDuplicate || storedDuplicate;
        if (imageName) {
            duplicates.set(imageName, isDuplicate);
        }
        updateDuplicateVisuals(item, isDuplicate);
    }

    function refreshItemCaches(item) {
        if (!item) {
            return;
        }
        const tokens = [];
        const statuses = new Set();

        const imageToken = item.dataset.image;
        if (imageToken) {
            tokens.push(imageToken);
        }

        item.querySelectorAll('.effect').forEach((effect) => {
            const { pred = '', raw = '', correction = '', status = 'pending' } = effect.dataset;
            if (pred) {
                tokens.push(pred);
            }
            if (raw) {
                tokens.push(raw);
            }
            if (correction) {
                tokens.push(correction);
            }
            statuses.add(status || 'pending');
        });

        const combined = tokens
            .filter((token) => token && token.trim() !== '')
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();

        item.dataset.searchCache = combined ? ` ${combined} ` : '';

        const statusValues = statuses.size ? Array.from(statuses) : ['pending'];
        item.dataset.statusCache = `|${statusValues.join('|')}|`;
    }

    function createEffect(record, slot, symbol, imageName, recordIndex) {
        const prediction = record[`Effect${slot}`];
        const raw = record[`RawText${slot}`];
        const score = record[`Effect${slot}Score`];
        let statusValue = normalizeStatus(record[`Effect${slot}Status`]);

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
        const hasFiniteScore = Number.isFinite(numericScore);
        const scoreText = hasFiniteScore ? `一致度 ${numericScore.toFixed(1)}%` : '一致度 --';

        const header = createElement('div', 'effect-header');
        const labelWrap = createElement('div', 'effect-label-wrap');
        labelWrap.appendChild(createElement('span', 'effect-label', symbol));
        const indicator = createElement('span', 'status-indicator');
        labelWrap.appendChild(indicator);
        header.appendChild(labelWrap);
        header.appendChild(createElement('span', 'effect-score', scoreText));

        const predictionLine = createElement('div', 'prediction', `推定: ${predictionText}`);
        const rawLine = createElement('div', 'raw', `OCR: ${rawText}`);

        const correctionKey = `Effect${slot}Correction`;
        const correctionValue = record[correctionKey] == null ? '' : String(record[correctionKey]);
        if (correctionValue && statusValue !== 'pass') {
            statusValue = 'corrected';
        }

        effect.dataset.correction = correctionValue.toLowerCase();
        if (hasFiniteScore && numericScore < 60) {
            effect.classList.add('low-confidence');
            effect.dataset.lowConfidence = 'true';
        }

        const decision = createElement('div', 'decision');
        const decisionRow = createElement('div', 'decision-row');
        const passButton = createElement('button', 'review-button pass', '合致');
        passButton.type = 'button';
        passButton.dataset.value = 'pass';

        const correctionInput = createCorrectionInput(correctionValue);

        decisionRow.appendChild(passButton);
        decisionRow.appendChild(correctionInput);
        decision.appendChild(decisionRow);

        effect.appendChild(header);
        effect.appendChild(predictionLine);
        effect.appendChild(rawLine);
        effect.appendChild(decision);

        updateEffectStatus(effect, statusValue);

        correctionInput.addEventListener('change', correctionChangeHandler(effect, correctionInput));

        return effect;
    }

    function updateEffectStatus(effect, status) {
        const normalized = normalizeStatus(status);
        effect.dataset.status = normalized;
        effect.classList.toggle('pending', normalized === 'pending');

        const indicator = effect.querySelector('.status-indicator');
        if (indicator) {
            indicator.textContent = statusLabel(normalized);
        }

        effect.querySelectorAll('.review-button').forEach((button) => {
            button.classList.toggle('selected', button.dataset.value === normalized);
        });
    }

    function createCorrectionInput(selectedValue) {
        const input = document.createElement('input');
        input.type = 'search';
        input.className = 'correction-input';
        if (state.masterOptions.length) {
            input.setAttribute('list', MASTER_DATALIST_ID);
            input.placeholder = 'master_relicsから選択';
        } else {
            input.placeholder = 'マスターデータ未設定';
            input.disabled = true;
        }
        input.value = selectedValue || '';
        return input;
    }

    function correctionChangeHandler(effect, input) {
        return () => {
            const selected = input.value.trim();
            const indexes = getEffectIndexes(effect);
            if (!indexes) {
                return;
            }
            const nextStatus = selected ? 'corrected' : 'pending';
            const statusChanged = recordStatusChange(effect, nextStatus);
            const correctionChanged = updateRecordCorrection(indexes.recordIndex, indexes.slotIndex, selected);
            effect.dataset.correction = selected ? selected.toLowerCase() : '';
            updateEffectStatus(effect, nextStatus);
            refreshItemCaches(effect.closest('.item'));
            if (!statusChanged && correctionChanged) {
                storage.scheduleSave();
            }
            applyFilters();
        };
    }

    function getEffectIndexes(effect) {
        const recordIndex = Number(effect.dataset.recordIndex);
        const slotIndex = Number(effect.dataset.slot);
        if (Number.isNaN(recordIndex) || Number.isNaN(slotIndex)) {
            return null;
        }
        return { recordIndex, slotIndex };
    }

    function updateRecordCorrection(recordIndex, slotIndex, value) {
        if (Number.isNaN(recordIndex) || Number.isNaN(slotIndex)) {
            return false;
        }
        const record = state.records[recordIndex];
        if (!record) {
            return false;
        }
        const key = `Effect${slotIndex}Correction`;
        if (value) {
            if (record[key] === value) {
                return false;
            }
            record[key] = value;
            return true;
        }
        if (Object.prototype.hasOwnProperty.call(record, key)) {
            delete record[key];
            return true;
        }
        return false;
    }

    function recordStatusChange(effect, status) {
        const indexes = getEffectIndexes(effect);
        if (!indexes) {
            return false;
        }
        const record = state.records[indexes.recordIndex];
        if (!record) {
            return false;
        }
        const key = `Effect${indexes.slotIndex}Status`;
        if (record[key] !== status) {
            record[key] = status;
            storage.scheduleSave();
            return true;
        }
        return false;
    }

    function applyFilters() {
        const term = (dom.searchInput && dom.searchInput.value ? dom.searchInput.value : '').trim().toLowerCase();
        const filter = dom.filterSelect ? dom.filterSelect.value : 'all';
        const showDuplicates = includeDuplicatesNow();

        state.items.forEach((item) => {
            if (!item) {
                return;
            }
            if (item.dataset.duplicate === 'true' && !showDuplicates) {
                item.style.display = 'none';
                return;
            }

            const cache = item.dataset.searchCache || '';
            const matchesSearch = !term || (cache && cache.includes(term));

            let matchesFilter = filter === 'all';
            if (!matchesFilter) {
                const statuses = item.dataset.statusCache || '';
                matchesFilter = statuses.includes(`|${filter}|`);
            }

            item.style.display = matchesSearch && matchesFilter ? '' : 'none';
        });
    }

    function handleDuplicateToggle(button) {
        if (!button) {
            return;
        }
        const item = button.closest('.item');
        if (!item) {
            return;
        }
        const imageName = button.dataset.image || item.dataset.imageName || '';
        const recordIndex = Number(item.dataset.recordIndex);
        const record = Number.isNaN(recordIndex) ? null : state.records[recordIndex];
        const currentState = isRecordDuplicate(record) || item.dataset.duplicate === 'true';
        const nextState = !currentState;
        if (imageName) {
            button.dataset.image = imageName;
            duplicates.set(imageName, nextState);
        }
        const recordChanged = setRecordDuplicate(recordIndex, nextState);
        updateDuplicateVisuals(item, nextState);
        if (recordChanged) {
            storage.scheduleSave();
        }
        buildGallery();
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

    function collectCsvHeaders(records) {
        const seen = new Set();
        records.forEach((record) => {
            if (record && typeof record === 'object') {
                Object.keys(record).forEach((key) => {
                    if (!seen.has(key)) {
                        seen.add(key);
                    }
                });
            }
        });

        if (!seen.size) {
            return [];
        }

        const headers = [];
        if (seen.delete('Image')) {
            headers.push('Image');
        }
        headers.push(...Array.from(seen).sort());
        return headers;
    }

    function csvEscape(value) {
        const text = value == null ? '' : String(value);
        return '"' + text.replace(/"/g, '""') + '"';
    }

    function generateCsv(records) {
        const headers = collectCsvHeaders(records);
        if (!headers.length) {
            return '';
        }

        const lines = [];
        lines.push(headers.map(csvEscape).join(','));

        records.forEach((record) => {
            const row = headers.map((key) => {
                if (!record || typeof record !== 'object') {
                    return csvEscape('');
                }
                const value = Object.prototype.hasOwnProperty.call(record, key) ? record[key] : '';
                return csvEscape(value);
            });
            lines.push(row.join(','));
        });

        return lines.join('\n');
    }

    async function loadInitialData() {
        const preferredName = getFileName(state.jsonPath) || 'results.json';

        try {
            const text = await storage.tryLoad(preferredName);
            if (text) {
                loadRecordsArray(JSON.parse(text));
                clearStatus();
                setStorageStatus('OPFSから読み込みました。', false);
                return;
            }
        } catch (error) {
            console.warn('OPFSからの読み込みに失敗しました:', error);
        }

        if (!state.jsonPath) {
            showStatus('JSONファイルのパスが指定されていません。', true);
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
            clearStatus();
            if (storage.supported) {
                await storage.prepare(preferredName);
                await storage.flushNow();
            }
        } catch (error) {
            console.error('JSONのロードに失敗しました:', error);
            showStatus(`データの読み込みに失敗しました: ${error.message || error}. JSON出力の配置を確認してください。`, true);
        }
    }

    function loadRecordsArray(data) {
        const records = Array.isArray(data) ? data.slice() : data && typeof data === 'object' ? [data] : [];
        ensureLabelCoverage(records);
        state.records = records;
        duplicates.prepare();
        buildGallery();
    }

    function attachEventHandlers() {
        dom.gallery.addEventListener('click', (event) => {
            const duplicateButton = event.target.closest('.duplicate-toggle');
            if (duplicateButton) {
                event.preventDefault();
                handleDuplicateToggle(duplicateButton);
                return;
            }

            const button = event.target.closest('.review-button');
            if (!button) {
                return;
            }
            const effect = button.closest('.effect');
            if (!effect) {
                return;
            }
            const item = effect.closest('.item');
            const current = effect.dataset.status || 'pending';
            const targetValue = button.dataset.value || 'pass';
            const next = current === targetValue ? 'pending' : targetValue;
            updateEffectStatus(effect, next);
            const statusChanged = recordStatusChange(effect, next);
            if (next === 'pass') {
                const indexes = getEffectIndexes(effect);
                if (indexes) {
                    const correctionChanged = updateRecordCorrection(indexes.recordIndex, indexes.slotIndex, '');
                    effect.dataset.correction = '';
                    const input = effect.querySelector('.correction-input');
                    if (input) {
                        const replacement = createCorrectionInput('');
                        input.replaceWith(replacement);
                        replacement.addEventListener('change', correctionChangeHandler(effect, replacement));
                    }
                    if (!statusChanged && correctionChanged) {
                        storage.scheduleSave();
                    }
                }
            }
            refreshItemCaches(item);
            applyFilters();
        });

        if (dom.searchInput) {
            dom.searchInput.addEventListener('input', applyFilters);
        }
        if (dom.filterSelect) {
            dom.filterSelect.addEventListener('change', applyFilters);
        }
        if (dom.showDuplicatesToggle) {
            dom.showDuplicatesToggle.addEventListener('change', () => {
                buildGallery();
            });
        }
        if (dom.downloadCsvButton) {
            dom.downloadCsvButton.addEventListener('click', handleCsvExport);
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

    function handleCsvExport() {
        if (!state.records.length) {
            setStorageStatus('エクスポート可能なデータがありません。', true);
            return;
        }

        const csvText = generateCsv(state.records);
        if (!csvText) {
            setStorageStatus('エクスポート失敗: CSVを生成できませんでした。', true);
            return;
        }

        const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = csvFileName();
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setStorageStatus('CSVをダウンロードしました。', false);
    }

    function createDuplicateManager(getJsonPath) {
        const storagePrefix = 'relic-gallery-duplicates:';
        let cache = new Map();
        let loadedKey = '';
        let hasLoaded = false;

        function normalizeName(name) {
            return (name == null ? '' : String(name)).trim().toLowerCase();
        }

        function deriveBaseName() {
            const source = typeof getJsonPath === 'function' ? getJsonPath() : '';
            const text = source == null ? '' : String(source);
            if (!text) {
                return 'results.json';
            }
            const parts = text.split(/[\\/]/).filter(Boolean);
            if (!parts.length) {
                return text || 'results.json';
            }
            return parts[parts.length - 1];
        }

        function storageKey() {
            return `${storagePrefix}${deriveBaseName()}`;
        }

        function getStorage() {
            try {
                if (typeof window === 'undefined' || !window.localStorage) {
                    return null;
                }
                return window.localStorage;
            } catch (error) {
                console.warn('localStorageへのアクセスに失敗しました:', error);
                return null;
            }
        }

        function ensureLoaded() {
            const key = storageKey();
            if (hasLoaded && key === loadedKey) {
                return;
            }

            hasLoaded = true;
            loadedKey = key;
            cache = new Map();

            const storage = getStorage();
            if (!storage) {
                return;
            }

            try {
                const raw = storage.getItem(key);
                if (!raw) {
                    return;
                }
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    parsed.forEach((value) => {
                        if (typeof value === 'string' && value.trim()) {
                            const original = value.trim();
                            cache.set(normalizeName(original), original);
                        }
                    });
                }
            } catch (error) {
                console.warn('重複状態の読み込みに失敗しました:', error);
            }
        }

        function persist() {
            const storage = getStorage();
            if (!storage) {
                return;
            }
            const key = storageKey();
            try {
                const values = Array.from(cache.values()).sort((a, b) => a.localeCompare(b));
                storage.setItem(key, JSON.stringify(values));
            } catch (error) {
                console.warn('重複状態の保存に失敗しました:', error);
            }
        }

        function set(name, shouldMark) {
            if (!name) {
                return false;
            }
            ensureLoaded();
            const normalized = normalizeName(name);
            if (!normalized) {
                return false;
            }
            const original = (name == null ? '' : String(name)).trim();
            if (!original) {
                return false;
            }
            if (shouldMark) {
                const already = cache.has(normalized);
                cache.set(normalized, original);
                if (!already) {
                    persist();
                }
                return true;
            }
            const existed = cache.delete(normalized);
            if (existed) {
                persist();
            }
            return false;
        }

        function toggle(name) {
            if (!name) {
                return false;
            }
            ensureLoaded();
            const normalized = normalizeName(name);
            if (!normalized) {
                return false;
            }
            const original = (name == null ? '' : String(name)).trim();
            if (!original) {
                cache.delete(normalized);
                persist();
                return false;
            }
            if (cache.has(normalized)) {
                cache.delete(normalized);
                persist();
                return false;
            }
            cache.set(normalized, original);
            persist();
            return true;
        }

        function has(name) {
            if (!name) {
                return false;
            }
            ensureLoaded();
            return cache.has(normalizeName(name));
        }

        return {
            prepare: ensureLoaded,
            has,
            set,
            toggle
        };
    }

    function createOpfsManager(getData) {
        const opfsAvailable = Boolean(navigator.storage && navigator.storage.getDirectory);
        const localStorageAvailable = (() => {
            try {
                if (typeof window === 'undefined' || !window.localStorage) {
                    return false;
                }
                const testKey = '__relic_gallery_local_test__';
                window.localStorage.setItem(testKey, '1');
                window.localStorage.removeItem(testKey);
                return true;
            } catch (error) {
                console.warn('localStorageテストに失敗しました:', error);
                return false;
            }
        })();
        const LOCAL_STATE_PREFIX = 'relic-gallery-state:';
        const supported = opfsAvailable || localStorageAvailable;
        const state = {
            directoryPromise: null,
            fileHandle: null,
            fileName: '',
            saving: false,
            requeue: false,
            timer: null,
            mode: opfsAvailable ? 'opfs' : localStorageAvailable ? 'local' : 'none'
        };

        async function ensureDirectory() {
            if (!opfsAvailable) {
                throw new Error('OPFSはサポートされていません。');
            }
            if (!state.directoryPromise) {
                state.directoryPromise = navigator.storage.getDirectory();
            }
            return state.directoryPromise;
        }

        async function ensureHandle(name, create) {
            if (!opfsAvailable) {
                throw new Error('OPFSはサポートされていません。');
            }
            if (!name) {
                throw new Error('ファイル名が指定されていません。');
            }
            const directory = await ensureDirectory();
            return directory.getFileHandle(name, { create: Boolean(create) });
        }

        function localStorageKey(name) {
            const target = name || state.fileName || 'results.json';
            state.fileName = target;
            return `${LOCAL_STATE_PREFIX}${target}`;
        }

        async function tryLoad(defaultName) {
            if (!supported) {
                return null;
            }
            const targetName = state.fileName || defaultName;
            if (!targetName) {
                return null;
            }

            if (opfsAvailable) {
                try {
                    const handle = await ensureHandle(targetName, false);
                    const file = await handle.getFile();
                    const text = await file.text();
                    state.fileHandle = handle;
                    state.fileName = targetName;
                    return text;
                } catch (error) {
                    if (!(error && (error.name === 'NotFoundError' || error.code === 8))) {
                        throw error;
                    }
                }
            }

            if (localStorageAvailable) {
                try {
                    const raw = window.localStorage.getItem(localStorageKey(targetName));
                    if (raw) {
                        return raw;
                    }
                } catch (error) {
                    console.warn('ローカル保存の読み込みに失敗しました:', error);
                }
            }

            return null;
        }

        async function prepare(name) {
            if (!supported) {
                return;
            }
            const targetName = name || state.fileName || 'results.json';
            state.fileName = targetName;

            if (opfsAvailable) {
                const handle = await ensureHandle(targetName, true);
                state.fileHandle = handle;
            }
        }

        async function writeOnce() {
            if (!supported) {
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

            if (opfsAvailable && state.fileHandle) {
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
                        void writeOnce();
                    }
                }
                return;
            }

            if (localStorageAvailable) {
                try {
                    const key = localStorageKey();
                    window.localStorage.setItem(key, text);
                    setStorageStatus(`ローカル保存 ${new Date().toLocaleTimeString()}`, false);
                } catch (error) {
                    console.error('ローカル保存に失敗しました:', error);
                    setStorageStatus(`保存失敗: ${error.message || error}`, true);
                } finally {
                    state.saving = false;
                    if (state.requeue) {
                        state.requeue = false;
                        void writeOnce();
                    }
                }
                return;
            }

            state.saving = false;
        }

        function scheduleSave() {
            if (!supported) {
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
            usesOpfs: opfsAvailable,
            usesLocalBackup: !opfsAvailable && localStorageAvailable,
            get fileName() {
                return state.fileName;
            },
            async tryLoad(name) {
                try {
                    return await tryLoad(name);
                } catch (error) {
                    console.warn('データ読み込みに失敗しました:', error);
                    setStorageStatus(`読み込み失敗: ${error.message || error}`, true);
                    return null;
                }
            },
            async prepare(name) {
                try {
                    await prepare(name);
                } catch (error) {
                    console.warn('保存先初期化に失敗しました:', error);
                    setStorageStatus(`保存先初期化に失敗しました: ${error.message || error}`, true);
                }
            },
            scheduleSave,
            async flushNow() {
                if (!supported) {
                    return;
                }
                await writeOnce();
            }
        };
    }

    async function initialize() {
        attachEventHandlers();
        await ensureMasterOptions();
        await loadInitialData();
    }

    void initialize();
})();

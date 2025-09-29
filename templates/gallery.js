(() => {
    'use strict';

    const MASTER_DATALIST_ID = 'master-relic-options';
    const DUPLICATE_KEY = 'Duplicate';
    const FAVORITE_KEY = 'Favorite';
    const ITEM_COLOR_OPTIONS = [
        { key: 'red', label: '赤', className: 'item-color-red' },
        { key: 'yellow', label: '黄', className: 'item-color-yellow' },
        { key: 'green', label: '緑', className: 'item-color-green' },
        { key: 'blue', label: '青', className: 'item-color-blue' }
    ];

    const body = document.body;
    const {
        resultsCsv: initialCsvPath = '',
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
        colorFilter: document.getElementById('filter-color'),
        showDuplicatesToggle: document.getElementById('show-duplicates'),
        showOcrToggle: document.getElementById('show-ocr'),
        lightbox: document.getElementById('lightbox'),
        lightboxImg: document.querySelector('#lightbox img'),
        lightboxClose: document.getElementById('lightbox-close'),
        downloadCsvButton: document.getElementById('download-csv'),
        uploadCsvButton: document.getElementById('upload-csv'),
        uploadCsvInput: document.getElementById('upload-csv-input'),
        storageStatus: document.getElementById('storage-status'),
        summary: document.getElementById('gallery-summary')
    };

    if (!dom.gallery) {
        return;
    }

    const state = {
        records: [],
        items: [],
        labelSymbols: parseLabelSymbols(labelSymbolsJson),
        imageDir: imageDir || '.',
        csvPath: initialCsvPath,
        masterCsvPath: masterCsvPath || '',
        masterJsonPath: masterJsonPath || '',
        masterOptions: parseMasterOptions(masterOptionsJson),
        masterDatalistPrepared: false,
        showOcr: false
    };

    const duplicates = createDuplicateManager(() => state.csvPath);

    const storage = createOpfsManager(() => state.records);
    const SUMMARY_INLINE_STYLE = {
        textAlign: 'center',
        color: '#333',
        fontSize: '14px',
        margin: '0 auto 12px'
    };

    function ensureSummaryElement() {
        let summary = dom.summary;

        if (!summary || !summary.isConnected) {
            const existing = document.getElementById('gallery-summary');
            if (existing && existing !== dom.summary) {
                summary = existing;
            } else if (!summary || !summary.isConnected) {
                summary = document.createElement('p');
            }
        }

        if (!summary) {
            summary = document.createElement('p');
        }

        summary.id = summary.id || 'gallery-summary';
        summary.classList.add('gallery-summary');

        summary.style.textAlign = SUMMARY_INLINE_STYLE.textAlign;
        summary.style.color = SUMMARY_INLINE_STYLE.color;
        summary.style.fontSize = SUMMARY_INLINE_STYLE.fontSize;
        summary.style.margin = SUMMARY_INLINE_STYLE.margin;
        summary.style.width = '100%';

        if (!summary.parentNode) {
            const reference = dom.galleryStatus && dom.galleryStatus.parentNode ? dom.galleryStatus : dom.gallery;
            if (reference && reference.parentNode) {
                reference.parentNode.insertBefore(summary, reference);
            } else {
                document.body.insertBefore(summary, document.body.firstChild || null);
            }
        }

        dom.summary = summary;
        return summary;
    }

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

    function updateSummary() {
        const summary = ensureSummaryElement();
        if (!summary) {
            return;
        }
        const items = state.items || [];
        const totalCount = items.length;
        let fullyConfirmedCount = 0;
        let pendingCount = 0;

        items.forEach((item) => {
            if (!item) {
                return;
            }
            const effects = Array.from(item.querySelectorAll('.effect'));
            if (!effects.length) {
                pendingCount += 1;
                return;
            }
            const slotStatuses = new Map();
            let hasPending = false;
            effects.forEach((effect) => {
                const status = normalizeStatus(effect.dataset.status);
                if (status === 'pending') {
                    hasPending = true;
                }
                const slot = Number(effect.dataset.slot);
                if (!Number.isNaN(slot)) {
                    slotStatuses.set(slot, status);
                }
            });
            if (hasPending) {
                pendingCount += 1;
            }
            const targetSlots = [1, 2, 3];
            const allSlotsPresent = targetSlots.every((slot) => slotStatuses.has(slot));
            if (allSlotsPresent) {
                const allReviewed = targetSlots.every((slot) => {
                    const status = slotStatuses.get(slot);
                    return status && status !== 'pending';
                });
                if (allReviewed) {
                    fullyConfirmedCount += 1;
                }
            }
        });

        const summaryText = `全体 ${totalCount} 件 / 確認済み ${fullyConfirmedCount} 件 / 未レビュー ${pendingCount} 件`;
        summary.textContent = summaryText;
        summary.style.display = 'flex';
        summary.style.justifyContent = 'center';
        summary.style.textAlign = 'center';
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
            .map((entry) => {
                if (entry == null) {
                    return '';
                }
                if (typeof entry === 'object') {
                    const raw =
                        entry.EffectBase || entry.effect || entry.name || entry.value || '';
                    return typeof raw === 'string' ? raw.trim() : '';
                }
                return String(entry).trim();
            })
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
        const baseName = storage.fileName || getFileName(state.csvPath) || 'results.csv';
        const converted = baseName.replace(/\.csv$/i, '_review.csv');
        if (converted !== baseName) {
            return converted;
        }
        if (!baseName) {
            return 'results_review.csv';
        }
        return `${baseName.replace(/\.csv$/i, '')}_review.csv`;
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
            return '確認済み';
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

    function ocrToggleState() {
        return Boolean(dom.showOcrToggle && dom.showOcrToggle.checked);
    }

    function setOcrVisibility(show) {
        state.showOcr = Boolean(show);
        if (dom.showOcrToggle) {
            dom.showOcrToggle.checked = state.showOcr;
        }
        if (!dom.gallery) {
            return;
        }
        dom.gallery.querySelectorAll('.raw').forEach((element) => {
            element.style.display = state.showOcr ? '' : 'none';
        });
    }

    function buildGallery() {
        const includeDuplicates = includeDuplicatesNow();
        dom.gallery.textContent = '';
        state.items = [];

        const fragment = document.createDocumentFragment();

        const visibleTotal = state.records.reduce((count, currentRecord) => {
            if (!currentRecord || typeof currentRecord !== 'object') {
                return count;
            }
            return isRecordDuplicate(currentRecord) ? count : count + 1;
        }, 0);
        let visibleCounter = 0;

        state.records.forEach((record, index) => {
            const duplicateRecord = isRecordDuplicate(record);
            if (!duplicateRecord) {
                visibleCounter += 1;
            }
            if (duplicateRecord && !includeDuplicates) {
                return;
            }
            const effectiveIndex = duplicateRecord ? (visibleCounter > 0 ? visibleCounter : 0) : visibleCounter;
            const item = createItem(record, index, effectiveIndex, visibleTotal);
            if (item) {
                fragment.appendChild(item);
                state.items.push(item);
            }
        });

        if (fragment.childNodes.length) {
            dom.gallery.appendChild(fragment);
        }

        updateSummary();
        setOcrVisibility(ocrToggleState());

        if (!state.items.length) {
            showStatus('表示できる結果がありません。', false);
            return;
        }
        clearStatus();
        applyFilters();
    }

    function createItem(record, recordIndex, visibleIndex, visibleTotal) {
        if (!record || typeof record !== 'object') {
            return null;
        }
        const imageName = record.Image == null ? '' : String(record.Image);
        const item = document.createElement('div');
        item.className = 'item';
        item.dataset.image = imageName.toLowerCase();
        item.dataset.imageName = imageName;
        item.dataset.recordIndex = String(recordIndex);

        const leftColumn = createElement('div', 'item-left');
        const rightColumn = createElement('div', 'item-right');
        item.appendChild(leftColumn);
        item.appendChild(rightColumn);

        const imagePath = joinPath(state.imageDir, imageName);
        const img = createElement('img');
        img.src = imagePath;
        img.alt = imageName;
        img.dataset.full = imagePath;
        img.tabIndex = 0;
        leftColumn.appendChild(img);

        const controls = createElement('div', 'item-controls');
        const duplicateButton = createElement('button', 'duplicate-toggle');
        duplicateButton.type = 'button';
        duplicateButton.dataset.image = imageName;
        duplicateButton.dataset.action = 'toggle-duplicate';
        duplicateButton.setAttribute('aria-pressed', 'false');
        controls.appendChild(duplicateButton);

        const favoriteButton = createElement('button', 'favorite-toggle', 'お気に入り');
        favoriteButton.type = 'button';
        favoriteButton.dataset.image = imageName;
        favoriteButton.dataset.action = 'toggle-favorite';
        favoriteButton.setAttribute('aria-pressed', 'false');
        controls.appendChild(favoriteButton);

        const colorControls = createElement('div', 'item-color-controls');
        const colorLabel = createElement('label', 'item-color-label', '色');
        colorLabel.setAttribute('for', `item-color-${recordIndex}`);
        const colorSelect = createElement('select', 'item-color-select');
        colorSelect.id = `item-color-${recordIndex}`;
        colorSelect.dataset.action = 'set-item-color';
        colorSelect.dataset.recordIndex = String(recordIndex);
        const emptyOption = createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = 'なし';
        colorSelect.appendChild(emptyOption);
        ITEM_COLOR_OPTIONS.forEach((option) => {
            const colorOption = createElement('option');
            colorOption.value = option.key;
            colorOption.textContent = option.label;
            colorSelect.appendChild(colorOption);
        });
        colorControls.appendChild(colorLabel);
        colorControls.appendChild(colorSelect);
        controls.appendChild(colorControls);

        const metaInfo = createElement('div', 'item-meta');
        if (visibleTotal > 0) {
            let displayIndex = visibleIndex;
            if (displayIndex <= 0) {
                displayIndex = 1;
            } else if (displayIndex > visibleTotal) {
                displayIndex = visibleTotal;
            }
            metaInfo.appendChild(createElement('span', 'item-position', `${displayIndex} / ${visibleTotal}`));
        } else {
            metaInfo.appendChild(createElement('span', 'item-position', '- / 0'));
        }

        const filename = createElement('span', 'filename', imageName);
        filename.setAttribute('title', imageName);
        metaInfo.appendChild(filename);

        controls.appendChild(metaInfo);
        leftColumn.appendChild(controls);
        bindImage(img);

        let hasEffect = false;
        state.labelSymbols.forEach((symbol, index) => {
            const effect = createEffect(record, index + 1, symbol || `Slot ${index + 1}`, imageName, recordIndex);
            if (effect) {
                rightColumn.appendChild(effect);
                hasEffect = true;
            }
        });

        if (!hasEffect) {
            const placeholder = document.createElement('p');
            placeholder.className = 'no-effect';
            placeholder.textContent = '効果情報がありません。';
            rightColumn.appendChild(placeholder);
        }

        syncDuplicateState(item);
        syncFavoriteState(item);
        syncItemColorState(item);
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

    function normalizeFavoriteFlag(value) {
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
            return text === 'true' || text === '1' || text === 'yes' || text === 'favorite';
        }
        return false;
    }

    function isRecordFavorite(record) {
        if (!record || typeof record !== 'object') {
            return false;
        }
        return normalizeFavoriteFlag(record[FAVORITE_KEY]);
    }

    function setRecordFavorite(recordIndex, isFavorite) {
        if (Number.isNaN(recordIndex)) {
            return false;
        }
        const record = state.records[recordIndex];
        if (!record || typeof record !== 'object') {
            return false;
        }
        if (isFavorite) {
            if (normalizeFavoriteFlag(record[FAVORITE_KEY])) {
                return false;
            }
            record[FAVORITE_KEY] = true;
            return true;
        }
        if (Object.prototype.hasOwnProperty.call(record, FAVORITE_KEY)) {
            delete record[FAVORITE_KEY];
            return true;
        }
        return false;
    }

    function normalizeItemColor(value) {
        const text = (value || '').toString().trim().toLowerCase();
        const option = ITEM_COLOR_OPTIONS.find((entry) => entry.key === text);
        return option ? option.key : '';
    }

    function setRecordItemColor(recordIndex, colorKey) {
        if (Number.isNaN(recordIndex)) {
            return false;
        }
        const record = state.records[recordIndex];
        if (!record || typeof record !== 'object') {
            return false;
        }
        const normalized = normalizeItemColor(colorKey);
        if (normalized) {
            if (record.ItemColor === normalized) {
                return false;
            }
            record.ItemColor = normalized;
            return true;
        }
        if (Object.prototype.hasOwnProperty.call(record, 'ItemColor')) {
            delete record.ItemColor;
            return true;
        }
        return false;
    }

    function applyItemColor(item, colorKey) {
        if (!item) {
            return;
        }
        const normalized = normalizeItemColor(colorKey);
        ITEM_COLOR_OPTIONS.forEach((entry) => {
            item.classList.remove(entry.className);
        });
        if (normalized) {
            const option = ITEM_COLOR_OPTIONS.find((entry) => entry.key === normalized);
            if (option) {
                item.classList.add(option.className);
            }
            item.dataset.itemColor = normalized;
        } else {
            delete item.dataset.itemColor;
        }
        const select = item.querySelector('.item-color-select');
        if (select) {
            const value = normalized || '';
            select.value = value;
            select.classList.remove('option-red', 'option-yellow', 'option-green', 'option-blue', 'option-none');
            select.classList.add(value ? `option-${value}` : 'option-none');
        }
    }

    function syncItemColorState(item) {
        if (!item) {
            return;
        }
        const recordIndex = Number(item.dataset.recordIndex);
        const record = Number.isNaN(recordIndex) ? null : state.records[recordIndex];
        const colorKey = record && typeof record === 'object' ? record.ItemColor : '';
        applyItemColor(item, colorKey);
    }

    function updateFavoriteVisuals(item, isFavorite) {
        if (!item) {
            return;
        }
        const button = item.querySelector('.favorite-toggle');
        const active = Boolean(isFavorite);
        item.dataset.favorite = active ? 'true' : 'false';
        item.classList.toggle('is-favorite', active);
        if (button) {
            button.textContent = active ? '★ お気に入り' : '☆ お気に入り';
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', active ? 'true' : 'false');
        }
    }

    function syncFavoriteState(item) {
        if (!item) {
            return;
        }
        const recordIndex = Number(item.dataset.recordIndex);
        const record = Number.isNaN(recordIndex) ? null : state.records[recordIndex];
        const isFavorite = isRecordFavorite(record);
        updateFavoriteVisuals(item, isFavorite);
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
        const effectStates = [];
        item.querySelectorAll('.effect').forEach((effect) => {
            const status = effect.dataset.status || 'pending';
            effectStates.push(status);
        });
        item.dataset.effectStates = effectStates.join(',');
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
        const scoreDisplay = hasFiniteScore ? `${numericScore.toFixed(1)}%` : '--';
        const ocrDisplay = rawText || '--';

        const predictionLine = createElement('div', 'prediction', `推定: ${predictionText}`);
        const rawLine = createElement('div', 'raw', `OCR: ${ocrDisplay} / 一致度 ${scoreDisplay}`);

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

        const statusIndicator = createElement('span', 'status-indicator');
        const correctionInput = createCorrectionInput(correctionValue);

        decisionRow.appendChild(passButton);
        decisionRow.appendChild(statusIndicator);
        decisionRow.appendChild(correctionInput);
        decision.appendChild(decisionRow);

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
        const colorFilter = dom.colorFilter ? dom.colorFilter.value : 'all';
        const includePending = filter === 'with-pending';
        const resolvedOnly = filter === 'resolved';
        const favoriteOnly = filter === 'favorite';
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

            let matchesFilter = true;

if (filter !== 'all') {
    const statuses = item.dataset.statusCache || '';
    if (resolvedOnly) {
        const effectStates = (item.dataset.effectStates || '').split(',').filter(Boolean);
        matchesFilter = effectStates.length >= 3 && effectStates.every((stateValue, idx) => {
            if (idx < 3) {
                return stateValue === 'pass' || stateValue === 'corrected';
            }
            return true;
        });
    } else if (includePending) {
        matchesFilter = statuses.includes('|pending|');
    } else if (favoriteOnly) {
        matchesFilter = item.dataset.favorite === 'true';
    }
}

if (matchesFilter && colorFilter !== 'all') {
    const itemColor = normalizeItemColor(item.dataset.itemColor || '');
    if (colorFilter === 'none') {
        matchesFilter = itemColor === '';
    } else {
        matchesFilter = itemColor === colorFilter;
    }
}

item.style.display = matchesSearch && matchesFilter ? '' : 'none';
        });
        updateSummary();
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

    function handleFavoriteToggle(button) {
        if (!button) {
            return;
        }
        const item = button.closest('.item');
        if (!item) {
            return;
        }
        const recordIndex = Number(item.dataset.recordIndex);
        const record = Number.isNaN(recordIndex) ? null : state.records[recordIndex];
        const nextState = !isRecordFavorite(record);
        const recordChanged = setRecordFavorite(recordIndex, nextState);
        updateFavoriteVisuals(item, nextState);
        if (recordChanged) {
            storage.scheduleSave();
        }
        applyFilters();
    }

    function handleItemColorToggle(button) {
        if (!button) {
            return;
        }
        const item = button.closest('.item');
        if (!item) {
            return;
        }
        const recordIndex = Number(item.dataset.recordIndex);
        const record = Number.isNaN(recordIndex) ? null : state.records[recordIndex];
        const targetColor = (button.value || '').trim().toLowerCase();
        const currentColor = record && typeof record === 'object' ? normalizeItemColor(record.ItemColor) : '';
        const nextColor = currentColor === targetColor ? '' : targetColor;
        const recordChanged = setRecordItemColor(recordIndex, nextColor);
        if (recordChanged) {
            storage.scheduleSave();
        }
        applyItemColor(item, nextColor);
        applyFilters();
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

    function parseCsvRows(text) {
        const rows = [];
        if (!text) {
            return rows;
        }
        const sanitized = String(text).replace(/^\uFEFF/, '');
        const normalized = sanitized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        let field = '';
        let row = [];
        let inQuotes = false;

        for (let index = 0; index < normalized.length; index += 1) {
            const char = normalized[index];
            if (inQuotes) {
                if (char === '"') {
                    const nextChar = normalized[index + 1];
                    if (nextChar === '"') {
                        field += '"';
                        index += 1;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    field += char;
                }
                continue;
            }

            if (char === '"') {
                inQuotes = true;
                continue;
            }

            if (char === ',') {
                row.push(field);
                field = '';
                continue;
            }

            if (char === '\n') {
                row.push(field);
                rows.push(row);
                row = [];
                field = '';
                continue;
            }

            field += char;
        }

        if (inQuotes) {
            row.push(field);
            rows.push(row);
        } else if (field !== '' || row.length) {
            row.push(field);
            rows.push(row);
        }

        return rows;
    }

    function parseCsvRecords(text) {
        const rows = parseCsvRows(text);
        if (!rows.length) {
            return [];
        }

        const headers = rows[0].map((header) => {
            if (header == null) {
                return '';
            }
            return String(header).trim();
        });

        const records = [];
        for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
            const cells = rows[rowIndex];
            if (!cells || cells.every((cell) => {
                const value = cell == null ? '' : String(cell).trim();
                return value === '';
            })) {
                continue;
            }

            const record = {};
            headers.forEach((header, columnIndex) => {
                if (!header) {
                    return;
                }
                const value = columnIndex < cells.length ? cells[columnIndex] : '';
                record[header] = value == null ? '' : value;
            });
            records.push(record);
        }

        return records;
    }

    async function handleCsvImportFile(file) {
        if (!file) {
            return;
        }
        const loadingMessage = 'CSVを読み込み中...';
        showStatus(loadingMessage, false);

        try {
            const text = typeof file.text === 'function' ? await file.text() : await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result || '');
                reader.onerror = () => reject(reader.error || new Error('読み込みに失敗しました'));
                reader.readAsText(file, 'utf-8');
            });

            const records = parseCsvRecords(text);
            if (!records.length) {
                showStatus('CSVに有効なデータがありません。', true);
                return;
            }

            const nextName = (file.name && file.name.trim()) || 'import.csv';
            state.csvPath = nextName;
            loadRecordsArray(records);

            if (storage.supported) {
                await storage.prepare(nextName);
                await storage.flushNow();
                setStorageStatus(`CSVをインポートしブラウザに保存しました (${new Date().toLocaleTimeString()})`, false);
            } else {
                setStorageStatus('ブラウザ保存に対応していません。必要に応じてCSVをダウンロードしてください。', true);
            }

            clearStatus();
        } catch (error) {
            console.error('CSVのインポートに失敗しました:', error);
            showStatus(`CSVのインポートに失敗しました: ${error.message || error}`, true);
        } finally {
            if (dom.uploadCsvInput) {
                dom.uploadCsvInput.value = '';
            }
        }
    }

    async function loadInitialData() {
        const preferredName = getFileName(state.csvPath) || 'results.csv';

        try {
            const text = await storage.tryLoad(preferredName);
            if (text) {
                loadRecordsArray(JSON.parse(text));
                clearStatus();
                setStorageStatus('ブラウザから読み込みました。', false);
                return;
            }
        } catch (error) {
            console.warn('ブラウザからの読み込みに失敗しました:', error);
        }

        if (!state.csvPath) {
            showStatus('CSVファイルのパスが指定されていません。', true);
            return;
        }

        try {
            showStatus('読み込み中...', false);
            const response = await fetch(state.csvPath, { cache: 'no-cache' });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const csvText = await response.text();
            const records = parseCsvRecords(csvText);
            loadRecordsArray(records);
            clearStatus();
            if (storage.supported) {
                await storage.prepare(preferredName);
                await storage.flushNow();
            }
        } catch (error) {
            console.error('CSVのロードに失敗しました:', error);
            showStatus(`データの読み込みに失敗しました: ${error.message || error}. CSV出力の配置を確認してください。`, true);
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

            const favoriteButton = event.target.closest('.favorite-toggle');
            if (favoriteButton) {
                event.preventDefault();
                handleFavoriteToggle(favoriteButton);
                return;
            }

            const colorSelect = event.target.closest('.item-color-select');
            if (colorSelect) {
                event.preventDefault();
                handleItemColorToggle(colorSelect);
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
        if (dom.colorFilter) {
            dom.colorFilter.addEventListener('change', applyFilters);
        }
        if (dom.showDuplicatesToggle) {
            dom.showDuplicatesToggle.addEventListener('change', () => {
                buildGallery();
            });
        }
        if (dom.showOcrToggle) {
            dom.showOcrToggle.addEventListener('change', () => {
                setOcrVisibility(ocrToggleState());
            });
        }
        if (dom.downloadCsvButton) {
            dom.downloadCsvButton.addEventListener('click', handleCsvExport);
        }
        if (dom.uploadCsvButton && dom.uploadCsvInput) {
            dom.uploadCsvButton.addEventListener('click', () => {
                dom.uploadCsvInput.value = '';
                dom.uploadCsvInput.click();
            });
            dom.uploadCsvInput.addEventListener('change', () => {
                const files = dom.uploadCsvInput.files || [];
                const file = files.length ? files[0] : null;
                if (file) {
                    void handleCsvImportFile(file);
                }
            });
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

    function createDuplicateManager(getResultsPath) {
        const storagePrefix = 'relic-gallery-duplicates:';
        let cache = new Map();
        let loadedKey = '';
        let hasLoaded = false;

        function normalizeName(name) {
            return (name == null ? '' : String(name)).trim().toLowerCase();
        }

        function deriveBaseName() {
            const source = typeof getResultsPath === 'function' ? getResultsPath() : '';
            const text = source == null ? '' : String(source);
            if (!text) {
                return 'results.csv';
            }
            const parts = text.split(/[\\/]/).filter(Boolean);
            if (!parts.length) {
                return text || 'results.csv';
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
            const target = name || state.fileName || 'results.csv';
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
            const targetName = name || state.fileName || 'results.csv';
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
                console.error('データのシリアライズに失敗しました:', error);
                setStorageStatus('保存失敗: データのシリアライズに失敗しました。', true);
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
                    setStorageStatus(`ブラウザに保存済み ${new Date().toLocaleTimeString()}`, false);
                } catch (error) {
                    console.error('ブラウザへの書き込みに失敗しました:', error);
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

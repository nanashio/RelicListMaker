(() => {
    'use strict';

    const DUPLICATE_KEY = 'Duplicate';
    const FAVORITE_KEY = 'Favorite';
    const ITEM_COLOR_KEY = 'ItemColor';
    const MASTER_DATALIST_ID = 'master-relic-options';
    const SAVE_ENDPOINT = '/__viewer_api__/save';
    const SAVE_DEBOUNCE_MS = 300;

    const ITEM_COLORS = [
        { key: '', label: 'なし' },
        { key: 'red', label: '赤', className: 'item-color-red' },
        { key: 'yellow', label: '黄', className: 'item-color-yellow' },
        { key: 'green', label: '緑', className: 'item-color-green' },
        { key: 'blue', label: '青', className: 'item-color-blue' }
    ];

    const dom = {
        body: document.body,
        gallery: document.getElementById('gallery'),
        datasetSelector: document.getElementById('dataset-selector'),
        datasetSelect: document.getElementById('dataset-select'),
        galleryStatus: document.getElementById('gallery-status'),
        gallerySummary: document.getElementById('gallery-summary'),
        searchInput: document.getElementById('search-input'),
        filterSelect: document.getElementById('filter-status'),
        colorFilter: document.getElementById('filter-color'),
        showDuplicates: document.getElementById('show-duplicates'),
        showOcr: document.getElementById('show-ocr'),
        downloadButton: document.getElementById('download-csv'),
        uploadButton: document.getElementById('upload-csv'),
        uploadInput: document.getElementById('upload-csv-input'),
        storageStatus: document.getElementById('storage-status'),
        lightbox: document.getElementById('lightbox'),
        lightboxImage: document.querySelector('#lightbox img'),
        lightboxClose: document.getElementById('lightbox-close'),
        masterDatalist: document.getElementById(MASTER_DATALIST_ID)
    };

    if (!dom.body || !dom.gallery) {
        return;
    }

    const config = parseConfig(dom.body.dataset || {});

    class GalleryApp {
        constructor(rootDom, options) {
            this.dom = rootDom;
            this.options = options;
            this.records = [];
            this.items = [];
            this.headers = [];
            this.labelSymbols = options.labelSymbols.slice();
            this.masterOptions = options.masterOptions.slice();
            this.masterLevels = new Map(options.masterLevels);
            this.datasets = options.datasets;
            this.activeDatasetIndex = options.activeDatasetIndex;
            this.currentDataset = null;
            this.imageDir = options.imageDir;
            this.csvPath = options.csvPath;
            this.datasetLabel = '';
            this.datasetKind = '';
            this.datasetReadOnly = false;
            this.saveTimer = null;
            this.lastSavedAt = null;
            this.showOcr = false;
        }

        async init() {
            this.setupDatasetSelector();
            this.attachEvents();
            await this.prepareMasterData();
            if (this.dom.uploadButton) {
                this.dom.uploadButton.disabled = true;
                this.dom.uploadButton.title = 'ローカルCSVのインポートは無効化されています';
            }
            if (this.dom.uploadInput) {
                this.dom.uploadInput.disabled = true;
            }
            await this.loadInitialDataset();
            this.updateOcrVisibility(Boolean(this.dom.showOcr && this.dom.showOcr.checked));
        }

        async prepareMasterData() {
            if (this.masterOptions.length && !this.dom.masterDatalist) {
                const datalist = document.createElement('datalist');
                datalist.id = MASTER_DATALIST_ID;
                document.body.appendChild(datalist);
                this.dom.masterDatalist = datalist;
            }
            if (this.dom.masterDatalist) {
                this.dom.masterDatalist.innerHTML = '';
                this.masterOptions.forEach((option) => {
                    const item = document.createElement('option');
                    item.value = option;
                    this.dom.masterDatalist.appendChild(item);
                });
            }

            if (!this.masterLevels.size && this.options.masterCsv) {
                try {
                    const response = await fetch(this.options.masterCsv, { cache: 'no-cache' });
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    const text = await response.text();
                    this.masterLevels = parseMasterLevelsCsv(text);
                } catch (error) {
                    console.warn('マスターレベルの取得に失敗しました:', error);
                }
            }
        }

        setupDatasetSelector() {
            const { datasetSelector, datasetSelect } = this.dom;
            if (!datasetSelector || !datasetSelect) {
                return;
            }
            datasetSelect.innerHTML = '';
            if (!this.datasets.length) {
                datasetSelector.classList.add('hidden');
                return;
            }
            this.datasets.forEach((dataset, index) => {
                const option = document.createElement('option');
                option.value = String(index);
                option.textContent = datasetLabel(dataset, index);
                datasetSelect.appendChild(option);
            });
            datasetSelector.classList.remove('hidden');
            const clamped = clampIndex(this.activeDatasetIndex, this.datasets.length);
            datasetSelect.value = String(clamped);
        }

        attachEvents() {
            const { datasetSelect, gallery, searchInput, filterSelect, colorFilter, showDuplicates, showOcr, downloadButton } = this.dom;
            if (datasetSelect) {
                datasetSelect.addEventListener('change', (event) => {
                    const index = Number.parseInt(event.target.value, 10);
                    void this.switchDataset(Number.isNaN(index) ? 0 : index);
                });
            }
            if (gallery) {
                gallery.addEventListener('click', (event) => this.handleGalleryClick(event));
                gallery.addEventListener('input', (event) => this.handleGalleryInput(event));
            }
            if (searchInput) {
                searchInput.addEventListener('input', () => this.applyFilters());
            }
            if (filterSelect) {
                filterSelect.addEventListener('change', () => this.applyFilters());
            }
            if (colorFilter) {
                colorFilter.addEventListener('change', () => this.applyFilters());
            }
            if (showDuplicates) {
                showDuplicates.addEventListener('change', () => this.renderRecords());
            }
            if (showOcr) {
                showOcr.addEventListener('change', () => this.updateOcrVisibility(showOcr.checked));
            }
            if (downloadButton) {
                downloadButton.addEventListener('click', () => this.downloadCsv());
            }
            if (this.dom.lightboxClose) {
                this.dom.lightboxClose.addEventListener('click', () => this.closeLightbox());
            }
            if (this.dom.lightbox) {
                this.dom.lightbox.addEventListener('click', (event) => {
                    if (event.target === this.dom.lightbox) {
                        this.closeLightbox();
                    }
                });
            }
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    this.closeLightbox();
                }
            });
        }

        async loadInitialDataset() {
            if (this.datasets.length) {
                await this.switchDataset(this.activeDatasetIndex, true);
            } else {
                await this.loadDataset({
                    label: this.options.datasetLabel,
                    csvPath: this.csvPath,
                    imageDir: this.imageDir,
                    kind: 'single',
                    readOnly: false
                });
            }
        }

        async switchDataset(index, force = false) {
            const clamped = clampIndex(index, this.datasets.length);
            const dataset = this.datasets[clamped];
            if (!dataset) {
                return;
            }
            if (!force && this.currentDataset === dataset) {
                this.updateDatasetIndicator(clamped);
                return;
            }
            this.activeDatasetIndex = clamped;
            await this.loadDataset(dataset);
            this.updateDatasetIndicator(clamped);
        }

        updateDatasetIndicator(index) {
            const { datasetSelect } = this.dom;
            if (!datasetSelect) {
                return;
            }
            datasetSelect.value = String(index);
        }

        async loadDataset(dataset) {
            this.currentDataset = dataset;
            this.imageDir = dataset.imageDir || this.options.imageDir || '.';
            this.csvPath = dataset.csvPath || this.options.csvPath || '';
            this.datasetLabel = dataset.label || '';
            this.datasetKind = dataset.kind || 'single';
            this.datasetReadOnly = Boolean(dataset.readOnly || this.datasetKind === 'merged');
            this.setStorageMessage(this.datasetReadOnly ? '統合ビューは読み取り専用です。' : '変更は自動で保存されます。', false);

            try {
                this.showStatus('読み込み中...');
                const loadResult = await this.fetchRecords(dataset);
                this.labelSymbols = ensureLabelSymbols(this.labelSymbols, loadResult.records);
                this.records = loadResult.records.map((row, rowIndex) =>
                    createRecordModel(row, {
                        index: rowIndex,
                        labelSymbols: this.labelSymbols,
                        imageDir: this.imageDir,
                        datasetLabel: this.datasetLabel,
                        datasetKind: this.datasetKind
                    })
                );
                this.headers = mergeHeaders(loadResult.headers, collectRecordHeaders(this.records));
                this.renderRecords();
                this.showStatus('');
            } catch (error) {
                console.error(error);
                this.showStatus(`データの読み込みに失敗しました: ${error.message || error}`, true);
            }
        }

        async fetchRecords(dataset) {
            if (dataset.kind === 'merged' && Array.isArray(dataset.sources) && dataset.sources.length) {
                const combined = [];
                const mergedHeaders = [];
                for (let index = 0; index < dataset.sources.length; index += 1) {
                    const source = dataset.sources[index];
                    if (!source || typeof source !== 'object') {
                        continue;
                    }
                    const csvPath = source.csv || '';
                    if (!csvPath) {
                        continue;
                    }
                    const response = await fetch(csvPath, { cache: 'no-cache' });
                    if (!response.ok) {
                        throw new Error(`${csvPath}: HTTP ${response.status}`);
                    }
                    const text = await response.text();
                    const parsed = parseCsv(text);
                    parsed.records.forEach((row) => {
                        row.Dataset = source.label || dataset.label || `Dataset ${index + 1}`;
                        row.DatasetFolder = source.folder || '';
                        if (source.imgDir) {
                            const rawImage = row.Image || '';
                            if (rawImage && !/[\\/]/.test(rawImage)) {
                                row.Image = joinPath(source.imgDir, rawImage);
                            }
                        }
                        combined.push(row);
                    });
                    mergedHeaders.push(...parsed.headers);
                }
                return { records: combined, headers: mergedHeaders };
            }

            if (!dataset.csvPath) {
                throw new Error('CSVパスが設定されていません。');
            }
            const response = await fetch(dataset.csvPath, { cache: 'no-cache' });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const text = await response.text();
            return parseCsv(text);
        }

        renderRecords() {
            const { gallery } = this.dom;
            gallery.innerHTML = '';
            this.items = [];

            const includeDuplicates = Boolean(this.dom.showDuplicates && this.dom.showDuplicates.checked);
            const fragment = document.createDocumentFragment();

            const visibleRecords = includeDuplicates
                ? this.records
                : this.records.filter((record) => !record.duplicate);

            visibleRecords.forEach((record, index) => {
                const element = this.buildItem(record, index, visibleRecords.length);
                if (element) {
                    fragment.appendChild(element);
                    this.items.push({ element, record });
                }
            });

            if (!fragment.childNodes.length) {
                const message = document.createElement('p');
                message.className = 'no-result';
                message.textContent = '表示できる項目がありません。';
                gallery.appendChild(message);
            } else {
                gallery.appendChild(fragment);
            }

            this.applyFilters();
        }

        buildItem(record, index, total) {
            const item = document.createElement('section');
            item.className = 'item';
            item.dataset.index = String(record.index);
            item.dataset.duplicate = record.duplicate ? 'true' : 'false';
            item.dataset.favorite = record.favorite ? 'true' : 'false';
            if (record.itemColor) {
                item.dataset.itemColor = record.itemColor;
                item.classList.add(colorClass(record.itemColor));
            }

            const left = document.createElement('div');
            left.className = 'item-left';
            const right = document.createElement('div');
            right.className = 'item-right';
            item.append(left, right);

            const image = document.createElement('img');
            image.src = record.imagePath;
            image.alt = record.displayName;
            image.dataset.full = record.imagePath;
            image.addEventListener('click', () => this.openLightbox(record.imagePath));
            left.appendChild(image);

            const controls = document.createElement('div');
            controls.className = 'item-controls';
            left.appendChild(controls);

            if (!this.datasetReadOnly) {
                controls.appendChild(this.buildDuplicateButton(record));
                controls.appendChild(this.buildFavoriteButton(record));
                controls.appendChild(this.buildColorSelect(record));
            }

            const meta = document.createElement('div');
            meta.className = 'item-meta';
            meta.appendChild(createTextSpan('item-position', `${index + 1} / ${total}`));
            if (record.datasetLabel && this.datasetKind === 'merged') {
                const badge = createTextSpan('dataset-label', record.datasetLabel);
                badge.title = record.datasetFolder ? `${record.datasetLabel} (${record.datasetFolder})` : record.datasetLabel;
                meta.appendChild(badge);
            }
            meta.appendChild(createTextSpan('filename', record.displayName));
            controls.appendChild(meta);

            if (!record.effects.length) {
                const empty = document.createElement('p');
                empty.className = 'no-effect';
                empty.textContent = '効果情報がありません。';
                right.appendChild(empty);
            } else {
                record.effects.forEach((effect) => {
                    const effectNode = this.buildEffect(record, effect);
                    if (effectNode) {
                        right.appendChild(effectNode);
                    }
                });
            }

            updateSearchCache(item, record);
            return item;
        }

        buildDuplicateButton(record) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'duplicate-toggle';
            button.dataset.action = 'toggle-duplicate';
            button.textContent = record.duplicate ? '重複を解除' : '重複として隠す';
            button.setAttribute('aria-pressed', record.duplicate ? 'true' : 'false');
            return button;
        }

        buildFavoriteButton(record) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'favorite-toggle';
            button.dataset.action = 'toggle-favorite';
            button.textContent = record.favorite ? '★ お気に入り' : '☆ お気に入り';
            button.setAttribute('aria-pressed', record.favorite ? 'true' : 'false');
            return button;
        }

        buildColorSelect(record) {
            const wrapper = document.createElement('label');
            wrapper.className = 'item-color-controls';
            wrapper.textContent = '色';

            const select = document.createElement('select');
            select.className = 'item-color-select';
            select.dataset.action = 'set-item-color';
            select.value = record.itemColor;
            ITEM_COLORS.forEach((option) => {
                const node = document.createElement('option');
                node.value = option.key;
                node.textContent = option.label;
                select.appendChild(node);
            });
            select.value = record.itemColor;
            wrapper.appendChild(select);
            return wrapper;
        }

        buildEffect(record, effect) {
            const wrapper = document.createElement('article');
            wrapper.className = 'effect';
            wrapper.dataset.slot = String(effect.slot);
            wrapper.dataset.recordIndex = String(record.index);
            wrapper.dataset.status = effect.status;

            const header = document.createElement('header');
            header.className = 'effect-header';
            header.appendChild(createTextSpan('effect-symbol', effect.symbol));
            header.appendChild(createTextSpan('status-indicator', statusLabel(effect.status)));
            wrapper.appendChild(header);

            const prediction = document.createElement('div');
            prediction.className = 'prediction';
            prediction.appendChild(createTextSpan('prediction-label', '推定:'));
            prediction.appendChild(createTextSpan('prediction-value', effect.prediction || '--'));
            const levelBadge = document.createElement('span');
            levelBadge.className = 'level-badge';
            prediction.appendChild(levelBadge);
            wrapper.appendChild(prediction);

            const rawLine = document.createElement('div');
            rawLine.className = 'raw';
            rawLine.textContent = formatOcrLine(effect.rawText, effect.score);
            wrapper.appendChild(rawLine);

            const decision = document.createElement('div');
            decision.className = 'decision';
            wrapper.appendChild(decision);

            if (!this.datasetReadOnly) {
                const row = document.createElement('div');
                row.className = 'decision-row';

                const passButton = document.createElement('button');
                passButton.type = 'button';
                passButton.className = 'review-button pass';
                passButton.dataset.action = 'set-status';
                passButton.dataset.value = 'pass';
                passButton.textContent = '合致';
                row.appendChild(passButton);

                const correctedButton = document.createElement('button');
                correctedButton.type = 'button';
                correctedButton.className = 'review-button corrected';
                correctedButton.dataset.action = 'set-status';
                correctedButton.dataset.value = 'corrected';
                correctedButton.textContent = '修正済み';
                row.appendChild(correctedButton);

                const correctionInput = document.createElement('input');
                correctionInput.type = 'search';
                correctionInput.className = 'correction-input';
                correctionInput.dataset.action = 'set-correction';
                correctionInput.value = effect.correction;
                if (this.masterOptions.length) {
                    correctionInput.setAttribute('list', MASTER_DATALIST_ID);
                    correctionInput.placeholder = 'マスタから選択';
                }
                row.appendChild(correctionInput);

                const levelSelect = document.createElement('select');
                levelSelect.className = 'level-input';
                levelSelect.dataset.action = 'set-level';
                populateLevelOptions(levelSelect, this.buildLevelCandidates(effect));
                levelSelect.value = effect.levelCorrection || (effect.showOriginalLevel ? effect.level : '');
                row.appendChild(levelSelect);

                decision.appendChild(row);
            }

            applyStatusStyles(wrapper, effect.status);
            updateLevelBadge(levelBadge, effect);
            wrapper.dataset.correction = effect.correction;
            wrapper.dataset.levelOriginal = effect.level;
            wrapper.dataset.levelCorrection = effect.levelCorrection;
            wrapper.dataset.showOriginal = effect.showOriginalLevel ? 'true' : 'false';
            wrapper.dataset.prediction = (effect.prediction || '').toLowerCase();
            wrapper.dataset.raw = (effect.rawText || '').toLowerCase();
            return wrapper;
        }

        buildLevelCandidates(effect) {
            const base = effect.levelOptions.slice();
            const normalizedName = normalizeEffectName(effect.correction || effect.prediction);
            if (normalizedName && this.masterLevels.has(normalizedName)) {
                const extras = this.masterLevels.get(normalizedName) || [];
                extras.forEach((candidate) => {
                    if (!base.includes(candidate)) {
                        base.push(candidate);
                    }
                });
            }
            if (effect.levelCorrection && !base.includes(effect.levelCorrection)) {
                base.push(effect.levelCorrection);
            }
            if (effect.showOriginalLevel && effect.level && !base.includes(effect.level)) {
                base.push(effect.level);
            }
            return base;
        }

        async handleGalleryClick(event) {
            const target = event.target;
            if (!(target instanceof HTMLElement)) {
                return;
            }
            const action = target.dataset.action;
            if (!action) {
                return;
            }

            const item = target.closest('.item');
            const effectNode = target.closest('.effect');
            if (action === 'toggle-duplicate' && item) {
                const record = this.findRecord(item);
                if (record) {
                    record.duplicate = !record.duplicate;
                    record.raw[DUPLICATE_KEY] = record.duplicate ? 'True' : 'False';
                    item.dataset.duplicate = record.duplicate ? 'true' : 'false';
                    target.textContent = record.duplicate ? '重複を解除' : '重複として隠す';
                    target.setAttribute('aria-pressed', record.duplicate ? 'true' : 'false');
                    this.scheduleSave();
                    this.applyFilters();
                }
                return;
            }

            if (action === 'toggle-favorite' && item) {
                const record = this.findRecord(item);
                if (record) {
                    record.favorite = !record.favorite;
                    record.raw[FAVORITE_KEY] = record.favorite ? 'True' : 'False';
                    item.dataset.favorite = record.favorite ? 'true' : 'false';
                    target.textContent = record.favorite ? '★ お気に入り' : '☆ お気に入り';
                    target.setAttribute('aria-pressed', record.favorite ? 'true' : 'false');
                    this.scheduleSave();
                    this.applyFilters();
                }
                return;
            }

            if (action === 'set-status' && effectNode) {
                const record = this.findRecord(effectNode.closest('.item'));
                if (!record) {
                    return;
                }
                const effect = findEffect(record, Number(effectNode.dataset.slot));
                if (!effect) {
                    return;
                }
                const value = target.dataset.value || 'pending';
                const next = effect.status === value ? 'pending' : value;
                effect.status = next;
                effect.rawStatusKey = `Effect${effect.slot}Status`;
                record.raw[effect.rawStatusKey] = next;
                if (next === 'pass' && !effect.correction) {
                    effect.levelCorrection = '';
                    record.raw[`Effect${effect.slot}LevelCorrection`] = '';
                    delete effectNode.dataset.levelCorrection;
                }
                applyStatusStyles(effectNode, next);
                const indicator = effectNode.querySelector('.status-indicator');
                if (indicator) {
                    indicator.textContent = statusLabel(next);
                }
                this.scheduleSave();
                this.updateSummary();
                return;
            }
        }

        handleGalleryInput(event) {
            const target = event.target;
            if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
                return;
            }
            const action = target.dataset.action;
            if (!action) {
                return;
            }
            const item = target.closest('.item');
            const record = this.findRecord(item);
            if (!record) {
                return;
            }

            if (action === 'set-item-color') {
                const select = target;
                record.itemColor = select.value || '';
                record.raw[ITEM_COLOR_KEY] = record.itemColor;
                if (record.itemColor) {
                    item.dataset.itemColor = record.itemColor;
                } else {
                    delete item.dataset.itemColor;
                }
                item.classList.remove('item-color-red', 'item-color-yellow', 'item-color-green', 'item-color-blue');
                if (record.itemColor) {
                    item.classList.add(colorClass(record.itemColor));
                }
                this.scheduleSave();
                this.applyFilters();
                return;
            }

            const effectNode = target.closest('.effect');
            if (!effectNode) {
                return;
            }
            const effect = findEffect(record, Number(effectNode.dataset.slot));
            if (!effect) {
                return;
            }

            if (action === 'set-correction') {
                const value = target.value.trim();
                effect.correction = value;
                record.raw[`Effect${effect.slot}Correction`] = value;
                if (value) {
                    effectNode.dataset.correction = value.toLowerCase();
                } else {
                    delete effectNode.dataset.correction;
                }
                if (value) {
                    effect.status = 'corrected';
                    record.raw[`Effect${effect.slot}Status`] = 'corrected';
                    applyStatusStyles(effectNode, effect.status);
                    const indicator = effectNode.querySelector('.status-indicator');
                    if (indicator) {
                        indicator.textContent = statusLabel(effect.status);
                    }
                } else if (effect.status === 'corrected') {
                    effect.status = 'pending';
                    record.raw[`Effect${effect.slot}Status`] = 'pending';
                    applyStatusStyles(effectNode, effect.status);
                    const indicator = effectNode.querySelector('.status-indicator');
                    if (indicator) {
                        indicator.textContent = statusLabel(effect.status);
                    }
                }
                const levelSelect = effectNode.querySelector('.level-input');
                if (levelSelect) {
                    populateLevelOptions(levelSelect, this.buildLevelCandidates(effect));
                    levelSelect.value = effect.levelCorrection || (effect.showOriginalLevel ? effect.level : '');
                }
                const badge = effectNode.querySelector('.level-badge');
                if (badge) {
                    updateLevelBadge(badge, effect);
                }
                this.scheduleSave();
                updateSearchCache(item, record);
                this.applyFilters();
                return;
            }

            if (action === 'set-level') {
                const value = target.value.trim();
                effect.levelCorrection = value;
                record.raw[`Effect${effect.slot}LevelCorrection`] = value;
                if (value) {
                    effectNode.dataset.levelCorrection = value;
                } else {
                    delete effectNode.dataset.levelCorrection;
                }
                const badge = effectNode.querySelector('.level-badge');
                if (badge) {
                    updateLevelBadge(badge, effect);
                }
                this.scheduleSave();
            }
        }

        findRecord(item) {
            if (!item) {
                return null;
            }
            const index = Number(item.dataset.index);
            if (Number.isNaN(index) || index < 0 || index >= this.records.length) {
                return null;
            }
            return this.records[index] || null;
        }

        applyFilters() {
            const term = (this.dom.searchInput && this.dom.searchInput.value.trim().toLowerCase()) || '';
            const filter = this.dom.filterSelect ? this.dom.filterSelect.value : 'all';
            const colorFilter = this.dom.colorFilter ? this.dom.colorFilter.value : 'all';

            this.items.forEach(({ element, record }) => {
                const matchesSearch = !term || (element.dataset.search || '').includes(term);
                const matchesStatus = matchStatusFilter(filter, record);
                const matchesColor = matchColorFilter(colorFilter, record);
                const hideDuplicate = record.duplicate && (!this.dom.showDuplicates || !this.dom.showDuplicates.checked);
                const visible = matchesSearch && matchesStatus && matchesColor && !hideDuplicate;
                element.style.display = visible ? '' : 'none';
            });

            this.updateSummary();
        }

        updateSummary() {
            if (!this.dom.gallerySummary) {
                return;
            }
            const total = this.records.length;
            let confirmed = 0;
            let pending = 0;
            this.records.forEach((record) => {
                const hasPending = record.effects.length
                    ? record.effects.some((effect) => effect.status === 'pending')
                    : true;
                if (hasPending) {
                    pending += 1;
                }
                const firstThree = record.effects.slice(0, 3);
                if (firstThree.length && firstThree.every((effect) => effect.status === 'pass' || effect.status === 'corrected')) {
                    confirmed += 1;
                }
            });
            const prefix = this.datasetLabel ? `[${this.datasetLabel}] ` : '';
            this.dom.gallerySummary.textContent = `${prefix}全体 ${total} 件 / 確認済み ${confirmed} 件 / 未レビュー ${pending} 件`;
            this.dom.gallerySummary.style.display = total ? 'block' : 'none';
        }

        updateOcrVisibility(show) {
            this.showOcr = show;
            if (this.dom.showOcr) {
                this.dom.showOcr.checked = show;
            }
            this.items.forEach(({ element }) => {
                element.querySelectorAll('.prediction, .raw').forEach((node) => {
                    node.style.display = show ? '' : 'none';
                });
            });
        }

        setStorageMessage(message, isError) {
            if (!this.dom.storageStatus) {
                return;
            }
            this.dom.storageStatus.textContent = message || '';
            this.dom.storageStatus.classList.toggle('error', Boolean(isError));
            this.dom.storageStatus.style.display = message ? 'inline' : 'none';
        }

        showStatus(message, isError = false) {
            if (!this.dom.galleryStatus) {
                return;
            }
            this.dom.galleryStatus.textContent = message;
            this.dom.galleryStatus.classList.toggle('error', Boolean(isError));
            this.dom.galleryStatus.style.display = message ? 'block' : 'none';
        }

        scheduleSave() {
            if (this.datasetReadOnly) {
                this.setStorageMessage('統合ビューでは保存できません。', true);
                return;
            }
            if (this.saveTimer) {
                clearTimeout(this.saveTimer);
            }
            this.saveTimer = setTimeout(() => {
                this.saveTimer = null;
                void this.saveNow();
            }, SAVE_DEBOUNCE_MS);
        }

        async saveNow() {
            if (this.datasetReadOnly) {
                return;
            }
            if (!this.csvPath) {
                this.setStorageMessage('保存先のCSVパスが不明です。', true);
                return;
            }
            try {
                this.setStorageMessage('保存中...', false);
                const response = await fetch(SAVE_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        csvPath: this.csvPath,
                        datasetLabel: this.datasetLabel || '',
                        records: this.records.map((record) => record.raw)
                    })
                });
                if (!response.ok) {
                    const detail = await response.text();
                    throw new Error(detail || `HTTP ${response.status}`);
                }
                this.lastSavedAt = new Date();
                this.setStorageMessage(`保存しました ${this.lastSavedAt.toLocaleTimeString()}`, false);
            } catch (error) {
                console.error('保存に失敗しました:', error);
                this.setStorageMessage(`保存失敗: ${error.message || error}`, true);
            }
        }

        downloadCsv() {
            if (!this.records.length) {
                this.setStorageMessage('エクスポート可能なデータがありません。', true);
                return;
            }
            const csvText = buildCsv(this.records.map((record) => record.raw), this.headers);
            if (!csvText) {
                this.setStorageMessage('CSVの生成に失敗しました。', true);
                return;
            }
            const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const base = fileName(this.csvPath) || 'results.csv';
            link.download = base.replace(/\.csv$/i, '_review.csv');
            link.href = url;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            this.setStorageMessage('CSVをダウンロードしました。', false);
        }

        openLightbox(src) {
            if (!this.dom.lightbox || !this.dom.lightboxImage) {
                return;
            }
            this.dom.lightboxImage.src = src;
            this.dom.lightbox.classList.add('show');
        }

        closeLightbox() {
            if (!this.dom.lightbox || !this.dom.lightboxImage) {
                return;
            }
            this.dom.lightboxImage.src = '';
            this.dom.lightbox.classList.remove('show');
        }
    }

    const app = new GalleryApp(dom, config);
    void app.init();

    function parseConfig(dataset) {
        return {
            csvPath: dataset.resultsCsv || '',
            imageDir: dataset.imgDir || '.',
            labelSymbols: parseJsonArray(dataset.labelSymbols, ['①', '②', '③']),
            masterCsv: dataset.masterCsv || '',
            masterOptions: parseJsonArray(dataset.masterOptions, []),
            masterLevels: parseMasterLevels(dataset.masterLevels),
            datasets: parseDatasets(dataset.datasets),
            activeDatasetIndex: Number.parseInt(dataset.activeDataset, 10) || 0,
            datasetLabel: dataset.datasetLabel || ''
        };
    }

    function parseJsonArray(source, fallback) {
        if (!source) {
            return fallback.slice();
        }
        try {
            const parsed = JSON.parse(source);
            if (Array.isArray(parsed)) {
                return parsed.map((value) => String(value));
            }
        } catch (error) {
            console.warn('JSON配列の解析に失敗しました:', error);
        }
        return fallback.slice();
    }

    function parseMasterLevels(source) {
        if (!source) {
            return new Map();
        }
        try {
            const parsed = JSON.parse(source);
            const entries = Array.isArray(parsed) ? parsed : Object.entries(parsed);
            const map = new Map();
            entries.forEach(([key, value]) => {
                const normalizedKey = normalizeEffectName(key);
                if (!normalizedKey) {
                    return;
                }
                const list = Array.isArray(value) ? value : [value];
                const levels = list
                    .map((entry) => String(entry).trim())
                    .filter((entry) => entry);
                if (levels.length) {
                    map.set(normalizedKey, Array.from(new Set(levels)));
                }
            });
            return map;
        } catch (error) {
            console.warn('マスターレベルJSONの解析に失敗しました:', error);
            return new Map();
        }
    }

    function parseDatasets(source) {
        if (!source) {
            return [];
        }
        try {
            const parsed = JSON.parse(source);
            if (!Array.isArray(parsed)) {
                return [];
            }
            return parsed
                .map((entry) => {
                    if (!entry || typeof entry !== 'object') {
                        return null;
                    }
                    const normalized = {
                        label: entry.label || '',
                        csvPath: entry.csv || entry.csvPath || '',
                        imageDir: entry.imgDir || entry.imageDir || '',
                        kind: entry.kind || 'single',
                        readOnly: Boolean(entry.readOnly),
                        sources: Array.isArray(entry.sources) ? entry.sources : []
                    };
                    if (!normalized.csvPath && normalized.kind !== 'merged') {
                        return null;
                    }
                    return normalized;
                })
                .filter(Boolean);
        } catch (error) {
            console.warn('datasetの解析に失敗しました:', error);
            return [];
        }
    }

    function datasetLabel(dataset, index) {
        const label = dataset.label || `データセット ${index + 1}`;
        if (dataset.kind === 'merged') {
            return `${label} (統合ビュー)`;
        }
        return label;
    }

    function parseCsv(text) {
        const rows = parseCsvRows(text);
        if (!rows.length) {
            return { headers: [], records: [] };
        }
        const headers = rows[0].map((header) => String(header || '').trim());
        const records = [];
        for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
            const row = rows[rowIndex];
            if (!row.length || row.every((cell) => String(cell || '').trim() === '')) {
                continue;
            }
            const record = {};
            headers.forEach((header, columnIndex) => {
                if (!header) {
                    return;
                }
                record[header] = row[columnIndex] == null ? '' : row[columnIndex];
            });
            records.push(record);
        }
        return { headers, records };
    }

    function parseCsvRows(text) {
        const result = [];
        let row = [];
        let field = '';
        let quoted = false;
        for (let index = 0; index < text.length; index += 1) {
            const char = text[index];
            if (quoted) {
                if (char === '"') {
                    if (text[index + 1] === '"') {
                        field += '"';
                        index += 1;
                    } else {
                        quoted = false;
                    }
                } else {
                    field += char;
                }
                continue;
            }
            if (char === '"') {
                quoted = true;
                continue;
            }
            if (char === ',') {
                row.push(field);
                field = '';
                continue;
            }
            if (char === '\n') {
                row.push(field);
                result.push(row);
                row = [];
                field = '';
                continue;
            }
            if (char === '\r') {
                continue;
            }
            field += char;
        }
        row.push(field);
        result.push(row);
        return result;
    }

    function ensureLabelSymbols(symbols, records) {
        let maxSlot = symbols.length;
        records.forEach((record) => {
            Object.keys(record).forEach((key) => {
                const match = /^Effect(\d+)$/.exec(key);
                if (match) {
                    const slot = Number.parseInt(match[1], 10);
                    if (!Number.isNaN(slot) && slot > maxSlot) {
                        maxSlot = slot;
                    }
                }
            });
        });
        const next = symbols.slice();
        for (let slot = symbols.length + 1; slot <= maxSlot; slot += 1) {
            next.push(`Slot ${slot}`);
        }
        return next;
    }

    function createRecordModel(row, context) {
        const raw = { ...row };
        const imageName = String(row.Image || '').trim();
        const baseImage = String(row.BaseImage || '').trim();
        const datasetLabel = String(row.Dataset || context.datasetLabel || '').trim();
        const datasetFolder = String(row.DatasetFolder || '').trim();
        const displayName = baseImage || fileName(imageName) || imageName || '(no image)';
        const imagePath = imageName ? joinPath(context.imageDir || '.', imageName) : '';

        const duplicate = parseBoolean(row[DUPLICATE_KEY]);
        const favorite = parseBoolean(row[FAVORITE_KEY]);
        const itemColor = normalizeItemColor(row[ITEM_COLOR_KEY]);

        const slotCount = context.labelSymbols.length;
        const effects = [];
        for (let slot = 1; slot <= slotCount; slot += 1) {
            const prediction = String(row[`Effect${slot}`] || '').trim();
            const rawText = String(row[`RawText${slot}`] || '').trim();
            const scoreRaw = Number(row[`Effect${slot}Score`]);
            const hasScore = Number.isFinite(scoreRaw);
            if (!prediction && !rawText && !hasScore) {
                continue;
            }
            let status = normalizeStatus(row[`Effect${slot}Status`]);
            const correction = String(row[`Effect${slot}Correction`] || '').trim();
            const level = String(row[`Effect${slot}Level`] || '').trim();
            const levelOptions = parseLevelOptions(row[`Effect${slot}LevelOptions`]);
            const levelCorrection = String(row[`Effect${slot}LevelCorrection`] || '').trim();
            const levelSuppressed = parseBoolean(row[`Effect${slot}LevelSuppressed`]);
            const showOriginalLevel = !levelSuppressed;
            if (correction && status !== 'pass') {
                status = 'corrected';
            }
            row[`Effect${slot}Status`] = status;
            effects.push({
                slot,
                symbol: context.labelSymbols[slot - 1] || `Slot ${slot}`,
                prediction,
                rawText,
                score: hasScore ? scoreRaw : null,
                status,
                correction,
                level,
                levelOptions,
                levelCorrection,
                showOriginalLevel,
                rawStatusKey: `Effect${slot}Status`
            });
        }

        return {
            index: context.index,
            raw,
            imagePath,
            displayName,
            datasetLabel,
            datasetFolder,
            duplicate,
            favorite,
            itemColor,
            effects
        };
    }

    function parseLevelOptions(value) {
        if (!value) {
            return [];
        }
        return String(value)
            .split('|')
            .map((entry) => entry.trim())
            .filter((entry) => entry);
    }

    function normalizeEffectName(value) {
        return String(value || '').trim().toLowerCase();
    }

    function formatOcrLine(rawText, score) {
        const ocr = rawText || '--';
        if (!Number.isFinite(score)) {
            return `OCR: ${ocr}`;
        }
        return `OCR: ${ocr} / 一致度 ${score.toFixed(1)}%`;
    }

    function applyStatusStyles(effectNode, status) {
        if (!effectNode) {
            return;
        }
        effectNode.dataset.status = status;
        effectNode.classList.toggle('status-pass', status === 'pass');
        effectNode.classList.toggle('status-corrected', status === 'corrected');
        effectNode.classList.toggle('status-pending', status === 'pending');
    }

    function updateLevelBadge(badge, effect) {
        if (!badge) {
            return;
        }
        if (effect.levelCorrection) {
            badge.className = 'level-badge level-badge--corrected';
            badge.textContent = effect.levelCorrection;
            return;
        }
        if (effect.showOriginalLevel && effect.level) {
            badge.className = 'level-badge';
            badge.textContent = effect.level;
            return;
        }
        const firstOption = effect.levelOptions[0];
        if (firstOption) {
            badge.className = 'level-badge level-badge--missing';
            badge.textContent = firstOption;
            return;
        }
        badge.textContent = '';
        badge.className = 'level-badge';
    }

    function populateLevelOptions(select, options) {
        select.innerHTML = '';
        const empty = document.createElement('option');
        empty.value = '';
        select.appendChild(empty);
        const seen = new Set();
        options.forEach((option) => {
            const text = String(option || '').trim();
            if (!text || seen.has(text.toLowerCase())) {
                return;
            }
            seen.add(text.toLowerCase());
            const node = document.createElement('option');
            node.value = text;
            node.textContent = text;
            select.appendChild(node);
        });
    }

    function mergeHeaders(base, extras) {
        const result = base.slice();
        extras.forEach((header) => {
            if (header && !result.includes(header)) {
                result.push(header);
            }
        });
        return result;
    }

    function collectRecordHeaders(records) {
        const headers = new Set();
        records.forEach((record) => {
            Object.keys(record.raw).forEach((key) => headers.add(key));
        });
        return Array.from(headers);
    }

    function buildCsv(records, headers) {
        const effectiveHeaders = headers.length ? headers : collectRecordHeaders(records);
        const lines = [effectiveHeaders.join(',')];
        records.forEach((record) => {
            const cells = effectiveHeaders.map((header) => escapeCsv(record[header] ?? ''));
            lines.push(cells.join(','));
        });
        return lines.join('\n');
    }

    function escapeCsv(value) {
        const text = String(value);
        if (/[",\n]/.test(text)) {
            return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
    }

    function updateSearchCache(item, record) {
        const tokens = [record.displayName.toLowerCase()];
        if (record.datasetLabel) {
            tokens.push(record.datasetLabel.toLowerCase());
        }
        record.effects.forEach((effect) => {
            if (effect.prediction) {
                tokens.push(effect.prediction.toLowerCase());
            }
            if (effect.rawText) {
                tokens.push(effect.rawText.toLowerCase());
            }
            if (effect.correction) {
                tokens.push(effect.correction.toLowerCase());
            }
        });
        item.dataset.search = tokens.join(' ');
    }

    function parseBoolean(value) {
        const text = String(value || '').trim().toLowerCase();
        if (!text) {
            return false;
        }
        return text === 'true' || text === '1' || text === 'yes';
    }

    function normalizeStatus(value) {
        const text = String(value || '').trim().toLowerCase();
        if (text === 'pass') {
            return 'pass';
        }
        if (text === 'corrected') {
            return 'corrected';
        }
        return 'pending';
    }

    function statusLabel(status) {
        switch (status) {
            case 'pass':
                return '確認済み';
            case 'corrected':
                return '修正済み';
            default:
                return '未レビュー';
        }
    }

    function colorClass(key) {
        switch (key) {
            case 'red':
                return 'item-color-red';
            case 'yellow':
                return 'item-color-yellow';
            case 'green':
                return 'item-color-green';
            case 'blue':
                return 'item-color-blue';
            default:
                return '';
        }
    }

    function normalizeItemColor(value) {
        const key = String(value || '').trim().toLowerCase();
        return ['red', 'yellow', 'green', 'blue'].includes(key) ? key : '';
    }

    function fileName(path) {
        if (!path) {
            return '';
        }
        const parts = path.split(/[\\/]/);
        return parts[parts.length - 1] || '';
    }

    function joinPath(base, leaf) {
        if (!base) {
            return leaf;
        }
        if (!leaf) {
            return base;
        }
        if (/^(?:[a-z]+:)?\/\//i.test(leaf) || leaf.startsWith('/')) {
            return leaf;
        }
        const cleanBase = base.replace(/[\\/]+$/, '');
        const cleanLeaf = leaf.replace(/^[\\/]+/, '');
        return `${cleanBase}/${cleanLeaf}`;
    }

    function clampIndex(index, length) {
        if (!length) {
            return 0;
        }
        const parsed = Number.parseInt(index, 10);
        if (Number.isNaN(parsed) || parsed < 0) {
            return 0;
        }
        if (parsed >= length) {
            return length - 1;
        }
        return parsed;
    }

    function parseMasterLevelsCsv(text) {
        const { records } = parseCsv(text);
        const map = new Map();
        records.forEach((record) => {
            const effectName = normalizeEffectName(record.EffectBase || record.effect || record.name || record.value);
            if (!effectName) {
                return;
            }
            const levels = parseLevelOptions(record.Levels);
            if (!levels.length) {
                return;
            }
            const unique = map.get(effectName) || [];
            levels.forEach((level) => {
                if (!unique.includes(level)) {
                    unique.push(level);
                }
            });
            map.set(effectName, unique);
        });
        return map;
    }

    function createTextSpan(className, text) {
        const span = document.createElement('span');
        span.className = className;
        span.textContent = text;
        return span;
    }

    function findEffect(record, slot) {
        return record.effects.find((effect) => effect.slot === slot) || null;
    }

    function matchStatusFilter(filter, record) {
        if (filter === 'favorite') {
            return record.favorite;
        }
        if (filter === 'resolved') {
            const firstThree = record.effects.slice(0, 3);
            return firstThree.length > 0 && firstThree.every((effect) => effect.status === 'pass' || effect.status === 'corrected');
        }
        if (filter === 'with-pending') {
            return record.effects.length
                ? record.effects.some((effect) => effect.status === 'pending')
                : true;
        }
        return true;
    }

    function matchColorFilter(filter, record) {
        if (filter === 'all') {
            return true;
        }
        if (filter === 'none') {
            return !record.itemColor;
        }
        return record.itemColor === filter;
    }
})();

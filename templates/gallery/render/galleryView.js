(() => {
    function createGalleryView(config = {}) {
        const {
            state,
            datasetState,
            dom,
            duplicates,
            itemColorOptions = [],
            createEffect,
            bindImage,
            createElement,
            joinPath,
            getFileName,
            showStatus = () => {},
            clearStatus = () => {},
            updateSummary = () => {},
            getRecordByIndex,
            isRecordDuplicate,
            isRecordFavorite
        } = config;

        if (!state || !datasetState || !dom) {
            throw new Error('createGalleryView: invalid state or dom configuration');
        }
        if (typeof createEffect !== 'function') {
            throw new Error('createGalleryView: createEffect function is required');
        }
        if (typeof bindImage !== 'function') {
            throw new Error('createGalleryView: bindImage function is required');
        }
        if (typeof createElement !== 'function') {
            throw new Error('createGalleryView: createElement helper is required');
        }
        if (typeof joinPath !== 'function' || typeof getFileName !== 'function') {
            throw new Error('createGalleryView: joinPath and getFileName helpers are required');
        }
        if (typeof getRecordByIndex !== 'function') {
            throw new Error('createGalleryView: getRecordByIndex helper is required');
        }
        if (typeof isRecordDuplicate !== 'function') {
            throw new Error('createGalleryView: isRecordDuplicate helper is required');
        }
        if (typeof isRecordFavorite !== 'function') {
            throw new Error('createGalleryView: isRecordFavorite helper is required');
        }

        const colorOptions = Array.isArray(itemColorOptions) ? itemColorOptions.slice() : [];

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
            dom.gallery.querySelectorAll('.raw, .prediction').forEach((element) => {
                element.style.display = state.showOcr ? '' : 'none';
            });
        }

        function buildGallery() {
            const includeDuplicates = includeDuplicatesNow();
            clearGalleryElement();
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

            if (fragment.childNodes.length && dom.gallery) {
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

        function clearGalleryElement() {
            if (!dom.gallery) {
                return;
            }
            dom.gallery.textContent = '';
        }

        function createItem(record, recordIndex, visibleIndex, visibleTotal) {
            const context = createItemContext(record, recordIndex, visibleIndex, visibleTotal);
            if (!context) {
                return null;
            }

            const { item, leftColumn, rightColumn } = createItemStructure(context);

            const imageElement = createItemImage(context);
            if (imageElement) {
                leftColumn.appendChild(imageElement);
                bindImage(imageElement);
            }

            leftColumn.appendChild(createItemControls(context));

            const hasEffect = appendItemEffects(context, rightColumn);
            if (!hasEffect) {
                rightColumn.appendChild(createNoEffectPlaceholder());
            }

            syncDuplicateState(item);
            syncFavoriteState(item);
            syncItemColorState(item);
            refreshItemCaches(item);
            return item;
        }

        function createItemContext(record, recordIndex, visibleIndex, visibleTotal) {
            if (!record || typeof record !== 'object') {
                return null;
            }
            const imageName = record.Image == null ? '' : String(record.Image);
            const baseImageName = record.BaseImage == null ? '' : String(record.BaseImage);
            const displayName = baseImageName || getFileName(imageName) || imageName;
            const isMerged = datasetState.kind === 'merged';
            const datasetName = isMerged ? (record.Dataset == null ? '' : String(record.Dataset)) : '';
            const datasetFolder = isMerged ? (record.DatasetFolder == null ? '' : String(record.DatasetFolder)) : '';
            const imagePath = joinPath(state.imageDir, imageName);

            return {
                record,
                recordIndex,
                visibleIndex,
                visibleTotal,
                imageName,
                baseImageName,
                displayName,
                datasetName,
                datasetFolder,
                imagePath
            };
        }

        function createItemStructure(context) {
            const item = document.createElement('div');
            item.className = 'item';
            item.dataset.image = context.imageName.toLowerCase();
            item.dataset.imageName = context.imageName;
            item.dataset.recordIndex = String(context.recordIndex);
            if (context.baseImageName) {
                item.dataset.baseImage = context.baseImageName.toLowerCase();
            }
            if (context.datasetName) {
                item.dataset.datasetLabel = context.datasetName.toLowerCase();
            }

            const leftColumn = createElement('div', 'item-left');
            const rightColumn = createElement('div', 'item-right');
            item.appendChild(leftColumn);
            item.appendChild(rightColumn);

            return { item, leftColumn, rightColumn };
        }

        function createItemImage(context) {
            const img = createElement('img');
            img.src = context.imagePath;
            img.alt = context.displayName || context.imageName;
            img.dataset.full = context.imagePath;
            img.tabIndex = 0;
            return img;
        }

        function createItemControls(context) {
            const controls = createElement('div', 'item-controls');
            controls.appendChild(createDuplicateButton(context.imageName));
            controls.appendChild(createFavoriteButton(context.imageName));
            controls.appendChild(createColorControls(context.recordIndex));
            controls.appendChild(createItemMetaInfo(context));
            return controls;
        }

        function createDuplicateButton(imageName) {
            const button = createElement('button', 'duplicate-toggle');
            button.type = 'button';
            button.dataset.image = imageName;
            button.dataset.action = 'toggle-duplicate';
            button.setAttribute('aria-pressed', 'false');
            return button;
        }

        function createFavoriteButton(imageName) {
            const button = createElement('button', 'favorite-toggle', 'お気に入り');
            button.type = 'button';
            button.dataset.image = imageName;
            button.dataset.action = 'toggle-favorite';
            button.setAttribute('aria-pressed', 'false');
            return button;
        }

        function createColorControls(recordIndex) {
            const container = createElement('div', 'item-color-controls');
            const label = createElement('label', 'item-color-label', '色');
            const selectId = `item-color-${recordIndex}`;
            label.setAttribute('for', selectId);

            const select = createElement('select', 'item-color-select');
            select.id = selectId;
            select.dataset.action = 'set-item-color';
            select.dataset.recordIndex = String(recordIndex);

            const emptyOption = createElement('option');
            emptyOption.value = '';
            emptyOption.textContent = 'なし';
            select.appendChild(emptyOption);

            colorOptions.forEach((option) => {
                const colorOption = createElement('option');
                colorOption.value = option.key;
                colorOption.textContent = option.label;
                select.appendChild(colorOption);
            });

            container.appendChild(label);
            container.appendChild(select);
            return container;
        }

        function createItemMetaInfo(context) {
            const metaInfo = createElement('div', 'item-meta');
            metaInfo.appendChild(createItemPosition(context.visibleIndex, context.visibleTotal));

            if (datasetState.kind === 'merged' && context.datasetName) {
                const datasetBadge = createElement('span', 'dataset-label', context.datasetName);
                const badgeTitle = context.datasetFolder
                    ? `${context.datasetName} (${context.datasetFolder})`
                    : context.datasetName;
                datasetBadge.setAttribute('title', badgeTitle);
                metaInfo.appendChild(datasetBadge);
            }

            const filenameText = context.displayName || context.imageName;
            const filename = createElement('span', 'filename', filenameText);
            filename.setAttribute('title', context.imageName || filenameText || '');
            metaInfo.appendChild(filename);

            return metaInfo;
        }

        function createItemPosition(visibleIndex, visibleTotal) {
            if (visibleTotal <= 0) {
                return createElement('span', 'item-position', '- / 0');
            }
            let displayIndex = visibleIndex;
            if (displayIndex <= 0) {
                displayIndex = 1;
            } else if (displayIndex > visibleTotal) {
                displayIndex = visibleTotal;
            }
            return createElement('span', 'item-position', `${displayIndex} / ${visibleTotal}`);
        }

        function appendItemEffects(context, rightColumn) {
            let hasEffect = false;
            state.labelSymbols.forEach((symbol, index) => {
                const effect = createEffect(
                    context.record,
                    index + 1,
                    symbol || `Slot ${index + 1}`,
                    context.imageName,
                    context.recordIndex
                );
                if (effect) {
                    rightColumn.appendChild(effect);
                    hasEffect = true;
                }
            });
            return hasEffect;
        }

        function createNoEffectPlaceholder() {
            return createElement('p', 'no-effect', '効果情報がありません。');
        }

        function resolveItemElement(element) {
            if (!element) {
                return null;
            }
            if (element.classList && element.classList.contains('item')) {
                return element;
            }
            return element.closest ? element.closest('.item') : null;
        }

        function getItemContext(element) {
            const item = resolveItemElement(element);
            if (!item) {
                return null;
            }
            const recordIndex = Number(item.dataset.recordIndex);
            const record = getRecordByIndex(recordIndex);
            if (!record) {
                return null;
            }
            return { item, recordIndex, record };
        }

        function normalizeItemColor(value) {
            const text = (value || '').toString().trim().toLowerCase();
            const option = colorOptions.find((entry) => entry.key === text);
            return option ? option.key : '';
        }

        function applyItemColor(item, colorKey) {
            if (!item) {
                return;
            }
            const normalized = normalizeItemColor(colorKey);
            colorOptions.forEach((entry) => {
                if (entry.className) {
                    item.classList.remove(entry.className);
                }
            });
            if (normalized) {
                const option = colorOptions.find((entry) => entry.key === normalized);
                if (option && option.className) {
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
            const context = getItemContext(item);
            const isFavorite = context ? isRecordFavorite(context.record) : false;
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
            const context = getItemContext(item);
            const imageName = item.dataset.imageName || '';
            const recordDuplicate = context ? isRecordDuplicate(context.record) : false;
            const storedDuplicate = imageName ? duplicates.has(imageName) : false;
            const isDuplicate = recordDuplicate || storedDuplicate;
            if (imageName) {
                duplicates.set(imageName, isDuplicate);
            }
            updateDuplicateVisuals(item, isDuplicate);
        }

        function syncItemColorState(item) {
            if (!item) {
                return;
            }
            const context = getItemContext(item);
            const colorKey = context ? context.record.ItemColor : '';
            applyItemColor(item, colorKey);
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
            const baseImageToken = item.dataset.baseImage;
            if (baseImageToken) {
                tokens.push(baseImageToken);
            }
            const datasetToken = item.dataset.datasetLabel;
            if (datasetToken) {
                tokens.push(datasetToken);
            }

            item.querySelectorAll('.effect').forEach((effect) => {
                const {
                    pred = '',
                    raw = '',
                    correction = '',
                    status = 'pending',
                    level = '',
                    levelOptions = '',
                    levelCorrection = ''
                } = effect.dataset;
                if (pred) {
                    tokens.push(pred);
                }
                if (raw) {
                    tokens.push(raw);
                }
                if (correction) {
                    tokens.push(correction);
                }
                if (level) {
                    tokens.push(level);
                }
                if (levelCorrection) {
                    tokens.push(levelCorrection);
                }
                if (levelOptions) {
                    tokens.push(levelOptions);
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

        return {
            buildGallery,
            applyFilters,
            setOcrVisibility,
            getOcrToggleState: ocrToggleState,
            includeDuplicatesNow,
            getItemContext,
            updateFavoriteVisuals,
            updateDuplicateVisuals,
            applyItemColor,
            normalizeItemColor,
            refreshItemCaches
        };
    }

    if (!window.galleryRenderFactory) {
        window.galleryRenderFactory = {};
    }
    window.galleryRenderFactory.createGalleryView = createGalleryView;
})();

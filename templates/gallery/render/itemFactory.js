(() => {
    function createItemFactory(config = {}) {
        const {
            datasetState = {},
            createElement,
            createFragment: createFragmentConfig,
            bindImage = () => {},
            createEffect,
            colorOptions = [],
            getImagePath = (imageName) => imageName,
            getDisplayName = (imageName) => imageName,
            getLabelSymbols = () => [],
            itemEnhancers: itemEnhancersConfig = []
        } = config;

        if (typeof createElement !== 'function') {
            throw new Error('createItemFactory: createElement helper is required');
        }
        if (typeof createEffect !== 'function') {
            throw new Error('createItemFactory: createEffect helper is required');
        }
        if (typeof bindImage !== 'function') {
            throw new Error('createItemFactory: bindImage helper must be a function');
        }
        if (typeof getImagePath !== 'function') {
            throw new Error('createItemFactory: getImagePath helper must be a function');
        }
        if (typeof getDisplayName !== 'function') {
            throw new Error('createItemFactory: getDisplayName helper must be a function');
        }
        if (typeof getLabelSymbols !== 'function') {
            throw new Error('createItemFactory: getLabelSymbols helper must be a function');
        }

        const createFragment =
            typeof createFragmentConfig === 'function'
                ? createFragmentConfig
                : () => (typeof document !== 'undefined' ? document.createDocumentFragment() : null);

        const normalizedColorOptions = Array.isArray(colorOptions) ? colorOptions.slice() : [];
        const resolvedDatasetState = datasetState && typeof datasetState === 'object' ? datasetState : {};
        const itemEnhancers = Array.isArray(itemEnhancersConfig)
            ? itemEnhancersConfig.filter((fn) => typeof fn === 'function')
            : [];

        function runItemEnhancers(item, context) {
            if (!item || !itemEnhancers.length) {
                return;
            }
            itemEnhancers.forEach((enhancer) => {
                try {
                    enhancer(item, context);
                } catch (error) {
                    if (typeof console !== 'undefined' && console && typeof console.error === 'function') {
                        console.error('createItemFactory: item enhancer failed', error);
                    }
                }
            });
        }

        function createItem(record, recordIndex, visibleIndex, visibleTotal) {
            const context = createItemContext(record, recordIndex, visibleIndex, visibleTotal);
            if (!context) {
                return null;
            }

            const { item, leftColumn, rightColumn } = createItemStructure(context);

            const leftResult = buildLeftColumn(context);
            commitColumnContent(leftColumn, leftResult);
            if (leftResult.imageElement) {
                bindImage(leftResult.imageElement);
            }

            const rightResult = buildRightColumn(context);
            commitColumnContent(rightColumn, rightResult);

            runItemEnhancers(item, context);

            return item;
        }

        function createItemContext(record, recordIndex, visibleIndex, visibleTotal) {
            if (!record || typeof record !== 'object') {
                return null;
            }

            const imageName = record.Image == null ? '' : String(record.Image);
            const baseImageName = record.BaseImage == null ? '' : String(record.BaseImage);
            const displayName = baseImageName || getDisplayName(imageName) || imageName;
            const datasetKind = resolvedDatasetState.kind || '';
            const isMergedDataset = datasetKind === 'merged';
            const datasetName = isMergedDataset ? (record.Dataset == null ? '' : String(record.Dataset)) : '';
            const datasetFolder = isMergedDataset ? (record.DatasetFolder == null ? '' : String(record.DatasetFolder)) : '';
            const imagePath = getImagePath(imageName, record);

            return {
                record,
                recordIndex,
                visibleIndex,
                visibleTotal,
                imageName,
                baseImageName,
                displayName,
                datasetKind,
                datasetName,
                datasetFolder,
                imagePath
            };
        }

        function createItemStructure(context) {
            const item = createElement('div', 'item');
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

        function buildLeftColumn(context) {
            const fragment = createFragment();
            const nodes = [];
            const imageElement = createItemImage(context);
            if (imageElement) {
                appendToFragment(fragment, imageElement);
                nodes.push(imageElement);
            }

            const controls = createItemControls(context);
            appendToFragment(fragment, controls);
            nodes.push(controls);

            return { fragment, nodes, imageElement };
        }

        function createItemImage(context) {
            if (!context.imagePath) {
                return null;
            }
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

            normalizedColorOptions.forEach((option) => {
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

            if (context.datasetKind === 'merged' && context.datasetName) {
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

        function buildRightColumn(context) {
            const fragment = createFragment();
            const nodes = [];
            let hasEffect = false;
            const symbols = getLabelSymbols();
            const labelSymbols = Array.isArray(symbols) ? symbols : [];
            labelSymbols.forEach((symbol, index) => {
                const effect = createEffect(
                    context.record,
                    index + 1,
                    symbol || `Slot ${index + 1}`,
                    context.imageName,
                    context.recordIndex
                );
                if (effect) {
                    hasEffect = true;
                    appendToFragment(fragment, effect);
                    nodes.push(effect);
                }
            });

            if (!hasEffect) {
                const placeholder = createNoEffectPlaceholder();
                appendToFragment(fragment, placeholder);
                nodes.push(placeholder);
            }

            return { fragment, nodes, hasEffect };
        }

        function createNoEffectPlaceholder() {
            return createElement('p', 'no-effect', '効果情報がありません。');
        }

        function appendToFragment(fragment, node) {
            if (!fragment || !node || typeof fragment.appendChild !== 'function') {
                return;
            }
            fragment.appendChild(node);
        }

        function commitColumnContent(column, result) {
            if (!column || !result) {
                return;
            }
            const { fragment, nodes = [] } = result;
            if (fragment && typeof fragment.nodeType === 'number' && fragment.nodeType === 11) {
                column.appendChild(fragment);
                return;
            }
            if (fragment && typeof fragment.tagName === 'string' && fragment.tagName.toLowerCase() === '#fragment') {
                nodes.forEach((node) => {
                    if (node) {
                        column.appendChild(node);
                    }
                });
                return;
            }
            if (fragment && typeof fragment.nodeType === 'number') {
                column.appendChild(fragment);
                return;
            }
            nodes.forEach((node) => {
                if (node) {
                    column.appendChild(node);
                }
            });
        }

        return {
            createItem,
            createItemContext,
            buildLeftColumn,
            buildRightColumn
        };
    }

    if (!window.galleryRenderFactory) {
        window.galleryRenderFactory = {};
    }
    window.galleryRenderFactory.createItemFactory = createItemFactory;
})();

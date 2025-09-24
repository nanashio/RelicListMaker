
(function () {
    'use strict';

    var body = document.body;
    var resultsPath = body.getAttribute('data-results-json');
    var imageDir = body.getAttribute('data-img-dir') || '.';
    var labelSymbols = [];
    var recordsData = [];
    var items = [];
    var saveTimer = null;

    var gallery = document.getElementById('gallery');
    var galleryStatus = document.getElementById('gallery-status');
    var searchInput = document.getElementById('search-input');
    var filterSelect = document.getElementById('filter-status');
    var lightbox = document.getElementById('lightbox');
    var lightboxImg = lightbox ? lightbox.querySelector('img') : null;
    var closeBtn = document.getElementById('lightbox-close');
    var importButton = document.getElementById('pick-json');
    var exportButton = document.getElementById('download-json');
    var storageStatus = document.getElementById('storage-status');

    var opfsState = {
        supported: Boolean(navigator.storage && navigator.storage.getDirectory),
        directoryPromise: null,
        fileHandle: null,
        fileName: '',
        writeInFlight: false,
        requeue: false
    };

    try {
        var rawSymbols = body.getAttribute('data-label-symbols') || '[]';
        var parsed = JSON.parse(rawSymbols);
        if (Array.isArray(parsed)) {
            labelSymbols = parsed;
        }
    } catch (error) {
        console.warn('Failed to parse label symbols:', error);
    }

    labelSymbols = labelSymbols
        .map(function (symbol) { return symbol == null ? '' : String(symbol); })
        .filter(function (symbol) { return symbol !== ''; });

    if (!labelSymbols.length) {
        labelSymbols = ['①', '②', '③'];
    }

    function showStatus(message, isError) {
        if (!galleryStatus) {
            return;
        }
        galleryStatus.textContent = message || '';
        galleryStatus.classList.toggle('error', Boolean(isError));
        galleryStatus.style.display = message ? 'block' : 'none';
    }

    function clearStatus() {
        showStatus('', false);
    }

    function setStorageStatus(message, isError) {
        if (!storageStatus) {
            return;
        }
        storageStatus.textContent = message || '';
        storageStatus.classList.toggle('error', Boolean(isError));
        storageStatus.style.display = message ? 'inline' : 'none';
    }

    if (!opfsState.supported) {
        setStorageStatus('OPFS非対応ブラウザのため、自動保存は無効です。', true);
    }

    function toggleExportVisibility(visible) {
        if (!exportButton) {
            return;
        }
        exportButton.hidden = !visible;
    }

    function getFileNameFromPath(path) {
        if (!path) {
            return '';
        }
        var parts = path.split(/[\\/]/);
        var name = parts[parts.length - 1] || '';
        return name;
    }

    function ensureOpfsDirectory() {
        if (!opfsState.supported) {
            return Promise.reject(new Error('OPFS is not supported.'));
        }
        if (!opfsState.directoryPromise) {
            opfsState.directoryPromise = navigator.storage.getDirectory();
        }
        return opfsState.directoryPromise;
    }

    function ensureOpfsFileHandle(name, create) {
        if (!name) {
            return Promise.reject(new Error('ファイル名が指定されていません。'));
        }
        return ensureOpfsDirectory().then(function (directory) {
            return directory.getFileHandle(name, { create: Boolean(create) });
        });
    }

    function readFromHandle(handle) {
        return handle.getFile().then(function (file) {
            return file.text();
        });
    }

    function writeToHandle(handle, text) {
        var writable;
        return handle.createWritable()
            .then(function (stream) {
                writable = stream;
                return stream.write(text);
            })
            .then(function () {
                return writable.close();
            })
            .catch(function (error) {
                if (writable && typeof writable.abort === 'function') {
                    try {
                        writable.abort();
                    } catch (abortError) {
                        console.warn('Failed to abort writable stream:', abortError);
                    }
                }
                throw error;
            });
    }

    function scheduleSave() {
        if (!opfsState.supported || !opfsState.fileHandle) {
            return;
        }
        if (saveTimer) {
            clearTimeout(saveTimer);
        }
        saveTimer = setTimeout(function () {
            saveTimer = null;
            flushToOpfs();
        }, 400);
    }

    function flushToOpfs() {
        if (!opfsState.supported || !opfsState.fileHandle) {
            return;
        }
        if (opfsState.writeInFlight) {
            opfsState.requeue = true;
            return;
        }
        var text;
        try {
            text = JSON.stringify(recordsData, null, 2);
        } catch (error) {
            console.error('JSON生成に失敗しました:', error);
            setStorageStatus('保存失敗: JSON生成に失敗しました。', true);
            return;
        }

        opfsState.writeInFlight = true;
        opfsState.requeue = false;
        setStorageStatus('保存中...', false);
        writeToHandle(opfsState.fileHandle, text)
            .then(function () {
                setStorageStatus('保存済み ' + new Date().toLocaleTimeString(), false);
                finalize();
            })
            .catch(function (error) {
                console.error('OPFS書き込みに失敗しました:', error);
                setStorageStatus('保存失敗: ' + (error && error.message ? error.message : error), true);
                finalize();
            });

        function finalize() {
            opfsState.writeInFlight = false;
            if (opfsState.requeue) {
                opfsState.requeue = false;
                scheduleSave();
            }
        }
    }

    function joinPath(base, leaf) {
        if (!leaf) {
            return base || '';
        }
        if (!base) {
            return leaf;
        }
        var trimmedBase = base.replace(/\+$/, '');
        var trimmedLeaf = leaf.replace(/^\+/, '');
        return trimmedBase + '/' + trimmedLeaf;
    }

    function normalizeStatus(value) {
        if (value === 'pass' || value === 'fail' || value === 'pending') {
            return value;
        }
        var text = (value || '').toString().toLowerCase();
        if (text === 'pass') {
            return 'pass';
        }
        if (text === 'fail') {
            return 'fail';
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

    function updateEffectStatus(effect, status) {
        var normalized = normalizeStatus(status);
        effect.setAttribute('data-status', normalized);
        var indicator = effect.querySelector('.status-indicator');
        if (indicator) {
            indicator.textContent = statusLabel(normalized);
        }
        var buttons = effect.querySelectorAll('.review-button');
        for (var i = 0; i < buttons.length; i += 1) {
            var button = buttons[i];
            var value = button.getAttribute('data-value');
            button.classList.toggle('selected', value === normalized);
        }
    }

    function recordStatusChange(effect, status) {
        if (!effect) {
            return;
        }
        var recordIndex = parseInt(effect.getAttribute('data-record-index'), 10);
        var slotIndex = parseInt(effect.getAttribute('data-slot'), 10);
        if (isNaN(recordIndex) || isNaN(slotIndex)) {
            return;
        }
        if (recordIndex < 0 || recordIndex >= recordsData.length) {
            return;
        }
        var record = recordsData[recordIndex];
        if (!record) {
            return;
        }
        var key = 'Effect' + slotIndex + 'Status';
        if (record[key] !== status) {
            record[key] = status;
            scheduleSave();
        }
    }

    function ensureLabelCoverage(records) {
        var maxSlot = labelSymbols.length;
        for (var i = 0; i < records.length; i += 1) {
            var record = records[i];
            if (!record || typeof record !== 'object') {
                continue;
            }
            for (var key in record) {
                if (!Object.prototype.hasOwnProperty.call(record, key)) {
                    continue;
                }
                var match = key.match(/^Effect(\d+)$/);
                if (match) {
                    var index = parseInt(match[1], 10);
                    if (!isNaN(index) && index > maxSlot) {
                        maxSlot = index;
                    }
                }
            }
        }
        for (var slot = labelSymbols.length + 1; slot <= maxSlot; slot += 1) {
            labelSymbols.push('Slot ' + slot);
        }
    }

    function createEffect(record, slotIndex, symbol, imageName, recordIndex) {
        var predictionValue = record['Effect' + slotIndex];
        var rawValue = record['RawText' + slotIndex];
        var scoreValue = record['Effect' + slotIndex + 'Score'];
        var statusValue = normalizeStatus(record['Effect' + slotIndex + 'Status']);

        var predictionText = predictionValue == null ? '' : String(predictionValue);
        var rawText = rawValue == null ? '' : String(rawValue);
        var hasContent = predictionText !== '' || rawText !== '' || (scoreValue !== null && scoreValue !== undefined);

        if (!hasContent) {
            return null;
        }

        var effect = document.createElement('div');
        effect.className = 'effect';
        effect.setAttribute('data-slot', String(slotIndex));
        effect.setAttribute('data-image', (imageName || '').toLowerCase());
        effect.setAttribute('data-pred', predictionText.toLowerCase());
        effect.setAttribute('data-raw', rawText.toLowerCase());
        effect.setAttribute('data-record-index', String(recordIndex));

        var header = document.createElement('div');
        header.className = 'effect-header';

        var labelSpan = document.createElement('span');
        labelSpan.className = 'effect-label';
        labelSpan.textContent = symbol;

        var scoreSpan = document.createElement('span');
        scoreSpan.className = 'effect-score';
        var numericScore = Number(scoreValue);
        if (!isNaN(numericScore)) {
            scoreSpan.textContent = '一致度 ' + numericScore.toFixed(1) + '%';
        } else {
            scoreSpan.textContent = '一致度 --';
        }

        header.appendChild(labelSpan);
        header.appendChild(scoreSpan);

        var predictionDiv = document.createElement('div');
        predictionDiv.className = 'prediction';
        predictionDiv.textContent = '推定: ' + predictionText;

        var rawDiv = document.createElement('div');
        rawDiv.className = 'raw';
        rawDiv.textContent = 'OCR: ' + rawText;

        var decision = document.createElement('div');
        decision.className = 'decision';

        var passButton = document.createElement('button');
        passButton.type = 'button';
        passButton.className = 'review-button pass';
        passButton.setAttribute('data-value', 'pass');
        passButton.textContent = '○ 合致';

        var failButton = document.createElement('button');
        failButton.type = 'button';
        failButton.className = 'review-button fail';
        failButton.setAttribute('data-value', 'fail');
        failButton.textContent = '× 不一致';

        var indicator = document.createElement('span');
        indicator.className = 'status-indicator';

        decision.appendChild(passButton);
        decision.appendChild(failButton);
        decision.appendChild(indicator);

        effect.appendChild(header);
        effect.appendChild(predictionDiv);
        effect.appendChild(rawDiv);
        effect.appendChild(decision);

        updateEffectStatus(effect, statusValue);
        return effect;
    }

    function buildGallery() {
        if (!gallery) {
            return;
        }
        gallery.innerHTML = '';
        items = [];

        for (var i = 0; i < recordsData.length; i += 1) {
            var record = recordsData[i];
            if (!record || typeof record !== 'object') {
                continue;
            }

            var imageName = record.Image == null ? '' : String(record.Image);
            var item = document.createElement('div');
            item.className = 'item';
            item.setAttribute('data-image', imageName.toLowerCase());

            var img = document.createElement('img');
            var imagePath = joinPath(imageDir, imageName);
            img.src = imagePath;
            img.alt = imageName;
            img.setAttribute('data-full', imagePath);
            img.setAttribute('tabindex', '0');

            var filename = document.createElement('div');
            filename.className = 'filename';
            filename.textContent = imageName;

            item.appendChild(img);
            item.appendChild(filename);

            var hasEffect = false;
            for (var slot = 0; slot < labelSymbols.length; slot += 1) {
                var effectElement = createEffect(record, slot + 1, labelSymbols[slot], imageName, i);
                if (effectElement) {
                    item.appendChild(effectElement);
                    hasEffect = true;
                }
            }

            if (!hasEffect) {
                var placeholder = document.createElement('p');
                placeholder.className = 'no-effect';
                placeholder.textContent = '効果情報がありません。';
                item.appendChild(placeholder);
            }

            gallery.appendChild(item);
            items.push(item);
            bindImage(img);
        }

        if (!items.length) {
            showStatus('表示できる結果がありません。', false);
        } else {
            clearStatus();
            applyFilters();
        }
    }

    function applyFilters() {
        var term = (searchInput && searchInput.value ? searchInput.value : '').trim().toLowerCase();
        var filterValue = filterSelect ? filterSelect.value : 'all';

        for (var i = 0; i < items.length; i += 1) {
            var item = items[i];
            var imageName = item.getAttribute('data-image') || '';
            var matchesSearch = term === '' || imageName.indexOf(term) !== -1;
            var matchesFilter = filterValue === 'all';

            var effects = item.querySelectorAll('.effect');
            for (var j = 0; j < effects.length; j += 1) {
                var effect = effects[j];
                if (!matchesSearch && term) {
                    var pred = effect.getAttribute('data-pred') || '';
                    var raw = effect.getAttribute('data-raw') || '';
                    if (pred.indexOf(term) !== -1 || raw.indexOf(term) !== -1) {
                        matchesSearch = true;
                    }
                }
                if (!matchesFilter && effect.getAttribute('data-status') === filterValue) {
                    matchesFilter = true;
                }
            }

            var visible = matchesSearch && matchesFilter;
            item.style.display = visible ? '' : 'none';
        }
    }

    function openLightbox(img) {
        if (!img || !lightbox || !lightboxImg) {
            return;
        }
        lightboxImg.src = img.getAttribute('data-full');
        lightboxImg.alt = img.alt || '';
        lightbox.classList.add('show');
        lightbox.setAttribute('aria-hidden', 'false');
        if (closeBtn) {
            closeBtn.focus();
        }
    }

    function closeLightbox() {
        if (!lightbox || !lightboxImg) {
            return;
        }
        lightbox.classList.remove('show');
        lightbox.setAttribute('aria-hidden', 'true');
        lightboxImg.src = '';
        lightboxImg.alt = '';
    }

    function bindImage(img) {
        if (!img) {
            return;
        }
        img.addEventListener('click', function () {
            openLightbox(img);
        });
        img.addEventListener('keydown', function (event) {
            var key = event.key || event.keyCode;
            if (key === 'Enter' || key === ' ' || key === 13 || key === 32) {
                event.preventDefault();
                openLightbox(img);
            }
        });
    }

    function tryLoadFromOpfs(defaultName) {
        if (!opfsState.supported) {
            return Promise.resolve(false);
        }
        var targetName = opfsState.fileName || defaultName;
        if (!targetName) {
            return Promise.resolve(false);
        }
        return ensureOpfsFileHandle(targetName, false)
            .then(function (handle) {
                return readFromHandle(handle).then(function (text) {
                    var data;
                    try {
                        data = JSON.parse(text);
                    } catch (error) {
                        console.warn('OPFSのJSON解析に失敗しました:', error);
                        return false;
                    }
                    opfsState.fileHandle = handle;
                    opfsState.fileName = targetName;
                    loadRecordsArray(data);
                    toggleExportVisibility(true);
                    clearStatus();
                    setStorageStatus('OPFSから読み込みました。', false);
                    return true;
                });
            })
            .catch(function (error) {
                if (error && (error.name === 'NotFoundError' || error.code === 8)) {
                    return false;
                }
                console.warn('OPFS読み込みに失敗しました:', error);
                return false;
            });
    }

    function prepareOpfsWithData(fileName) {
        if (!opfsState.supported) {
            return;
        }
        var targetName = fileName || opfsState.fileName || getFileNameFromPath(resultsPath) || 'results.json';
        ensureOpfsFileHandle(targetName, true)
            .then(function (handle) {
                opfsState.fileHandle = handle;
                opfsState.fileName = targetName;
                toggleExportVisibility(true);
                flushToOpfs();
            })
            .catch(function (error) {
                console.warn('OPFS初期化に失敗しました:', error);
                setStorageStatus('OPFS初期化に失敗しました: ' + (error && error.message ? error.message : error), true);
            });
    }

    function chooseJsonFile() {
        if (window.showOpenFilePicker) {
            return window.showOpenFilePicker({
                multiple: false,
                types: [
                    {
                        description: 'JSON Files',
                        accept: { 'application/json': ['.json'] }
                    }
                ]
            }).then(function (handles) {
                if (handles && handles.length) {
                    return handles[0];
                }
                throw new DOMException('ファイルが選択されませんでした', 'AbortError');
            });
        }

        return new Promise(function (resolve, reject) {
            var input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,application/json';
            input.style.display = 'none';

            var cleanup = function () {
                window.removeEventListener('focus', onFocus, true);
                if (input.parentNode) {
                    input.parentNode.removeChild(input);
                }
            };

            var onFocus = function () {
                setTimeout(function () {
                    if (!input.files || !input.files.length) {
                        cleanup();
                        reject(new DOMException('ユーザーがキャンセルしました', 'AbortError'));
                    }
                }, 0);
            };

            input.addEventListener('change', function () {
                if (input.files && input.files[0]) {
                    var file = input.files[0];
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
            return source.getFile().then(function (file) {
                return { file: file, handle: source };
            });
        }
        if (source instanceof File) {
            return Promise.resolve({ file: source, handle: null });
        }
        return Promise.reject(new Error('未知のファイルソースです'));
    }

    function handleImport() {
        chooseJsonFile()
            .then(function (source) {
                return toFilePayload(source);
            })
            .then(function (payload) {
                return payload.file.text().then(function (text) {
                    return {
                        text: text,
                        fileName: payload.file.name || getFileNameFromPath(resultsPath) || 'results.json',
                        handle: payload.handle
                    };
                });
            })
            .then(function (dataPayload) {
                var parsed;
                try {
                    parsed = JSON.parse(dataPayload.text);
                } catch (error) {
                    throw new Error('JSONの解析に失敗しました: ' + error.message);
                }

                loadRecordsArray(parsed);
                toggleExportVisibility(true);
                clearStatus();
                setStorageStatus('JSONを読み込みました。', false);

                if (!opfsState.supported) {
                    setStorageStatus('OPFS非対応ブラウザのため、自動保存は無効です。', true);
                    return;
                }

                var name = dataPayload.fileName || 'results.json';
                ensureOpfsFileHandle(name, true)
                    .then(function (handle) {
                        opfsState.fileHandle = handle;
                        opfsState.fileName = name;
                        flushToOpfs();
                    })
                    .catch(function (error) {
                        console.error('OPFS初期化に失敗しました:', error);
                        setStorageStatus('OPFS初期化に失敗しました: ' + (error && error.message ? error.message : error), true);
                    });
            })
            .catch(function (error) {
                if (error && (error.name === 'AbortError' || error.message === 'The user aborted a request.')) {
                    setStorageStatus('ファイル選択をキャンセルしました。', false);
                    return;
                }
                console.error('JSON取り込みに失敗しました:', error);
                setStorageStatus('読み込み失敗: ' + (error && error.message ? error.message : error), true);
            });
    }

    function handleExport() {
        if (!recordsData.length) {
            setStorageStatus('エクスポート可能なデータがありません。', true);
            return;
        }
        var text;
        try {
            text = JSON.stringify(recordsData, null, 2);
        } catch (error) {
            console.error('JSONの生成に失敗しました:', error);
            setStorageStatus('エクスポート失敗: JSON生成に失敗しました。', true);
            return;
        }
        var blob = new Blob([text], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = opfsState.fileName || getFileNameFromPath(resultsPath) || 'results.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setStorageStatus('JSONをダウンロードしました。', false);
    }

    function loadRecordsArray(data) {
        var records = [];
        if (Array.isArray(data)) {
            records = data;
        } else if (data && typeof data === 'object') {
            records = [data];
        }
        ensureLabelCoverage(records);
        recordsData = records;
        buildGallery();
    }

    function initialize() {
        var preferredName = getFileNameFromPath(resultsPath) || 'results.json';
        tryLoadFromOpfs(preferredName).then(function (loadedFromOpfs) {
            if (loadedFromOpfs) {
                return;
            }
            if (!resultsPath) {
                showStatus('JSONファイルを選択してください。', false);
                return;
            }
            showStatus('読み込み中...', false);
            fetch(resultsPath, { cache: 'no-cache' })
                .then(function (response) {
                    if (!response.ok) {
                        throw new Error('HTTP ' + response.status);
                    }
                    return response.json();
                })
                .then(function (data) {
                    loadRecordsArray(data);
                    clearStatus();
                    toggleExportVisibility(true);
                    if (opfsState.supported) {
                        prepareOpfsWithData(preferredName);
                    }
                })
                .catch(function (error) {
                    console.error('Failed to load JSON:', error);
                    showStatus('データの読み込みに失敗しました: ' + (error && error.message ? error.message : error) + '下の「JSONを選択」を使用してください。', true);
                });
        });
    }

    if (gallery) {
        gallery.addEventListener('click', function (event) {
            var target = event.target;
            if (target.classList.contains('review-button')) {
                var effect = target.closest('.effect');
                if (!effect) {
                    return;
                }
                var value = target.getAttribute('data-value');
                var current = effect.getAttribute('data-status') || 'pending';
                var next = current === value ? 'pending' : value;
                var normalized = normalizeStatus(next);
                updateEffectStatus(effect, normalized);
                recordStatusChange(effect, normalized);
                applyFilters();
            }
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', closeLightbox);
    }
    if (lightbox) {
        lightbox.addEventListener('click', function (event) {
            if (event.target === lightbox) {
                closeLightbox();
            }
        });
    }
    document.addEventListener('keydown', function (event) {
        if ((event.key === 'Escape' || event.keyCode === 27) && lightbox && lightbox.classList.contains('show')) {
            closeLightbox();
        }
    });

    if (searchInput) {
        searchInput.addEventListener('input', applyFilters);
    }
    if (filterSelect) {
        filterSelect.addEventListener('change', applyFilters);
    }
    if (importButton) {
        importButton.addEventListener('click', handleImport);
    }
    if (exportButton) {
        exportButton.addEventListener('click', handleExport);
    }

    initialize();
})();

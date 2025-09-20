import os
import html
import pandas as pd

# 設定
CSV_PATH = "results_input_video.csv"       # OCR結果CSV（動画ごとに出力されたファイル）
IMG_DIR = "crops/input_video"              # 画像ディレクトリ
OUTPUT_HTML = "viewer.html"                # 出力HTMLファイル名


def safe_text(value, quote=False):
    if pd.isna(value):
        value = ""
    return html.escape(str(value), quote=quote)


def format_score(score, source):
    try:
        score_float = float(score)
        display = f"{score_float:.1f}%"
        data = f"{score_float:.4f}"
    except (TypeError, ValueError):
        display = "--"
        data = ""
    if source == "feedback":
        display += " (フィードバック)"
    elif source == "error":
        display += " (エラー)"
    return display, data


def generate_html(csv_path, img_dir, output_html):
    if not os.path.exists(csv_path):
        print(f"[!] CSVが見つかりません: {csv_path}")
        return

    df = pd.read_csv(csv_path)

    parts = [
        """
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <title>OCR結果ギャラリー</title>
        <style>
            :root {
                color-scheme: light;
            }
            body { font-family: sans-serif; background: #f4f4f4; margin: 0; padding: 24px; }
            h1 { text-align: center; }
            .toolbar { max-width: 1100px; margin: 16px auto 24px; display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }
            .toolbar input[type=search], .toolbar select { padding: 8px 10px; border-radius: 6px; border: 1px solid #ccc; font-size: 14px; }
            .toolbar label { font-size: 13px; color: #555; display: flex; align-items: center; gap: 6px; }
            .gallery { display: flex; flex-wrap: wrap; gap: 16px; justify-content: center; }
            .item { background: #fff; padding: 14px; border: 1px solid #ccc; border-radius: 8px; width: 320px; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
            .item img { max-width: 280px; height: auto; border-radius: 4px; cursor: zoom-in; transition: transform 0.2s; align-self: center; }
            .item img:focus { outline: 2px solid #4c9aff; outline-offset: 2px; }
            .filename { font-weight: bold; font-size: 15px; text-align: center; }
            .effect { padding: 10px; border: 1px solid #eee; border-radius: 6px; background: #fafafa; display: flex; flex-direction: column; gap: 6px; }
            .effect-header { display: flex; justify-content: space-between; align-items: baseline; }
            .effect-label { font-weight: bold; }
            .effect-score { font-size: 12px; color: #555; }
            .prediction { font-size: 13px; }
            .raw { font-size: 12px; color: #666; word-break: break-all; }
            .decision { display: flex; gap: 8px; align-items: center; }
            .review-button { padding: 6px 10px; border: 1px solid #bbb; border-radius: 4px; background: #fff; cursor: pointer; font-size: 13px; }
            .review-button.pass.selected { background: #e0f7e7; border-color: #3bab64; color: #2a8b4d; }
            .review-button.fail.selected { background: #fde2e2; border-color: #d64545; color: #b83232; }
            .status-indicator { font-size: 12px; color: #555; }
            .lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: none; align-items: center; justify-content: center; z-index: 999; padding: 24px; }
            .lightbox.show { display: flex; }
            .lightbox img { max-width: 90vw; max-height: 90vh; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
            .lightbox button { position: absolute; top: 24px; right: 32px; color: #fff; font-size: 28px; background: transparent; border: none; cursor: pointer; }
            .lightbox button:focus { outline: 2px solid #fff; }
            .review-panel { margin: 32px auto 0; max-width: 1100px; background: #fff; padding: 24px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.08); }
            .review-panel h2 { margin-top: 0; text-align: center; }
            .review-panel p { font-size: 13px; color: #555; }
            .review-actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin: 16px 0; }
            .review-actions button { padding: 8px 16px; border-radius: 4px; border: none; cursor: pointer; font-size: 14px; background: #4c9aff; color: #fff; }
            .review-actions button.secondary { background: #777; }
            .review-actions button:disabled { background: #ccc; cursor: not-allowed; }
            table.review-table { width: 100%; border-collapse: collapse; font-size: 13px; }
            table.review-table th, table.review-table td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
            table.review-table th { background: #f5f5f5; }
            .no-reviews { text-align: center; color: #666; font-size: 13px; margin-top: 12px; }
        </style>
    </head>
    <body>
        <h1>OCR結果ギャラリー</h1>
        <div class="toolbar">
            <label>検索: <input type="search" id="search-input" placeholder="ファイル名・推定テキスト"></label>
            <label>表示:
                <select id="filter-status">
                    <option value="all">すべて</option>
                    <option value="pending">未レビュー</option>
                    <option value="pass">○のみ</option>
                    <option value="fail">×のみ</option>
                </select>
            </label>
            <label>並び順:
                <select id="sort-score">
                    <option value="desc">一致度が高い順</option>
                    <option value="asc">一致度が低い順</option>
                </select>
            </label>
        </div>
        <div class="gallery">
    """
    ]

    label_symbols = ["①", "②", "③"]

    for _, row in df.iterrows():
        image_file = row.get("Image", "")
        image_safe = safe_text(image_file, quote=True)
        image_display = safe_text(image_file)

        scores = []
        for idx in range(1, len(label_symbols) + 1):
            score_val = row.get(f"Effect{idx}Score", "")
            try:
                scores.append(float(score_val))
            except (TypeError, ValueError):
                scores.append(0.0)
        max_score = max(scores) if scores else 0.0

        parts.append(
            f"""
        <div class="item" data-image="{image_safe}" data-max-score="{max_score:.4f}">
            <img src="{img_dir}/{image_safe}" alt="{image_display}" data-full="{img_dir}/{image_safe}" tabindex="0">
            <div class="filename">{image_display}</div>
    """
        )

        for idx, symbol in enumerate(label_symbols, start=1):
            match_val = row.get(f"Effect{idx}", "")
            raw_val = row.get(f"RawText{idx}", "")
            score_val = row.get(f"Effect{idx}Score", "")
            source_val = row.get(f"Effect{idx}Source", "")

            match_display = safe_text(match_val)
            raw_display = safe_text(raw_val)
            match_data = safe_text(match_val, quote=True)
            raw_data = safe_text(raw_val, quote=True)
            score_display, score_data = format_score(score_val, source_val)
            source_data = safe_text(source_val, quote=True)

            parts.append(
                f"""
            <div class="effect" data-image="{image_safe}" data-slot="{idx}" data-status="pending" data-score="{score_data}" data-pred="{match_data}" data-raw="{raw_data}" data-source="{source_data}">
                <div class="effect-header">
                    <span class="effect-label">{symbol}</span>
                    <span class="effect-score">一致度: {score_display}</span>
                </div>
                <div class="prediction">推定: <strong>{match_display}</strong></div>
                <div class="raw">OCR: <code>{raw_display}</code></div>
                <div class="decision">
                    <button type="button" class="review-button pass" data-value="pass">○ 合致</button>
                    <button type="button" class="review-button fail" data-value="fail">× 不一致</button>
                    <span class="status-indicator">未レビュー</span>
                </div>
            </div>
    """
            )

        parts.append("        </div>")

    parts.append(
        """
        </div>
        <div class="lightbox" id="lightbox" role="dialog" aria-modal="true" aria-label="拡大画像">
            <button id="lightbox-close" aria-label="閉じる">×</button>
            <img src="" alt="">
        </div>
        <section class="review-panel">
            <h2>レビューフィードバック</h2>
            <p>各エフェクトに対して○/×を選択すると下の一覧に追加されます。結果はCSVでダウンロードでき、分析や辞書更新に利用できます。</p>
            <div class="review-actions">
                <button id="download-reviews" disabled>レビューCSVをダウンロード</button>
                <button id="clear-reviews" class="secondary" disabled>選択をリセット</button>
            </div>
            <div id="reviews-wrapper">
                <p class="no-reviews" id="reviews-info">レビューはまだ登録されていません。</p>
                <table class="review-table" id="reviews-table" style="display:none;">
                    <thead>
                        <tr><th>Image</th><th>Slot</th><th>Prediction</th><th>RawText</th><th>Score</th><th>Source</th><th>Status</th></tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        </section>
        <script>
            (function () {
                function $(selector, context) {
                    return (context || document).querySelector(selector);
                }

                function $all(selector, context) {
                    var nodeList = (context || document).querySelectorAll(selector);
                    return Array.prototype.slice.call(nodeList);
                }

                function getData(el, key) {
                    return el.getAttribute('data-' + key) || '';
                }

                function setData(el, key, value) {
                    el.setAttribute('data-' + key, value);
                }

                function toCsvValue(value) {
                    var text = value === undefined || value === null ? '' : String(value);
                    return '"' + text.replace(/"/g, '""') + '"';
                }

                var lightbox = $('#lightbox');
                var lightboxImg = lightbox.querySelector('img');
                var closeBtn = $('#lightbox-close');

                function openLightbox(img) {
                    if (!img) {
                        return;
                    }
                    lightboxImg.src = img.getAttribute('data-full');
                    lightboxImg.alt = img.alt || '';
                    lightbox.classList.add('show');
                    closeBtn.focus();
                }

                function closeLightbox() {
                    lightbox.classList.remove('show');
                    lightboxImg.src = '';
                    lightboxImg.alt = '';
                }

                var thumbs = $all('.item img');
                for (var i = 0; i < thumbs.length; i += 1) {
                    (function (img) {
                        img.addEventListener('click', function () {
                            openLightbox(img);
                        });
                        img.addEventListener('keydown', function (event) {
                            var key = event.key || event.keyCode;
                            if (key === 'Enter' || key === ' ' || key === 13 || key === 32) {
                                openLightbox(img);
                                event.preventDefault();
                            }
                        });
                    })(thumbs[i]);
                }

                closeBtn.addEventListener('click', closeLightbox);
                lightbox.addEventListener('click', function (event) {
                    if (event.target === lightbox) {
                        closeLightbox();
                    }
                });
                document.addEventListener('keydown', function (event) {
                    if ((event.key === 'Escape' || event.keyCode === 27) && lightbox.classList.contains('show')) {
                        closeLightbox();
                    }
                });

                var gallery = $('.gallery');
                var items = $all('.item');
                var searchInput = $('#search-input');
                var filterSelect = $('#filter-status');
                var sortSelect = $('#sort-score');

                var reviews = {};
                var reviewsTable = $('#reviews-table');
                var reviewsTableBody = reviewsTable.querySelector('tbody');
                var reviewsInfo = $('#reviews-info');
                var downloadBtn = $('#download-reviews');
                var clearBtn = $('#clear-reviews');

                function hasReviews() {
                    for (var key in reviews) {
                        if (Object.prototype.hasOwnProperty.call(reviews, key)) {
                            return true;
                        }
                    }
                    return false;
                }

                function forEachReview(callback) {
                    var index = 0;
                    for (var key in reviews) {
                        if (Object.prototype.hasOwnProperty.call(reviews, key)) {
                            callback(reviews[key], key, index);
                            index += 1;
                        }
                    }
                }

                function updateStatusIndicator(effect, status) {
                    var indicator = effect.querySelector('.status-indicator');
                    if (!indicator) {
                        return;
                    }
                    if (status === 'pass') {
                        indicator.textContent = '○ 確認済み';
                        indicator.style.color = '#2a8b4d';
                    } else if (status === 'fail') {
                        indicator.textContent = '× 要確認';
                        indicator.style.color = '#b83232';
                    } else {
                        indicator.textContent = '未レビュー';
                        indicator.style.color = '#555';
                    }
                }

                function renderReviews() {
                    reviewsTableBody.innerHTML = '';
                    if (!hasReviews()) {
                        reviewsInfo.style.display = 'block';
                        reviewsTable.style.display = 'none';
                        downloadBtn.disabled = true;
                        clearBtn.disabled = true;
                        return;
                    }

                    reviewsInfo.style.display = 'none';
                    reviewsTable.style.display = 'table';
                    downloadBtn.disabled = false;
                    clearBtn.disabled = false;

                    forEachReview(function (entry) {
                        var row = document.createElement('tr');
                        var columns = ['Image', 'Slot', 'Prediction', 'RawText', 'Score', 'Source', 'Status'];
                        for (var i = 0; i < columns.length; i += 1) {
                            var cell = document.createElement('td');
                            var key = columns[i];
                            cell.textContent = entry[key] || '';
                            row.appendChild(cell);
                        }
                        reviewsTableBody.appendChild(row);
                    });
                }

                function applyFiltersAndSort() {
                    var searchValue = (searchInput.value || '').trim().toLowerCase();
                    var filterValue = filterSelect.value;
                    var sortValue = sortSelect.value;

                    var sortedItems = items.slice();
                    sortedItems.sort(function (a, b) {
                        var scoreA = parseFloat(a.getAttribute('data-max-score') || '0');
                        var scoreB = parseFloat(b.getAttribute('data-max-score') || '0');
                        if (sortValue === 'asc') {
                            return scoreA - scoreB;
                        }
                        return scoreB - scoreA;
                    });
                    for (var i = 0; i < sortedItems.length; i += 1) {
                        gallery.appendChild(sortedItems[i]);
                    }

                    for (var j = 0; j < sortedItems.length; j += 1) {
                        var item = sortedItems[j];
                        var imageName = (item.getAttribute('data-image') || '').toLowerCase();
                        var effects = $all('.effect', item);
                        var effectTexts = [];
                        var effectStatuses = [];
                        for (var k = 0; k < effects.length; k += 1) {
                            effectTexts.push((getData(effects[k], 'pred') || '').toLowerCase());
                            effectStatuses.push(getData(effects[k], 'status') || 'pending');
                        }
                        var matchesSearch = !searchValue;
                        if (!matchesSearch) {
                            if (imageName.indexOf(searchValue) !== -1) {
                                matchesSearch = true;
                            } else {
                                for (var m = 0; m < effectTexts.length; m += 1) {
                                    if (effectTexts[m].indexOf(searchValue) !== -1) {
                                        matchesSearch = true;
                                        break;
                                    }
                                }
                            }
                        }

                        var matchesFilter = true;
                        if (filterValue === 'pending') {
                            matchesFilter = effectStatuses.indexOf('pending') !== -1;
                        } else if (filterValue === 'pass') {
                            matchesFilter = effectStatuses.indexOf('pass') !== -1;
                        } else if (filterValue === 'fail') {
                            matchesFilter = effectStatuses.indexOf('fail') !== -1;
                        }

                        item.style.display = matchesSearch && matchesFilter ? '' : 'none';
                    }
                }

                function updateReviewEntry(effect) {
                    var status = getData(effect, 'status') || 'pending';
                    var key = getData(effect, 'image') + '::' + getData(effect, 'slot');
                    if (status === 'pending') {
                        delete reviews[key];
                    } else {
                        reviews[key] = {
                            Image: getData(effect, 'image'),
                            Slot: getData(effect, 'slot'),
                            Prediction: getData(effect, 'pred'),
                            RawText: getData(effect, 'raw'),
                            Score: getData(effect, 'score'),
                            Source: getData(effect, 'source'),
                            Status: status
                        };
                    }
                    renderReviews();
                    applyFiltersAndSort();
                }

                function handleDecisionClick(event) {
                    var button = event.target;
                    while (button && !button.classList.contains('review-button')) {
                        button = button.parentNode;
                    }
                    if (!button) {
                        return;
                    }
                    var effect = button;
                    while (effect && !effect.classList.contains('effect')) {
                        effect = effect.parentNode;
                    }
                    if (!effect) {
                        return;
                    }

                    var value = button.getAttribute('data-value');
                    var current = getData(effect, 'status') || 'pending';
                    var buttons = $all('.review-button', effect);

                    if (current === value) {
                        setData(effect, 'status', 'pending');
                        for (var i = 0; i < buttons.length; i += 1) {
                            buttons[i].classList.remove('selected');
                        }
                    } else {
                        setData(effect, 'status', value);
                        for (var j = 0; j < buttons.length; j += 1) {
                            buttons[j].classList.toggle('selected', buttons[j].getAttribute('data-value') == value);
                        }
                    }
                    updateStatusIndicator(effect, getData(effect, 'status'));
                    updateReviewEntry(effect);
                }

                var effects = $all('.effect');
                for (var n = 0; n < effects.length; n += 1) {
                    effects[n].addEventListener('click', handleDecisionClick);
                }

                searchInput.addEventListener('input', applyFiltersAndSort);
                filterSelect.addEventListener('change', applyFiltersAndSort);
                sortSelect.addEventListener('change', applyFiltersAndSort);

                downloadBtn.addEventListener('click', function () {
                    if (!hasReviews()) {
                        alert('レビューがありません');
                        return;
                    }
                    var headers = ['Image', 'Slot', 'Prediction', 'RawText', 'Score', 'Source', 'Status'];
                    var rows = [headers.map(toCsvValue).join(',')];
                    forEachReview(function (entry) {
                        rows.push(headers.map(function (key) {
                            return toCsvValue(entry[key]);
                        }).join(','));
                    });
                    var blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
                    var stamp = new Date().toISOString().replace(/[:.]/g, '-');
                    var fileName = 'reviews_' + stamp + '.csv';
                    var link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = fileName;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    setTimeout(function () {
                        URL.revokeObjectURL(link.href);
                    }, 1000);
                });

                clearBtn.addEventListener('click', function () {
                    reviews = {};
                    var allEffects = $all('.effect');
                    for (var i = 0; i < allEffects.length; i += 1) {
                        setData(allEffects[i], 'status', 'pending');
                        updateStatusIndicator(allEffects[i], 'pending');
                        var innerButtons = $all('.review-button', allEffects[i]);
                        for (var j = 0; j < innerButtons.length; j += 1) {
                            innerButtons[j].classList.remove('selected');
                        }
                    }
                    renderReviews();
                    applyFiltersAndSort();
                });

                renderReviews();
                applyFiltersAndSort();
            })();
        </script>
    </body>
    </html>
    """
    )

    html_output = "".join(parts)
    with open(output_html, "w", encoding="utf-8") as f:
        f.write(html_output)

    print(f"[✓] {output_html} を生成しました！ ブラウザで開いてください。")


if __name__ == "__main__":
    generate_html(CSV_PATH, IMG_DIR, OUTPUT_HTML)

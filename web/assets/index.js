const msToRelativeTime = (ms) => {
    const secs = Math.round(ms / 1000);
    if (secs < 180) return 'moments';
    const mins = Math.round(secs / 60);
    if (mins < 120) return `${mins} minutes`;
    const hours = Math.round(mins / 60);
    if (hours < 48) return `${hours} hours`;
    const days = Math.round(hours / 24);
    if (days < 14) return `${days} days`;
    const weeks = Math.round(days / 7);
    if (weeks < 12) return `${weeks} weeks`;
    const months = Math.round(days / 30.4369);
    if (months < 24) return `${months} months`;
    const years = Math.round(days / 365.2422);
    return `${years} years`;
};

const secsToTimestamp = secs => {
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const seconds = Math.floor(secs % 60);
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

// Function to round a number to a specified number of decimal places
// but remove trailing zeros and convert to integer if possible
const roundSmart = (num, maxDecimals = 2) => {
    let fixed = num.toFixed(maxDecimals);
    fixed = fixed.replace(/\.?0+$/, '').replace(/\.$/, '');
    return parseFloat(fixed);
};

// Function to round a number based on its size
const toFixedSmart = (num) => {
    if (num < 1)
        return parseFloat(num.toFixed(3));
    if (num < 10)
        return parseFloat(num.toFixed(2));
    if (num < 100)
        return parseFloat(num.toFixed(1));
    return parseFloat(num.toFixed(0));
};

// Function to format bytes into a human-readable string
const formatBytes = bytes => {
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
        bytes /= 1024;
        i++;
    }
    return `${toFixedSmart(bytes)} ${units[i]}`;
};

const showModal = (options) => {
    options = options || {};
    options.title = options.title || '';
    options.bodyHTML = options.bodyHTML || '';
    options.actions = options.actions || [];
    options.cancellable = options.cancellable === false ? false : true;
    const elModal = document.createElement('dialog');
    elModal.classList.add('modal');
    elModal.innerHTML = /*html*/`
        <div class="content">
            <div class="scrollable">
                <div class="title">${options.title}</div>
                <div class="body">${options.bodyHTML}</div>
            </div>
            <div class="actions"></div>
        </div>
    `;
    const elContent = elModal.querySelector('.content');
    const elScrollable = elModal.querySelector('.scrollable');
    if (options.icon) {
        elScrollable.insertAdjacentHTML('afterbegin', /*html*/`
            <div class="icon">${options.icon}</div>
        `);
    }
    const elActions = elModal.querySelector('.actions');
    for (const action of options.actions) {
        const elButton = document.createElement('button');
        elButton.classList.add('btn', action.class);
        elButton.innerText = action.label;
        elButton.disabled = action.disabled || false;
        elButton.onclick = async () => {
            const btns = elActions.querySelectorAll('button');
            for (const btn of btns) {
                btn.disabled = true;
            }
            if (action.onClick) await action.onClick();
            if (action.close !== false) elModal.close();
        };
        elActions.appendChild(elButton);
    }
    elContent.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    elModal.addEventListener('click', () => {
        elModal.dispatchEvent(new Event('cancel'));
    });
    elModal.addEventListener('cancel', (e) => {
        e.preventDefault();
        if (options.cancellable) {
            if (options.onCancel) options.onCancel();
            elModal.close();
        }
    });
    elModal.addEventListener('close', () => {
        if (options.onClose) options.onClose();
        if (!elModal.classList.contains('visible')) return;
        elModal.showModal();
        elModal.classList.remove('visible');
        setTimeout(() => {
            elModal.remove();
        }, 300);
    });
    elModal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!options.cancellable)
                e.preventDefault();
        }
    });
    document.body.appendChild(elModal);
    elModal.showModal();
    setTimeout(() => elModal.classList.add('visible'), 10);
    return elModal;
};

const starGradientPoints = [
    { stars: 0, color: [128, 128, 128] },
    { stars: 0.0999, color: [128, 128, 128] },
    { stars: 0.1, color: [64, 146, 250] },
    { stars: 2, color: [78, 255, 214] },
    { stars: 2.5, color: [121, 255, 88] },
    { stars: 3.3, color: [245, 240, 92] },
    { stars: 4, color: [250, 156, 104] },
    { stars: 5, color: [246, 79, 120] },
    { stars: 6, color: [179, 76, 193] },
    { stars: 6.7, color: [99, 98, 220] },
    { stars: 9, color: [0, 0, 0] }
];

const starsToColor = stars => {
    if (stars < 0) stars = 0;
    if (stars > 9) stars = 9;
    for (let i = 0; i < starGradientPoints.length - 1; i++) {
        const pointA = starGradientPoints[i];
        const pointB = starGradientPoints[i + 1];
        if (stars >= pointA.stars && stars <= pointB.stars) {
            const ratio = (stars - pointA.stars) / (pointB.stars - pointA.stars);
            const r = Math.round(pointA.color[0] + ratio * (pointB.color[0] - pointA.color[0]));
            const g = Math.round(pointA.color[1] + ratio * (pointB.color[1] - pointA.color[1]));
            const b = Math.round(pointA.color[2] + ratio * (pointB.color[2] - pointA.color[2]));
            return `rgb(${r}, ${g}, ${b})`;
        }
    }
    return 'rgb(128, 128, 128)';
};

const isElementOverflowing = (el) => {
    const styles = window.getComputedStyle(el);
    return (
        styles.overflow === 'hidden' &&
        styles.textOverflow === 'ellipsis' &&
        styles.whiteSpace === 'nowrap' &&
        el.scrollWidth > el.clientWidth
    );
};

const elSearchCard = document.querySelector('#search');
const elSearchScroller = document.querySelector('#search .scroller');
const elSearchSticky = document.querySelector('#searchTop');
const inputQuery = document.querySelector('#inputQuery');
const btnAdvancedFilters = document.querySelector('#advancedFilters');
const elSearchStatus = document.querySelector('#searchStatus');
const elSearchResults = document.querySelector('#results');
const elResultsHeader = document.querySelector('#resultsHeader');
const elResultsFooter = document.querySelector('#resultsFooter');
const elSelectionScroller = document.querySelector('#selection .scroller');
const elSelectionTopbar = document.querySelector('#selection .topbar');

const options = {
    preferVidDownloads: window.localStorage.getItem('preferVidDownloads') !== 'false' ? 'true' : 'false',
    sort: 'ranked',
    order: 'desc'
};

let forceNextSort = false;
let cursor = {
    next: null,
    current: null,
    prev: []
};
let searchTimeout;

const qs = new URLSearchParams(window.location.search);
const qsApply = () => {
    window.history.replaceState({}, '', '?' + qs.toString());
};

const getResultMapsetElement = (mapset) => {
    const el = document.createElement('button');
    el.className = 'entry';
    el.innerHTML = /*html*/`
        <div class="info">
            <div class="cover">
                <div class="details">
                    <div class="song">
                        <div class="titleCont">
                            <div class="title" data-tooltip-overflow="true"></div>
                        </div>
                        <div class="artist" data-tooltip-overflow="true"></div>
                    </div>
                    <div class="extra">
                        <div class="mapperCont">
                            Mapped by <span class="mapper"></span>
                        </div>
                        <div class="rankedTime">
                            Ranked <span class="rankedTimeRel"></span> ago
                        </div>
                    </div>
                </div>
            </div>
            <div class="diffs">
                <div>
                    <div class="badge"></div>
                </div>
            </div>
        </div>
        <div class="controls">
            <a href="osu://s/${mapset.id}" class="btn transparent square" title="Open with osu!direct">
                <span class="icon">rocket_launch</span>
            </a>
            <a href="/files/beatmapsets/${mapset.id}${options.preferVidDownloads === 'true' ? '?video=true' : ''}" download class="btn transparent square" title="Download map">
                <span class="icon">download</span>
            </a>
        </div>
    `;
    // Stop buttons from showing full mapset
    const anchors = el.querySelectorAll('a');
    for (const anchor of anchors) {
        anchor.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
    // Get elements
    const cover = el.querySelector('.cover');
    const badge = el.querySelector('.badge');
    const titleCont = el.querySelector('.titleCont');
    const title = el.querySelector('.title');
    const artist = el.querySelector('.artist');
    const mapper = el.querySelector('.mapper');
    const rankedTimeRel = el.querySelector('.rankedTimeRel');
    const diffsContainer = el.querySelector('.diffs');
    // Fill basic information
    cover.style.backgroundImage = `url(/files/beatmapsets/backgrounds/card/${mapset.id}.jpg)`;
    title.innerText = mapset.title;
    title.title = mapset.title;
    if (mapset.is_nsfw) {
        const elBadge = document.createElement('div');
        elBadge.className = 'badge nsfw';
        elBadge.innerText = 'Explicit';
        titleCont.appendChild(elBadge);
    }
    artist.innerText = mapset.artist || 'Unknown artist';
    artist.title = mapset.artist || 'Unknown artist';
    mapper.innerText = mapset.mapper;
    const rankedDate = new Date(mapset.date_ranked);
    const rankedTs = rankedDate.getTime();
    const msDiff = Date.now() - rankedTs;
    rankedTimeRel.innerText = msToRelativeTime(msDiff);
    rankedTimeRel.title = rankedDate.toLocaleString();
    // Fill difficulty information
    badge.classList.add(mapset.status);
    badge.innerText = mapset.status.toUpperCase();
    const diffsByMode = {
        osu: [], mania: [], taiko: [], fruits: []
    };
    for (const map of mapset.beatmaps) {
        diffsByMode[map.mode].push(map);
    }
    for (const [mode, diffs] of Object.entries(diffsByMode)) {
        if (diffs.length === 0) continue;
        const elMode = document.createElement('div');
        elMode.classList.add('mode');
        elMode.innerHTML = /*html*/`
            <img src="/assets/ruleset-icons/${mode}.svg" alt="Ruleset icon for ${mode}" class="icon">
        `;
        if (mapset.beatmaps.length > 18) {
            elMode.innerHTML += `<span class="count">${diffs.length}</span>`;
        } else {
            elMode.innerHTML += `<div class="chips"></div>`;
            const elChips = elMode.querySelector('.chips');
            for (const diff of diffs) {
                const elChip = document.createElement('span');
                elChip.className = 'chip';
                elChip.style.backgroundColor = starsToColor(diff.stars);
                elChip.title = `${diff.stars.toFixed(2)}★ - ${diff.name}`;
                elChips.appendChild(elChip);
            }
        }
        diffsContainer.appendChild(elMode);
    }
    return el;
};

const showSelection = mapset => {
    // Get elements
    const elSelection = document.querySelector('#selection');
    const btnClose = elSelection.querySelector('#closeSelection');
    const elCover = elSelection.querySelector('.cover');
    const elTitle = elCover.querySelector('.title');
    const elBadge = elCover.querySelector('.badge');
    const elArtist = elCover.querySelector('.artist');
    const elMapper = elCover.querySelector('.mapper');
    const elDateRanked = elCover.querySelector('.dateRanked');
    const elDateSubmitted = elCover.querySelector('.dateSubmitted');
    const btnDownload = elCover.querySelector('#selectedMapDownload');
    const btnDownloadNoVideo = elCover.querySelector('#selectedMapDownloadNoVideo');
    const btnDownloadVideo = elCover.querySelector('#selectedMapDownloadVideo');
    const btnOpen = elCover.querySelector('#selectedMapOpen');
    const btnDirect = elCover.querySelector('#selectedMapDirect');
    const elModesCont = elSelection.querySelector('.modes');
    // Fill elements
    elCover.style.backgroundImage = `url(/files/beatmapsets/backgrounds/cover/${mapset.id}.jpg)`;
    elTitle.innerText = mapset.title;
    elBadge.classList.add(mapset.status);
    elBadge.innerText = mapset.status.toUpperCase();
    elArtist.innerText = mapset.artist || 'Unknown artist';
    elMapper.innerText = mapset.mapper;
    elDateRanked.innerText = dayjs(mapset.date_ranked).format('YYYY-MM-DD');
    elDateRanked.title = new Date(mapset.date_ranked).toLocaleString();
    elDateSubmitted.innerText = dayjs(mapset.date_submitted).format('YYYY-MM-DD');
    elDateSubmitted.title = new Date(mapset.date_submitted).toLocaleString();
    btnDownload.style.display = mapset.has_video ? 'none' : '';
    btnDownloadVideo.style.display = mapset.has_video ? '' : 'none';
    btnDownloadNoVideo.style.display = mapset.has_video ? '' : 'none';
    if (mapset.has_video) {
        btnDownloadVideo.href = `/files/beatmapsets/${mapset.id}?video=true`;
        btnDownloadNoVideo.href = `/files/beatmapsets/${mapset.id}`;
    } else {
        btnDownload.href = `/files/beatmapsets/${mapset.id}`;
    }
    btnOpen.href = `https://osu.ppy.sh/beatmapsets/${mapset.id}`;
    btnDirect.href = `osu://s/${mapset.id}`;
    // Render difficulties
    const diffsByMode = {
        osu: [], mania: [], taiko: [], fruits: []
    };
    for (const map of mapset.beatmaps) {
        diffsByMode[map.mode].push(map);
    }
    elModesCont.innerHTML = '';
    for (const mode in diffsByMode) {
        const diffs = diffsByMode[mode];
        if (diffs.length === 0) continue;
        const elMode = document.createElement('div');
        elMode.classList.add('mode');
        let modeName = mode;
        switch (mode) {
            case 'osu':
                modeName = 'osu!standard';
                break;
            case 'mania':
                modeName = 'osu!mania';
                break;
            case 'taiko':
                modeName = 'osu!taiko';
                break;
            case 'fruits':
                modeName = 'osu!catch';
                break;
        }
        elMode.innerHTML = /*html*/`
            <div class="header">${modeName}</div>
            <div class="diffs"></div>
        `;
        const elDiffs = elMode.querySelector('.diffs');
        for (const diff of diffs) {
            const elDiff = document.createElement('div');
            elDiff.className = 'diff';
            const color = starsToColor(diff.stars);
            const textColor = diff.stars >= 6.7 ? 'var(--c-text-gold)' : 'black';
            elDiff.innerHTML = /*html*/`
                <img src="/assets/ruleset-icons/${mode}.svg" class="icon" alt="${mode} icon" style="background-color: ${color}">
                <div class="info">
                    <div>
                        <div class="badge" style="background-color: ${color}; color: ${textColor}">
                            <span class="star">star</span> ${diff.stars.toFixed(2)}
                        </div>
                    </div>
                    <div class="name"></div>
                    <div class="row">
                        <div class="attrib">
                            <div class="name">Length</div>
                            <div class="value">${secsToTimestamp(diff.length_secs)}</div>
                        </div>
                        <div class="attrib">
                            <div class="name">BPM</div>
                            <div class="value">${roundSmart(diff.bpm)}</div>
                        </div>
                        <div class="attrib">
                            <div class="name">CS</div>
                            <div class="value">${roundSmart(diff.cs)}</div>
                        </div>
                        <div class="attrib">
                            <div class="name">AR</div>
                            <div class="value">${roundSmart(diff.ar)}</div>
                        </div>
                        <div class="attrib">
                            <div class="name">OD</div>
                            <div class="value">${roundSmart(diff.od)}</div>
                        </div>
                        <div class="attrib">
                            <div class="name">HP</div>
                            <div class="value">${roundSmart(diff.hp)}</div>
                        </div>
                    </div>
                    <div class="row">
                        <div class="attrib">
                            <div class="name">Circles</div>
                            <div class="value">${diff.count_circles.toLocaleString()}</div>
                        </div>
                        <div class="attrib">
                            <div class="name">Sliders</div>
                            <div class="value">${diff.count_sliders.toLocaleString()}</div>
                        </div>
                        <div class="attrib">
                            <div class="name">Spinners</div>
                            <div class="value">${diff.count_spinners.toLocaleString()}</div>
                        </div>
                        <div class="attrib">
                            <div class="name">Max nomod pp</div>
                            <div class="value">${Math.round(diff.max_pp.nomod)}</div>
                        </div>
                    </div>
                </div>
            `;
            const elName = elDiff.querySelector('.name');
            elName.innerText = diff.name;
            elDiffs.appendChild(elDiff);
        }
        elModesCont.appendChild(elMode);
    }
    // Show
    elSelection.style.display = '';
    setTimeout(() => {
        elSelection.classList.add('visible');
    }, 10);
    // Hide
    btnClose.addEventListener('click', () => {
        elSelection.classList.remove('visible');
        setTimeout(() => {
            elSelection.style.display = 'none';
        }, 300);
    });
};

const refreshSearch = async (debounce = false) => {
    clearTimeout(searchTimeout);
    elSearchCard.classList.add('loading');
    elSearchStatus.innerText = `Searching...`;
    searchTimeout = setTimeout(async () => {
        // Fetch data
        const params = new URLSearchParams();
        const query = qs.get('q') || '';
        const limit = 120;
        params.set('query', query);
        params.set('limit', limit);
        params.set('page', parseInt(qs.get('p')) || 1);
        // Combine sort and order
        const sortParam = `${options.sort}_${options.order}`;
        params.set('sort', sortParam);
        if (cursor.current)
            params.set('cursor', cursor.current);
        if (forceNextSort)
            params.set('sort_force', 'true');
        forceNextSort = false;
        const results = await axios.get(`/api/beatmapsets/query?${params.toString()}`);
        console.log(results.data);
        // Update sort
        if (results.data.query.sort.startsWith('relevancy')) {
            forceNextSort = true;
        }
        updateOption('sort', results.data.query.sort, false);
        // Update cursor
        cursor.next = results.data.cursor;
        // Clear previous results
        elSearchResults.innerHTML = '';
        elResultsHeader.innerHTML = '';
        elResultsFooter.innerHTML = '';
        elSearchCard.classList.add('visible');
        // Update status
        elSearchStatus.innerText = `${results.data.stats.total_count.toLocaleString()} matches found in ${results.data.stats.process_time}ms`;
        // Show no results message
        if (results.data.stats.total_count === 0) {
            elSearchResults.innerHTML = /*html*/``;
            elSearchCard.classList.remove('loading');
            return;
        }
        // Add download all button to header
        const totalMaps = results.data.stats.total_count;
        const totalSize = results.data.stats[options.preferVidDownloads === 'true' ? 'total_file_size_video' : 'total_file_size_novideo'];
        elResultsHeader.innerHTML = /*html*/`
            <button id="downloadAll" class="btn alt" title="Download all beatmaps matching your search">
                <span class="icon">download</span>
                <span class="label">Download all results...</span>
            </button>
        `;
        const btnDownloadAll = document.querySelector('#downloadAll');
        btnDownloadAll.addEventListener('click', () => {
            showModal({
                icon: 'help',
                title: 'Are you sure?',
                bodyHTML: /*html*/`
                    <p>You're about to download a <b>${formatBytes(totalSize)}</b> ZIP file containing <b>${totalMaps.toLocaleString()} beatmapsets</b>. Are you sure you want to continue?</p>
                `,
                actions: [
                    {
                        label: `I'm sure, start the download!`,
                        onClick: () => {
                            let cancelled = false;
                            const modalCaptcha = showModal({
                                icon: 'smart_toy',
                                title: 'Checking your humanity',
                                bodyHTML: /*html*/`
                                    <div class="turnstile"></div>
                                `,
                                actions: [{
                                    label: 'Cancel',
                                    class: 'alt',
                                    onClick: () => cancelled = true
                                }],
                                cancellable: false
                            });
                            const elTurnstile = document.querySelector('.turnstile');
                            turnstile.render(elTurnstile, {
                                sitekey: `0x4AAAAAABTtr_wc0iFaH4kf`,
                                theme: 'dark',
                                callback: token => {
                                    if (cancelled) return;
                                    modalCaptcha.close();
                                    const url = `/files/beatmapsets/zip/query?query=${encodeURIComponent(query)}&token=${token}`;
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = ``;
                                    a.click();
                                }
                            });
                        }
                    },
                    {
                        label: `No I changed my mind!`,
                        class: 'alt'
                    }
                ]
            });
        });
        // Create nav and add it to header and footer
        const page = cursor.prev.length + 1;
        const totalPages = Math.ceil(totalMaps / limit);
        const elNav = document.createElement('div');
        elNav.className = 'nav';
        elNav.innerHTML = /*html*/`
            <button id="prevPage" class="btn transparent" title="Previous page" ${page == 1 ? 'disabled' : ''}>
                <span class="icon">chevron_left</span>
                <span class="label">Back</span>
            </button>
            <span class="progress">Page ${page} of ${totalPages}</span>
            <button id="nextPage" class="btn transparent" title="Next page" ${page == totalPages ? 'disabled' : ''}>
                <span class="label">Next</span>
                <span class="icon">chevron_right</span>
            </button>
        `;
        const elNavHeader = elResultsHeader.appendChild(elNav.cloneNode(true));
        const elNavFooter = elResultsFooter.appendChild(elNav.cloneNode(true));
        for (const elNav of [elNavHeader, elNavFooter]) {
            const btnNavPrev = elNav.querySelector('#prevPage');
            const btnNavNext = elNav.querySelector('#nextPage');
            btnNavPrev.addEventListener('click', () => {
                searchPagePrev();
                refreshSearch(true);
            });
            btnNavNext.addEventListener('click', () => {
                searchPageNext();
                refreshSearch(true);
            });
        }
        // Add new results
        for (const mapset of results.data.beatmapsets) {
            const el = getResultMapsetElement(mapset);
            el.addEventListener('click', () => showSelection(mapset));
            elSearchResults.appendChild(el);
        }
        elSearchCard.classList.remove('loading');
    }, debounce ? 0 : 500);
};

const searchPageNext = () => {
    cursor.prev.push(cursor.current);
    cursor.current = cursor.next;
    cursor.next = null;
};

const searchPagePrev = () => {
    if (cursor.prev.length === 0) return;
    cursor.current = cursor.prev.pop();
    cursor.next = null;
};

const searchPageReset = () => {
    cursor.prev = [];
    cursor.current = null;
    cursor.next = null;
};

const updateOption = (key, value, refresh = true) => {
    value = value.toString();
    if (key === 'sort') {
        let newSort, newOrder;
        if (value.match(/_(asc|desc)$/)) {
            const parts = value.split('_');
            newOrder = parts.pop();
            newSort = parts.join('_');
        } else {
            const descSorts = ['ranked', 'playcount', 'playcount_weekly', 'relevance'];
            newSort = value;
            newOrder = descSorts.includes(newSort) ? 'desc' : 'asc';
        }
        options.sort = newSort;
        options.order = newOrder;
        // Update UI for sort buttons
        const elsSort = document.querySelectorAll(`[data-opt-name="sort"]`);
        for (const el of elsSort) {
            if (el.dataset.optValue === newSort)
                el.classList.remove('transparent');
            else
                el.classList.add('transparent');
        }
        // Update UI for order buttons
        const elsOrder = document.querySelectorAll(`[data-opt-name="order"]`);
        for (const el of elsOrder) {
            if (el.dataset.optValue === newOrder)
                el.classList.remove('transparent');
            else
                el.classList.add('transparent');
        }
    } else {
        const els = document.querySelectorAll(`[data-opt-name="${key}"]`);
        if (!els.length) return;
        for (const el of els) {
            const elValue = el.dataset.optValue;
            if (elValue === undefined) continue;
            if (elValue === value) {
                options[key] = value;
                if (key === 'preferVidDownloads')
                    window.localStorage.setItem('preferVidDownloads', value);
                el.classList.remove('transparent');
            } else {
                el.classList.add('transparent');
            }
        }
    }

    if (refresh) {
        searchPageReset();
        refreshSearch();
    }
};

const initOptions = () => {
    for (let [key, defaultValue] of Object.entries(options)) {
        const els = document.querySelectorAll(`[data-opt-name="${key}"]`);
        if (!els.length) continue;
        for (const el of els) {
            const elValue = el.dataset.optValue;
            if (elValue === undefined) continue;
            el.addEventListener('click', (e) => {
                updateOption(key, elValue);
            });
            if (defaultValue.toString() === elValue) {
                updateOption(key, elValue, false);
            }
        }
    }
};

initOptions();

refreshSearch(true);

inputQuery.addEventListener('input', (e) => {
    const value = e.target.value.trim();
    if (value.length === 0) {
        qs.delete('q');
    } else {
        qs.set('q', value);
    }
    qsApply();
    searchPageReset();
    refreshSearch();
});
inputQuery.value = qs.get('q') || '';

btnAdvancedFilters.addEventListener('click', async () => {
    const res = await axios.get('/assets/filter-guide.md');
    const md = res.data;
    const html = marked.parse(md);
    const modal = showModal({
        title: 'Advanced filtering',
        icon: 'filter_alt',
        bodyHTML: html,
        actions: [
            { label: 'Okay' }
        ]
    });
    const elContent = modal.querySelector('.content');
    const elBody = modal.querySelector('.body');
    elContent.style.maxWidth = '800px';
    elBody.style.textAlign = 'left';
});

elSearchScroller.addEventListener('scroll', () => {
    if (elSearchScroller.scrollTop > 0) {
        elSearchSticky.classList.add('scrolled');
    } else {
        elSearchSticky.classList.remove('scrolled');
    }
});

elSelectionScroller.addEventListener('scroll', () => {
    if (elSelectionScroller.scrollTop > 0) {
        elSelectionTopbar.classList.add('scrolled');
    } else {
        elSelectionTopbar.classList.remove('scrolled');
    }
});

document.querySelector('#dmca').addEventListener('click', () => {
    showModal({
        title: 'Request content removal',
        icon: 'report',
        bodyHTML: /*html*/`
            <p>If you own the rights to content hosted on this site, please send an email to <b>dmca@osudl.org</b> and we'll sort it out.</p>
        `,
        actions: [
            { label: 'Okay' }
        ]
    });
});

let tooltip;
let currentTooltipElement;

document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[title]');
    if (!el || el === currentTooltipElement) return;

    if (currentTooltipElement && currentTooltipElement.contains(el)) {
        // Prevent flickering when moving over child elements
        return;
    }

    currentTooltipElement = el;

    const titleText = el.getAttribute('title');
    const tooltipHtml = el.dataset.tooltipHtml;
    el.setAttribute('data-title', titleText);
    el.removeAttribute('title');
    const onlyShowOnOverflow = el.dataset.tooltipOverflow === 'true';
    const isOverflowing = isElementOverflowing(el);
    if (onlyShowOnOverflow && !isOverflowing) return;

    tooltip = document.createElement('div');
    tooltip.className = 'custom-tooltip';
    if (tooltipHtml)
        tooltip.innerHTML = tooltipHtml;
    else
        tooltip.innerText = titleText;
    document.body.appendChild(tooltip);

    // Positioning
    const rect = el.getBoundingClientRect();
    tooltip.style.opacity = 1;
    tooltip.style.left = rect.left + window.scrollX + rect.width / 2 + 'px';

    const tooltipRect = tooltip.getBoundingClientRect();
    let top = rect.top + window.scrollY - tooltipRect.height - 5;
    let placement = 'above';

    if (top < window.scrollY) {
        placement = 'below';
        top = rect.bottom + window.scrollY + 5;
    }
    tooltip.classList.add(placement);
    tooltip.style.top = top + 'px';
    tooltip.style.transform = 'translateX(-50%)';
});

document.addEventListener('mouseout', (e) => {
    const el = e.relatedTarget;
    if (currentTooltipElement && currentTooltipElement.contains(el)) {
        // Prevent tooltip removal when moving to child elements
        return;
    }

    if (currentTooltipElement) {
        currentTooltipElement.setAttribute('title', currentTooltipElement.getAttribute('data-title'));
        currentTooltipElement.removeAttribute('data-title');
    }

    if (tooltip) {
        tooltip.remove();
        tooltip = null;
    }

    currentTooltipElement = null;
});
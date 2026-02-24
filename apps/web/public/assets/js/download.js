const warnOnUnload = e => {
    e.preventDefault();
    e.returnValue = '';
    return '';
};

const getDownloadInstance = () => {
    return JSON.parse($('#data-download').innerHTML);
};

// btw, $() isn't JQuery, it's just an alias of document.querySelector

const updateUI = (event, data = {}) => {
    data = {
        percent: 0,
        count_maps_downloaded: 0,
        count_maps_total: 0,
        message: '',
        log_status: 'downloaded',
        ...data
    };
    $('#controls').dataset.state = 'hidden';
    switch (event) {
        case 'zip_starting': {
            window.addEventListener('beforeunload', warnOnUnload);
            $('#progress .status').innerText = `Starting zip download...`;
            break;
        }
        case 'direct_starting': {
            window.addEventListener('beforeunload', warnOnUnload);
            $('#progress .status').innerText = `Starting download...`;
            break;
        }
        case 'progress': {
            $('#progress .bar .fill').style.width = `${data.percent}%`;
            $('#progress .status').innerText =
                `Downloaded ${data.count_maps_downloaded.toLocaleString()} / ${data.count_maps_total.toLocaleString()} mapsets • ${data.percent.toFixed(2)}% complete`;
            break;
        }
        case 'log': {
            const statusTooltip = {
                downloaded: 'Downloaded',
                skipped: 'Skipped, already exists',
                error: 'Error'
            };
            const html = `
            <div class="map flex gap-8 align-center">
                <span class="icon flex-no-shrink ${data.log_status}" title="${statusTooltip[data.log_status]}"></span>
                <span class="name">${escapeHTML(data.message)}</span>
            </div>
            `;
            $('#maps').insertAdjacentHTML('afterbegin', html);
            if ($('#maps').children.length > 100) {
                $('#maps').removeChild($('#maps').lastChild);
            }
            break;
        }
        case 'zip_finalizing': {
            $('#progress .bar .fill').style.width = '100%';
            $('#progress .status').innerText = `Finalizing zip...`;
            break;
        }
        case 'zip_completed': {
            $('#progress .status').innerText = `Zip download complete! Check your browser's downloads.`;
            $('#progress .bar .fill').classList.add('complete');
            $('#progress .bar .fill').style.width = '100%';
            window.removeEventListener('beforeunload', warnOnUnload);
            break;
        }
        case 'direct_completed': {
            $('#progress .status').innerText = `Downloads complete!`;
            $('#progress .bar .fill').classList.add('complete');
            $('#progress .bar .fill').style.width = '100%';
            window.removeEventListener('beforeunload', warnOnUnload);
            break;
        }
    }
};

let isDirectDownloadRunning = false;
let folderHandle;
const startDirectDownload = async includeVideo => {
    if (isDirectDownloadRunning) return;
    isDirectDownloadRunning = true;

    try {
        // Get ids
        const downloadInstance = getDownloadInstance();
        const packId = downloadInstance.pack.id;
        const downloadId = downloadInstance.id;
        let offset = 0;

        // Update UI
        updateUI('direct_starting');

        // Update progress
        const updateProgress = () => {
            const i = offset - 1;
            updateUI('progress', {
                percent: (i / downloadInstance.pack.map_count) * 100,
                count_maps_downloaded: i,
                count_maps_total: downloadInstance.pack.map_count
            });
        };

        // Loop until we exhaust the list of maps
        while (true) {
            // Fetch batch of mapsets
            const res = await axios.get(`/packs/${packId}/beatmapsets?limit=100&offset=${offset}`);
            const beatmapsets = res.data.beatmapsets;
            if (!beatmapsets.length) break;

            // Loop through and download mapsets
            for (const mapset of beatmapsets) {
                offset++;

                // Get appropriate file name
                const fileName = includeVideo ? mapset.suggested_file_name_video : mapset.suggested_file_name_novideo;

                // Skip if the file exists
                try {
                    await folderHandle.getFileHandle(fileName);
                    updateProgress();
                    updateUI('log', { message: fileName, log_status: 'skipped' });
                    continue;
                } catch (error) {
                    // it doesn't exist
                }

                // Try to download the file until it succeeds
                while (true) {
                    try {
                        // Create file for writing
                        const tempFileName = `${fileName}.part`;
                        const fileHandle = await folderHandle.getFileHandle(tempFileName, { create: true });
                        const writable = await fileHandle.createWritable();

                        // Fetch and stream file
                        const fileRes = await fetch(
                            `/packs/${packId}/download/${downloadId}/beatmapset/${mapset.id}?video=${includeVideo}`
                        );
                        if (!fileRes.ok) throw new Error(`HTTP ${fileRes.status}`);

                        // Pipe to file
                        await fileRes.body.pipeTo(writable);

                        // Move to final name
                        fileHandle.move(fileName);

                        // Update and break
                        updateProgress();
                        updateUI('log', {
                            message: fileName
                        });
                        break;
                    } catch (error) {
                        // Update progress, log, and wait to retry
                        updateProgress();
                        updateUI('log', {
                            message: `Download failed, will try again: ${fileName}`,
                            log_status: 'error'
                        });
                        await sleep(5000);
                    }
                }
            }
        }

        // Mark complete
        updateUI('direct_completed');
    } catch (error) {
        console.error(error);
        updateUI('log', {
            message: `Fatal error encountered. Please reload and try again.`,
            log_status: 'error'
        });
    }

    isDirectDownloadRunning = false;
};

document.addEventListener('DOMContentLoaded', () => {
    const downloadInstance = getDownloadInstance();
    const downloadId = downloadInstance.id;

    const isDirectSupported = 'showDirectoryPicker' in window;

    if (isDirectSupported) {
        // Handle folder selection
        $('#selectFolder').addEventListener('click', async () => {
            $('#controls .text.folderSelectError').style.display = '';
            try {
                folderHandle = await window.showDirectoryPicker({
                    id: 'target',
                    mode: 'readwrite'
                });
                $('#controls .section.downloadToFolder .folderName').innerText = folderHandle.name;
                $('#controls').dataset.state = 'folderSelected';
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('Directory picker failed:', err);
                    $('#controls .text.folderSelectError').innerText =
                        `Failed to access the selected folder for writing. Make sure you have the right permissions.`;
                    $('#controls .text.folderSelectError').style.display = 'block';
                    $('#controls .text.zipLink').style.display = 'block';
                }
                return;
            }
        });

        // Handle force-showing zip options
        $('#controls .text.zipLink a').addEventListener('click', () => {
            $('#controls .text.folderSelectError').style.display = '';
            $('#controls .text.zipLink').style.display = '';
            $('#controls').dataset.state = 'initForceZip';
        });

        // Add listeners to start buttons
        for (const btn of $$('#controls .section.downloadToFolder button')) {
            btn.addEventListener('click', async () => {
                const includeVideo = btn.dataset.video === 'true';
                startDirectDownload(includeVideo);
            });
        }
    }

    // Update controls state
    $('#controls').dataset.state = isDirectSupported ? 'initDirect' : 'initDirectUnsupported';

    // Connect to socket
    const socket = io('/');

    // Subscribe to download room on connect
    socket.on('connect', () => {
        console.log('Connected to socket');
        socket.emit('subscribe', `download_${downloadId}`);
    });

    // Handle start
    socket.on('download_start', data => {
        updateUI('zip_starting', data);
    });

    // Handle progress
    socket.on('download_progress', data => {
        updateUI('progress', data);
        updateUI('log', {
            message: data.file_name
        });
    });

    // Handle finalize
    socket.on('download_finalize', data => {
        updateUI('zip_finalizing', data);
    });

    // Handle completion
    socket.on('download_complete', data => {
        updateUI('zip_completed', data);
    });
});

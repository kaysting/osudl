const warnOnUnload = e => {
    e.preventDefault();
    e.returnValue = '';
    return '';
};

document.addEventListener('DOMContentLoaded', () => {
    const downloadId = document.body.dataset.downloadId;

    // Show controls
    $('#controls .section.folderSelect').style.display = 'none';
    $('#controls .section.downloadToFolder').style.display = 'none';
    $('#controls .section.folderUnsupported').style.display = '';
    $('#controls .section.zip').style.display = '';
    $('#controls .zipLabelAlt').style.display = 'none';
    $('#controls .zipLabel').style.display = '';
    $('#controls').style.display = '';

    // Connect to socket
    const socket = io('/');

    // Subscribe to download room on connect
    socket.on('connect', () => {
        console.log('Connected to socket');
        socket.emit('subscribe', `download_${downloadId}`);
    });

    // Render map entry
    const getMapEntry = fileName => {
        return `
        <div class="map flex gap-8 align-center">
            <span class="icon flex-no-shrink">download</span>
            <span class="name">${escapeHTML(fileName)}</span>
        </div>
        `;
    };

    // Handle start
    socket.on('download_start', data => {
        window.addEventListener('beforeunload', warnOnUnload);
        $('#controls').style.display = 'none';
        $('#progress .status').innerText = `Starting zip download...`;
    });

    // Handle progress
    socket.on('download_progress', data => {
        $('#controls').style.display = 'none';
        $('#progress .bar .fill').style.width = `${data.percent}%`;
        $('#progress .status').innerText =
            `Downloaded ${data.count_maps_downloaded} / ${data.count_maps_total} mapsets • ${data.percent.toFixed(2)}% complete`;
        $('#maps').insertAdjacentHTML('afterbegin', getMapEntry(data.file_name));
        if ($('#maps').children.length > 100) {
            $('#maps').removeChild($('#maps').lastChild);
        }
    });

    // Handle finalize
    socket.on('download_finalize', data => {
        $('#progress .bar .fill').style.width = '100%';
        $('#progress .status').innerText = `Finalizing zip...`;
    });

    // Handle completion
    socket.on('download_complete', data => {
        $('#progress .status').innerText = `Zip download complete! Check your browser's downloads.`;
        $('#progress .bar .fill').classList.add('complete');
        $('#progress .bar .fill').style.width = '100%';
        window.removeEventListener('beforeunload', warnOnUnload);
    });
});

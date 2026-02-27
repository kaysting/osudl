let lastAudioButtonElement;
let audioPlayer = new Audio();

// Update button state on audio events
audioPlayer.addEventListener('ended', () => {
    const elBtn = lastAudioButtonElement;
    const elIcon = lastAudioButtonElement.querySelector('.icon');
    elIcon.innerText = 'play_arrow';
    elBtn.dataset.playing = false;
});
audioPlayer.addEventListener('pause', () => {
    const elBtn = lastAudioButtonElement;
    const elIcon = lastAudioButtonElement.querySelector('.icon');
    elIcon.innerText = 'play_arrow';
    elBtn.dataset.playing = false;
});
audioPlayer.addEventListener('play', () => {
    const elBtn = lastAudioButtonElement;
    const elIcon = lastAudioButtonElement.querySelector('.icon');
    elIcon.innerText = 'pause';
    elBtn.dataset.playing = true;
});

const audioButtonClick = (event, audioUrl) => {
    // Get clicked button
    const elBtn = event.currentTarget;
    // If the this button is the same as the last one, handle play/pause
    if (elBtn === lastAudioButtonElement) {
        if (elBtn.dataset.playing === 'true') {
            audioPlayer.pause();
        } else {
            audioPlayer.play();
        }
        return;
    } else if (lastAudioButtonElement) {
        // Reset previous button if it differs from the current one
        lastAudioButtonElement.querySelector('.icon').innerText = 'play_arrow';
        lastAudioButtonElement.dataset.playing = false;
    }
    // Update previous button variable
    lastAudioButtonElement = elBtn;
    // Play audio
    audioPlayer.volume = parseFloat(localStorage.getItem('mapPreview')) || 0.5;
    audioPlayer.src = audioUrl;
    audioPlayer.play();
};

const audioVolumeSet = volume => {
    volume = Math.min(1, Math.max(0, volume));
    localStorage.setItem('mapPreview', volume.toString());
    audioPlayer.volume = volume;
};

const audioVolumeDown = () => {
    let volume = parseFloat(localStorage.getItem('mapPreview')) || 0.5;
    audioVolumeSet(volume - 0.1);
};

const audioVolumeUp = () => {
    let volume = parseFloat(localStorage.getItem('mapPreview')) || 0.5;
    audioVolumeSet(volume + 0.1);
};

const openBrowserPopup = (url = '', windowName = 'popup', width = 800, height = 600) => {
    const left = window.innerWidth / 2 - width / 2 + window.screenX;
    const top = window.innerHeight / 2 - height / 2 + window.screenY;
    const popup = window.open(url, windowName, `popup=yes,width=${width},height=${height},left=${left},top=${top}`);
    return popup;
};

const downloadAllResults = async btn => {
    const query = btn.dataset.query;

    // Open popup immediately
    const popup = openBrowserPopup('', Date.now().toString(), 500, 600);

    // Create pack
    const res = await axios.post(`/api/json/packs/create?query=${encodeURIComponent(query)}`);

    // Redirect popup
    popup.location.href = `/packs/${res.data.pack.id}/download`;
};

const showRenderedPopup = (title, path, width = 600, buttonLabel = 'Close') => {
    showPopup(
        title,
        `<div hx-get="${path}" hx-trigger="load" hx-swap="outerHTML"</div>`,
        [{ label: buttonLabel, class: 'primary' }],
        {
            width
        }
    );
};

const showFilterHelpPopup = () => {
    showRenderedPopup(`Search and filtering help`, '/api/partials/markdown/filter-help', 800);
};

const showCopyrightPopup = () => {
    showRenderedPopup(`Report copyright`, '/api/partials/markdown/report-copyright', 600, 'Okay');
};

const showMapsetDetailsPopup = mapsetId => {
    showRenderedPopup(`Beatmap details`, `/api/partials/beatmapsets/${mapsetId}/details`, 800);
};

document.addEventListener('DOMContentLoaded', () => {
    if (window?.electronAPI?.isElectron) document.body.dataset.isElectron = 'true';
});

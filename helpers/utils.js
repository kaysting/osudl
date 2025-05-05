const fs = require('fs');
const cp = require('child_process');
const path = require('path');
const axios = require('axios');
const rosu = require('rosu-pp-js');
const db = require('./db.js');
const elastic = require('./elastic.js');
const config = require('../config.json');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const sanitizeFileName = fileName => {
    // Replace characters that are not allowed in file names
    return fileName.replace(/[<>:"/\\|?*]/g, '_').trim();
}

const median = (nums) => {
    if (!nums.length) return null;
    const sorted = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        // Even count: average the two middle values
        return (sorted[mid - 1] + sorted[mid]) / 2;
    } else {
        // Odd count: return the middle value
        return sorted[mid];
    }
}

const toSingleLine = str => {
    return str.replace(/(\n)/g, '').replace(/\s{2,}/g, ' ')
}

// Function to round a number based on its size
const roundSmart = (num) => {
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
    const units = [ 'B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB' ];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
        bytes /= 1024;
        i++;
    }
    return `${roundSmart(bytes)} ${units[i]}`;
};

// Add commas to a number
const formatNumber = num => {
    const parts = num.toString().split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
}

const msToRelativeTime = (ms) => {
    const secs = Math.round(ms / 1000);
    if (secs < 180) return 'A few moments';
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
}

const downloadFile = async (url, filePath) => new Promise(async (resolve, reject) => {
    try {
        if (fs.existsSync(filePath)) {
            fs.rmSync(filePath);
        }
        const writer = fs.createWriteStream(filePath);
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
        });
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', (error) => {
            if (fs.existsSync(filePath)) {
                fs.rmSync(filePath);
            }
            reject(error);
        });
    } catch (error) {
        if (fs.existsSync(filePath)) {
            fs.rmSync(filePath);
        }
        reject(error);
    }
});

const forkSync = (scriptPath) => {
    return new Promise((resolve, reject) => {
        const child = cp.fork(scriptPath, { stdio: 'inherit' });
        child.on('exit', (code) => {
            if (code !== 0) {
                reject(new Error(`Script ${scriptPath} exited with code ${code}`));
            } else {
                resolve();
            }
        });
    });
}

const escapeForLike = (str) => {
    return str
        .replace(/\\/g, '\\\\')  // Escape backslash first
        .replace(/%/g, '\\%')    // Escape %
        .replace(/_/g, '\\_');   // Escape _
}

const escapeForFullText = (str) => {
    return str.replace(/[+\-><()~*"@|]/g, '');
}

const countBeatmapsets = async () => {
    return await db.get('SELECT COUNT(*) AS count FROM beatmapsets', [], 'count');
};

const countBeatmaps = async () => {
    return await db.get('SELECT COUNT(*) AS count FROM beatmaps', [], 'count');
}

const getBeatmapStorageSize = async () => {
    const size = await db.get(
        `SELECT
        SUM(
            CASE
            WHEN has_video = 1 THEN file_size_novideo + file_size_video
            ELSE file_size_novideo
            END
        ) AS size
        FROM beatmapsets`,
        [], 'size'
    );
    return parseInt(size || 0);
}

const getBeatmapsetById = async id => {
    const beatmapset = await db.get('SELECT * FROM beatmapsets WHERE id = ?', [ id ]);
    if (!beatmapset) return null;
    const beatmapEntries = await db.all('SELECT * FROM beatmaps WHERE set_id = ? ORDER BY stars', [ id ]);
    const beatmaps = [];
    for (const beatmap of beatmapEntries) {
        const ppEntries = await db.all(
            'SELECT mods, max_pp FROM beatmap_pp WHERE map_id = ?',
            [ beatmap.id ]
        );
        beatmap.max_pp = {};
        for (const entry of ppEntries) {
            beatmap.max_pp[entry.mods] = entry.max_pp;
        }
        beatmaps.push(beatmap);
    }
    return { ...beatmapset, beatmaps };
}

const saveBeatmapset = async beatmapset => {
    // Delete if exists
    await db.run('DELETE FROM beatmaps WHERE set_id = ?', [ beatmapset.id ]);
    await db.run('DELETE FROM beatmapsets WHERE id = ?', [ beatmapset.id ]);
    // Save beatmaps
    for (const beatmap of beatmapset.beatmaps) {
        await db.run(
            `INSERT INTO beatmaps (id, set_id, mode, name, bpm, length_secs, cs, ar, od, hp, stars, count_circles, count_sliders, count_spinners) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                beatmap.id,
                beatmapset.id,
                beatmap.mode,
                beatmap.version,
                beatmap.bpm,
                beatmap.total_length,
                beatmap.cs,
                beatmap.ar,
                beatmap.accuracy,
                beatmap.drain,
                beatmap.difficulty_rating,
                beatmap.count_circles,
                beatmap.count_sliders,
                beatmap.count_spinners
            ]
        );
    }
    // Save beatmapset
    await db.run(
        `INSERT INTO beatmapsets (id, title, title_unicode, artist, artist_unicode, source, mapper, date_submitted, date_ranked, status, has_video, is_nsfw, is_downloadable)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            beatmapset.id,
            beatmapset.title,
            beatmapset.title_unicode,
            beatmapset.artist,
            beatmapset.artist_unicode,
            beatmapset.source,
            beatmapset.creator,
            new Date(beatmapset.submitted_date),
            new Date(beatmapset.ranked_date),
            beatmapset.status,
            beatmapset.video ? 1 : 0,
            beatmapset.nsfw ? 1 : 0,
            beatmapset.availability.download_disabled ? 0 : 1
        ]
    );
}

const updateBeatmapsetFileData = async (id, pathNoVideo, pathVideo) => {
    const pathNoVideoExists = fs.existsSync(pathNoVideo);
    if (!pathNoVideoExists) return false;
    const pathVideoExists = pathVideo ? fs.existsSync(pathVideo) : false;
    const fileName = path.basename(pathNoVideo);
    const noVideoStats = fs.statSync(pathNoVideo);
    const videoStats = fs.statSync(pathVideoExists ? pathVideo : pathNoVideo);
    const noVideoSize = noVideoStats.size;
    const videoSize = videoStats.size;
    await db.run(
        `UPDATE beatmapsets SET has_video = ?, file_name = ?, file_size_novideo = ?, file_size_video = ? WHERE id = ?`, 
        [ pathVideoExists ? 1 : 0, fileName, noVideoSize, videoSize, id ]
    );
    return true;
}

const getBeatmapsetIndexFields = async id => {
    const mapset = await getBeatmapsetById(id);
    const beatmapFields = [];
    for (const map of mapset.beatmaps) {
        const ppEntries = await db.all(`SELECT mods, max_pp FROM beatmap_pp WHERE map_id = ?`, [ map.id ]);
        const ppValues = {};
        for (const entry of ppEntries) {
            ppValues[entry.mods] = entry.max_pp;
        }
        beatmapFields.push({
            map_id: map.id,
            mapset_id: mapset.id,
            title: mapset.title,
            title_unicode: mapset.title_unicode,
            artist: mapset.artist,
            artist_unicode: mapset.artist_unicode,
            source: mapset.source,
            mapper: mapset.mapper,
            diff_name: map.name,
            cs: map.cs,
            ar: map.ar,
            od: map.od,
            hp: map.hp,
            stars: map.stars,
            bpm: map.bpm,
            length_secs: map.length_secs,
            count_circles: map.count_circles,
            count_sliders: map.count_sliders,
            count_spinners: map.count_spinners,
            count_plays: mapset.count_plays,
            count_plays_past_day: mapset.count_plays_past_day,
            count_plays_past_week: mapset.count_plays_past_week,
            count_plays_past_month: mapset.count_plays_past_month,
            max_pp: ppValues,
            mode: map.mode,
            is_nsfw: mapset.is_nsfw ? true : false,
            has_video: mapset.has_video ? true : false,
            date_ranked: mapset.date_ranked,
            date_submitted: mapset.date_submitted,
            file_size_video: mapset.file_size_video,
            file_size_novideo: mapset.file_size_novideo,
            date_saved: mapset.date_saved
        });
    }
    return beatmapFields;
};

const indexBeatmapset = async (id, index = 'beatmaps') => {
    const mapset = await getBeatmapsetById(id);
    if (!mapset) return false;
    const fields = await getBeatmapsetIndexFields(id);
    const ops = [];
    for (const field of fields) {
        ops.push({
            index: {
                _index: index,
                _id: field.map_id
            }
        });
        ops.push(field);
    }
    await elastic.bulk({
        body: ops,
        refresh: true
    });
    console.log(`Indexed ${mapset.beatmaps.length} beatmaps from mapset ${mapset.id}`);
    return true;
}

const downloadBeatmapsetDiffs = async (setId, force) => {
    const mapIds = (await db.all(`SELECT id FROM beatmaps WHERE set_id = ?`, [ setId ])).map(entry => entry.id);
    for (const mapId of mapIds) {
        const dest = path.join(config.diffs_dir, `${mapId}.osu`);
        if (fs.existsSync(dest) && !force) continue;
        const url = `https://osu.ppy.sh/osu/${mapId}`;
        try {
            await downloadFile(url, dest);
            await db.run('UPDATE beatmaps SET file_name = ? WHERE id = ?', [ path.basename(dest), mapId ]);
            console.log(`Saved beatmap difficulty to ${dest}`);
        } catch (error) {
            console.error(`Error downloading beatmap ${mapId}: ${error}`);
        }
    }
}

const downloadBeatmapsetAssets = async (id, force) => {
    const mapset = await getBeatmapsetById(id);
    if (!mapset) return false;
    const cardPath = path.join(config.backgrounds_dir, 'card', `${mapset.id}.jpg`);
    const coverPath = path.join(config.backgrounds_dir, 'cover', `${mapset.id}.jpg`);
    const audioPath = path.join(config.audio_dir, `${mapset.id}.mp3`);
    if (!fs.existsSync(cardPath) && !force) {
        try {
            await downloadFile(`https://assets.ppy.sh/beatmaps/${mapset.id}/covers/card.jpg`, cardPath);
            await db.run('UPDATE beatmapsets SET file_name_card = ? WHERE id = ?', [ path.basename(cardPath), mapset.id ]);
            console.log(`Saved mapset card background ${cardPath}`);
        } catch (error) {
            console.error(`Error downloading card for mapset ${mapset.id}: ${error}`);
        }
    }
    if (!fs.existsSync(coverPath) && !force) {
        try {
            await downloadFile(`https://assets.ppy.sh/beatmaps/${mapset.id}/covers/cover.jpg`, coverPath);
            await db.run('UPDATE beatmapsets SET file_name_cover = ? WHERE id = ?', [ path.basename(coverPath), mapset.id ]);
            console.log(`Saved mapset cover background ${mapset.id} to ${coverPath}`);
        } catch (error) {
            console.error(`Error downloading cover for mapset ${mapset.id}: ${error}`);
        }
    }
    if (!fs.existsSync(audioPath) && !force) {
        try {
            await downloadFile(`https://b.ppy.sh/preview/${mapset.id}.mp3`, audioPath);
            await db.run('UPDATE beatmapsets SET file_name_preview = ? WHERE id = ?', [ path.basename(audioPath), mapset.id ]);
            console.log(`Saved mapset audio preview ${mapset.id} to ${audioPath}`);
        } catch (error) {
            console.error(`Error downloading audio preview for mapset ${mapset.id}: ${error}`);
        }
    }
}

const getBeatmapsetFilePaths = async (id) => {
    const fileName = await db.get('SELECT file_name FROM beatmapsets WHERE id = ?', [ id ], 'file_name');
    const paths = {
        video: null,
        noVideo: null
    };
    if (!fileName) return paths;
    const pathNoVideo = path.join(config.maps_dir, fileName);
    const pathVideo = path.join(config.video_maps_dir, fileName);
    paths.noVideo = pathNoVideo;
    paths.video = fs.existsSync(pathVideo) ? pathVideo : pathNoVideo;
    return paths;
}

const calculateBeatmapMaxPP = async (id, mods) => {
    try {
        // Get beatmap file path
        const fileName = await db.get(
            'SELECT file_name FROM beatmaps WHERE id = ?',
            [ id ], 'file_name'
        );
        if (!fileName) {
            console.error(`Beatmap ${id} has no saved file name`);
            return null;
        }
        const filePath = path.join(config.diffs_dir, fileName);
        // Parse beatmap file
        const bytes = fs.readFileSync(filePath);
        const map = new rosu.Beatmap(bytes);
        // Calculate performance attributes with the specified mods
        const performance = mods ? new rosu.Performance({ mods }) : new rosu.Performance();
        const maxAttrs = performance.calculate(map);
        map.free();
        const maxPP = maxAttrs.pp;
        // Store result
        mods = mods ? mods.toLowerCase() : 'nomod';
        await db.run(`DELETE FROM beatmap_pp WHERE map_id = ? AND mods = ?`, [ id, mods ]);
        await db.run(
            `INSERT INTO beatmap_pp (map_id, mods, max_pp) VALUES (?, ?, ?)`,
            [ id, mods, maxPP ]
        );
        console.log(`Saved max pp for map ${id} with mods ${mods}: ${maxPP}pp`);
    } catch (error) {
        console.error(`Error while calculating max pp for map ${id}:`, error);
        return null;
    }
}

const calculateBeatmapsetMaxPP = async (id, mods) => {
    const beatmaps = await db.all('SELECT id FROM beatmaps WHERE set_id = ?', [ id ]);
    for (const beatmap of beatmaps) {
        await calculateBeatmapMaxPP(beatmap.id, mods);
    }
}

const sendDiscordAlert = async (content = '', embeds = []) => {
    try {
        const response = await axios.post(config.discord_alerts_webhook, {
            username: 'osu-downloader',
            content: content,
            embeds
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error posting to Discord webhook:', error);
        throw error;
    }
};

const verifyTurnstileToken = async (token) => {
    try {
        const response = await axios.post('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            secret: config.turnstile_secret,
            response: token
        });
        console.log(`Turnstile verification response:`, JSON.stringify(response.data));
        return response.data.success;
    } catch (error) {
        console.error('Error verifying Turnstile token:', error);
        return false;
    }
};

module.exports = {
    sleep,
    msToRelativeTime,
    roundSmart,
    formatBytes,
    formatNumber,
    sanitizeFileName,
    median,
    toSingleLine,
    forkSync,
    downloadFile,
    escapeForLike,
    escapeForFullText,
    countBeatmapsets,
    getBeatmapStorageSize,
    countBeatmaps,
    getBeatmapsetById,
    saveBeatmapset,
    updateBeatmapsetFileData,
    getBeatmapsetIndexFields,
    indexBeatmapset,
    getBeatmapsetFilePaths,
    downloadBeatmapsetDiffs,
    downloadBeatmapsetAssets,
    calculateBeatmapMaxPP,
    calculateBeatmapsetMaxPP,
    sendDiscordAlert,
    verifyTurnstileToken
};
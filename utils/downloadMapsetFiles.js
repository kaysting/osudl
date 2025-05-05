const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const archiver = require('archiver');
const extract = require('extract-zip');
const utils = require('../helpers/utils.js');
const db = require('../helpers/db.js');
const config = require('../config.json');

const downloadsDir = path.resolve('./downloads');

(async() => {

    const ids = (
        await db.all(
            `SELECT id FROM beatmapsets
            WHERE is_downloadable = 1 AND file_name IS NULL`
        )
    ).map(entry => entry.id);
    /* const noVideoMapFileNames = fs.readdirSync(config.maps_dir).filter(fileName => fileName.endsWith('.osz'));
    const videoMapFileNames = fs.readdirSync(config.video_maps_dir).filter(fileName => fileName.endsWith('.osz'));
    const noVideoMapFileIds = noVideoMapFileNames.map(fileName => parseInt(fileName.split(' ').shift()));
    const videoMapFileIds = videoMapFileNames.map(fileName => parseInt(fileName.split(' ').shift()));
    const mapsets = await db.all(`SELECT id, has_video FROM beatmapsets WHERE is_downloadable = 1`);
    for (const entry of mapsets) {
        if (!noVideoMapFileIds.includes(entry.id)) {
            ids.push(entry.id);
            continue;
        }
        if (entry.has_video && !videoMapFileIds.includes(entry.id)) {
            ids.push(entry.id);
            continue;
        }
    } */

    if (!ids.length) {
        console.log(`All mapset files are downloaded!`);
        process.exit(0);
    }
    console.log(`${ids.length} mapsets need to be downloaded`);

    console.log(`Starting browser and injecting osu session cookie...`);
    const browser = await puppeteer.launch();
    await browser.setCookie({
        name: 'osu_session',
        value: config.osu_session_cookie,
        domain: '.ppy.sh',
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        priority: 'Medium'
    });

    console.log(`Opening osu website...`);
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto('https://osu.ppy.sh/', { waitUntil: 'networkidle2' });

    let lastDownloadRequestTime = Date.now() - 5000;
    const downloadMapset = async mapsetId => new Promise(async (resolve, reject) => {
        // Wait for 5 seconds after the last download request
        await utils.sleep(5000 - (Date.now() - lastDownloadRequestTime));
        // Prepare temp download directory
        const tempDir = path.join(downloadsDir, `download-${Date.now()}`);
        fs.mkdirSync(tempDir, { recursive: true });
        await page._client().send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: tempDir
        });
        // Download the mapset
        console.log(`Starting download of mapset ${mapsetId}...`);
        const url = `https://osu.ppy.sh/beatmapsets/${mapsetId}/download`;
        await page.evaluate(url => {
            const a = document.createElement('a');
            a.href = url;
            a.download = '';
            a.click();
        }, url);
        lastDownloadRequestTime = Date.now();
        // Wait for changes
        let timeoutTimeout;
        const watcher = fs.watch(tempDir, async (eventType, filename) => {
            clearTimeout(timeoutTimeout);
            // Ensure we only handle rename events on osz files
            if (eventType !== 'rename') return;
            if (!filename.endsWith('.osz')) return;
            // Close the watcher and wait half a second for things to settle with the file
            watcher.close();
            console.log(`Processing download...`);
            await utils.sleep(500);
            // Get file paths and map info
            const src = path.join(tempDir, filename);
            const mapset = await utils.getBeatmapsetById(mapsetId);
            const dateRanked = mapset.date_ranked;
            const newFileName = utils.sanitizeFileName(`${mapsetId} ${mapset.artist} - ${mapset.title}.osz`);
            const destNoVideo = path.join(config.maps_dir, newFileName);
            const destVideo = path.join(config.video_maps_dir, newFileName);
            // Extract and save mapset files
            try {
                // Extract downloaded mapset
                const extractDir = path.join(tempDir, 'extracted');
                fs.mkdirSync(extractDir, { recursive: true });
                await extract(src, { dir: extractDir });
                // Find video files
                const entries = fs.readdirSync(extractDir);
                let hasVideo = false;
                const videoFiles = [];
                for (const entry of entries) {
                    if (entry.match(/\.(mp4|avi|flv|mpg|m4v|mov)$/i)) {
                        hasVideo = true;
                        videoFiles.push(entry);
                    }
                }
                // Function to create archive
                const createArchive = (outputPath, excludeFiles = []) => {
                    return new Promise((resolve, reject) => {
                        const output = fs.createWriteStream(outputPath);
                        const archive = archiver('zip', {
                            zlib: { level: 9 }
                        });
                        output.on('close', resolve);
                        archive.on('error', reject);
                        archive.pipe(output);
                        for (const entry of entries) {
                            if (!excludeFiles.includes(entry)) {
                                archive.file(path.join(extractDir, entry), { name: entry });
                            }
                        }
                        archive.finalize();
                    });
                };
                // Save video map
                if (hasVideo) {
                    await createArchive(destVideo);
                    fs.utimesSync(destVideo, new Date(), dateRanked);
                    console.log(`Saved mapset file: ${destVideo}`);
                }
                // Save novideo map
                await createArchive(destNoVideo, videoFiles);
                fs.utimesSync(destNoVideo, Date.now(), dateRanked);
                console.log(`Saved mapset file: ${destNoVideo}`);
                // Remove temp directory
                fs.rmSync(tempDir, { recursive: true });
                // Update beatmap file data
                await utils.updateBeatmapsetFileData(mapsetId, destNoVideo, destVideo);
                // Download additional assets
                await utils.downloadBeatmapsetAssets(mapsetId);
                await utils.downloadBeatmapsetDiffs(mapsetId);
                // Calculate pp for all diffs
                await utils.calculateBeatmapsetMaxPP(mapsetId);
                for (const mods of config.stored_pp_mods) {
                    await utils.calculateBeatmapsetMaxPP(mapsetId, mods);
                }
                // Index mapset
                await utils.indexBeatmapset(mapsetId);
            } catch (error) {
                reject(error);
            }
            // Send Discord alert
            const escaped = `${mapset.artist} - ${mapset.title}`
                .replace(/\\/g, '\\\\')
                .replace(/\[/g, "\\[")
                .replace(/\]/g, "\\]");
            const mapCount = utils.formatNumber(await utils.countBeatmapsets());
            const diffCount = utils.formatNumber(await utils.countBeatmaps());
            const size = utils.formatBytes(await utils.getBeatmapStorageSize());
            await utils.sendDiscordAlert(`New ranked mapset downloaded: [${escaped}](https://osu.ppy.sh/beatmapsets/${mapsetId})\nNow storing ${mapCount} mapsets (${diffCount} diffs) with a total size of ${size}`);
            // Resolve
            resolve();
        });
        // Handle timeout
        timeoutTimeout = setTimeout(() => {
            watcher.close();
            fs.rmSync(tempDir, { recursive: true });
            reject(new Error(`Download timed out for mapset ${mapsetId}`));
        }, 30*1000);
    });

    if (fs.existsSync(downloadsDir))
        fs.rmSync(downloadsDir, { recursive: true });
    const downloadTimes = [ Date.now() ];
    for (let i = 0; i < ids.length; i++) {
        try {
            const id = ids[i];
            await downloadMapset(id);
            downloadTimes.push(Date.now());
            while (downloadTimes.length > 25) {
                downloadTimes.shift();
            }
            const msPerDownload = (downloadTimes[downloadTimes.length - 1] - downloadTimes[0]) / downloadTimes.length;
            const remainingDownloads = ids.length - (i + 1);
            const msLeft = msPerDownload * remainingDownloads;
            console.log(`Progress: ${i+1}/${ids.length} maps downloaded, done in ${utils.msToRelativeTime(msLeft).toLowerCase()}`);
        } catch (error) {
            console.error(error);
            await utils.sendDiscordAlert(`<@322141003123523584> Error downloading mapset ${ids[i]}: ${error.message}`);
            i--;
        }
    }
    console.log(`Downloads complete!`);

    await browser.close();
    process.exit();
    
})();

process.on('SIGINT', async () => {
    console.log(`Cleaning up...`);
    await browser.close();
    if (fs.existsSync(downloadsDir))
        fs.rmSync(downloadsDir, { recursive: true });
    process.exit();
});
const env = require('#env');
const db = require('#db');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const tar = require('tar');
const bz2 = require('unbzip2-stream');
const dayjs = require('dayjs');
const { pipeline } = require('stream/promises');
const osu = require('#lib/osu.js');
const s3 = require('#lib/s3.js');
const SqlDumpParser = require('#lib/SqlDumpParser.js');
const utils = require('#utils');

dayjs.extend(require('dayjs/plugin/relativeTime'));

const DUMP_DIR = path.join(env.ROOT, 'temp/dump');
const DOWNLOAD_DIR = path.join(env.ROOT, 'temp/downloads');

// Adjust these to change where maps are downloaded from
// {mapset_id} is replaced with the target mapset ID
const MAP_DOWNLOAD_URL_TEMPLATE = `https://osu.ppy.sh/beatmapsets/{mapset_id}/download`;
const MS_DELAY_BETWEEN_DOWNLOADS = 5000;

/**
 * Helper function that fetches and returns formatted beatmapset data. It includes beatmapset and beatmaps properties, each of which have properties that match database column names.
 * @param {number} mapsetId The mapset ID
 */
const fetchBeatmapsetEntry = async mapsetId => {
    // Fetch mapset using osu api
    const mapset = await osu.getBeatmapset(mapsetId);

    // Build entry
    // We spread the provided properties and then override/set addition ones
    const entry = {
        beatmapset: {
            ...mapset,
            mapper: mapset.creator,
            is_nsfw: mapset.nsfw ? 1 : 0,
            has_video: mapset.video ? 1 : 0,
            status: utils.osuStatusToInt(mapset.status),
            is_download_disabled: mapset.availability?.download_disabled ? 1 : 0,
            time_ranked: new Date(mapset.ranked_date).getTime(),
            time_submitted: new Date(mapset.submitted_date).getTime(),
            genre: mapset.genre.name,
            language: mapset.language.name,
            // For novideo
            novideo_size: 0,
            novideo_s3_key: '',
            novideo_sha256: '',
            // For video
            video_size: null,
            video_s3_key: null,
            video_sha256: null
        },
        beatmaps: mapset.beatmaps.map(map => ({
            ...map,
            stars: map.difficulty_rating,
            mode: utils.osuModeToInt(map.mode),
            status: utils.osuStatusToInt(map.status),
            od: map.accuracy,
            hp: map.drain
        }))
    };

    return entry;
};

const BEATMAPSET_DB_COLUMNS = [
    'id',
    'title',
    'artist',
    'mapper',
    'source',
    'language',
    'genre',
    'tags',
    'status',
    'time_submitted',
    'time_ranked',
    'has_video',
    'is_download_disabled',
    'is_nsfw',
    'novideo_s3_key',
    'video_s3_key',
    'novideo_size',
    'video_size',
    'novideo_sha256',
    'video_sha256'
];

const BEATMAP_DB_COLUMNS = [
    'id',
    'beatmapset_id',
    'version',
    'mode',
    'status',
    'total_length',
    'stars',
    'bpm',
    'cs',
    'ar',
    'od',
    'hp',
    'count_circles',
    'count_sliders',
    'count_spinners'
];

const MAP_SEARCH_DB_COLUMNS = ['title', 'artist', 'version', 'genre', 'tags', 'source', 'beatmap_id', 'beatmapset_id'];

/**
 * Given a list of beatmapset IDs, download their files from osu! (or another mirror),
 * create a copy and strip video files if the map has videos, upload the resulting files to S3,
 * and save map data and S3 keys to the database.
 * @param {number[]} mapsetIds A list of mapset IDs to import
 * @returns The number of successfully imported mapsets
 */
const importMapsets = async mapsetIds => {
    if (!mapsetIds || mapsetIds.length == 0) return 0;
    utils.log(`Importing ${mapsetIds.length} mapsets...`);

    // Prepare insert statements
    const insertMapsetStmt = db.prepare(
        `INSERT OR REPLACE INTO beatmapsets (${BEATMAPSET_DB_COLUMNS.join(', ')})
            VALUES (${BEATMAPSET_DB_COLUMNS.map(e => `@${e}`)})`
    );
    const insertMapStmt = db.prepare(
        `INSERT OR REPLACE INTO beatmaps (${BEATMAP_DB_COLUMNS.join(', ')})
            VALUES (${BEATMAP_DB_COLUMNS.map(e => `@${e}`)})`
    );
    const insertMapIndex = db.prepare(
        `INSERT INTO map_search (${MAP_SEARCH_DB_COLUMNS.join(', ')})
            VALUES (${MAP_SEARCH_DB_COLUMNS.map(e => `@${e}`)})`
    );
    const checkExistingMapStmt = db.prepare(`SELECT 1 FROM beatmaps WHERE id = ?`);
    const deleteIndexStmt = db.prepare(`DELETE FROM map_search WHERE beatmap_id = ?`);

    // Transaction to save all pending mapsets to the db in bulk
    const saveEntry = db.transaction(entry => {
        const mapset = entry.beatmapset;
        insertMapsetStmt.run(mapset);
        utils.log(
            `Saved data for mapset ${entry.beatmapset.id}: ${entry.beatmapset.artist} - ${entry.beatmapset.title}`
        );
        for (const map of entry.beatmaps) {
            const mapExists = checkExistingMapStmt.get(map.id);
            insertMapStmt.run(map);
            // Delete existing index entry if the map already existed
            // so it can be updated without being redundant
            if (mapExists) deleteIndexStmt.run(map.id);
            insertMapIndex.run({ ...map, ...mapset, beatmap_id: map.id, beatmapset_id: mapset.id });
            utils.log(
                `Saved data for map ${map.id}: ${entry.beatmapset.artist} - ${entry.beatmapset.title} [${map.version}]`
            );
        }
    });

    const startTime = Date.now();
    let countFailed = 0;
    let countProcessed = 0;
    let countTotal = mapsetIds.length;
    const logProgress = () => {
        const countSeen = countProcessed + countFailed;
        const countLeft = countTotal - countSeen;
        const percent = (countSeen / countTotal) * 100;
        const msElapsed = Date.now() - startTime;
        const msPerMapset = countProcessed == 0 ? 0 : msElapsed / countProcessed;
        const msLeft = countLeft * msPerMapset;
        const doneTs = Date.now() + msLeft;
        utils.log(
            `Importing mapsets: ${percent.toFixed(2)}% (${countSeen} / ${countTotal}), done ${dayjs(doneTs).fromNow()}`
        );
    };

    for (const id of mapsetIds) {
        try {
            // Fetch formatted mapset entry
            utils.log(`Fetching data for mapset ${id}`);
            const entry = await fetchBeatmapsetEntry(id);

            // Function to handle downloading, processing, and storing map files
            const downloadAndUpload = async () => {
                if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
                let baseOszPath = '';
                let noVideoOszPath = '';
                if (!entry.beatmapset.is_download_disabled) {
                    while (true) {
                        try {
                            // Download mapset
                            utils.log(`Downloading mapset ${id} from osu!...`);
                            const res = await axios({
                                url: MAP_DOWNLOAD_URL_TEMPLATE.replace('{mapset_id}', id),
                                method: 'GET',
                                responseType: 'stream',
                                maxRedirects: 5,
                                headers: {
                                    // osu requires this for some reason
                                    Referer: `https://osu.ppy.sh/beatmapsets/${id}`,

                                    // Only include osu session cookie if we're downloading from osu
                                    // This prevents mirrors from getting our session
                                    Cookie: MAP_DOWNLOAD_URL_TEMPLATE.includes('osu.ppy.sh')
                                        ? `osu_session=${env.OSU_SESSION_COOKIE}`
                                        : '',

                                    // Set user agent and accept headers to mimic a real browser
                                    'User-Agent':
                                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0',
                                    Accept: `text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7`
                                }
                            });

                            // Save to disk
                            baseOszPath = path.join(DOWNLOAD_DIR, `${id}.osz`);
                            await pipeline(res.data, fs.createWriteStream(baseOszPath));
                            break;
                        } catch (error) {
                            if (error.response?.status == 429) {
                                utils.log(`Download rate limited by osu!, trying again in a few minutes`);
                                await utils.sleep(1000 * 60 * 3);
                            } else if (error.response?.status) {
                                throw new Error(`Request failed with status ${error.response?.status}`);
                            } else {
                                throw error;
                            }
                        }
                    }
                } else {
                    const mapFilesDir = path.join(DOWNLOAD_DIR, id.toString());
                    if (!fs.existsSync(mapFilesDir)) fs.mkdirSync(mapFilesDir);

                    // Download each difficulty's raw .osu file
                    for (const map of mapset.beatmaps) {
                        const filePath = path.join(mapFilesDir, `${map.id}.osu`);
                        while (true) {
                            try {
                                utils.log(`Downloading .osu file for map ${map.id} in mapset ${id}...`);
                                const res = await axios({
                                    url: `https://osu.ppy.sh/osu/${map.id}`,
                                    method: 'GET',
                                    responseType: 'stream'
                                });
                                await pipeline(res.data, fs.createWriteStream(filePath));
                                break;
                            } catch (error) {
                                if (error.response?.status == 429) {
                                    utils.log(`Download rate limited by osu!, trying again in a minute`);
                                    await utils.sleep(1000 * 60);
                                } else {
                                    throw error;
                                }
                            }
                        }
                    }

                    // Zip the frankenstein mapset
                    baseOszPath = path.join(DOWNLOAD_DIR, `${id}.osz`);
                    utils.zipDir(mapFilesDir, baseOszPath);

                    // Delete unzipped files
                    fs.rmSync(mapFilesDir, { recursive: true, force: true });
                }

                if (entry.beatmapset.has_video && !entry.beatmapset.is_download_disabled) {
                    // Prepare extraction folder
                    const extractDir = path.join(DOWNLOAD_DIR, id.toString());
                    if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { force: true, recursive: true });
                    fs.mkdirSync(extractDir, { recursive: true });

                    try {
                        utils.log(`Removing video files from downloaded map...`);
                        // Unzip the file
                        utils.unzip(baseOszPath, extractDir);

                        // Recurse through extracted map files and delete video files
                        const videoExtensions = [
                            'webm',
                            'mp4',
                            'avi',
                            'mov',
                            'mkv',
                            'flv',
                            'wmv',
                            '3gp',
                            '3g2',
                            'm4v',
                            'mpg',
                            'mpeg',
                            'ogv'
                        ];
                        let didDeleteVideos = false;
                        const recurse = dir => {
                            const fileNames = fs.readdirSync(dir);
                            for (const name of fileNames) {
                                const filePath = path.join(dir, name);
                                const stats = fs.statSync(filePath);
                                // Recurse and continue if file is a directory
                                if (stats.isDirectory()) {
                                    recurse(filePath);
                                    continue;
                                }
                                // If file is a video, delete it
                                const ext = filePath.split('.').pop().toLowerCase();
                                if (videoExtensions.includes(ext)) {
                                    fs.rmSync(filePath, { force: true });
                                    didDeleteVideos = true;
                                }
                            }
                        };
                        recurse(extractDir);

                        // Re-zip the file and save the novideo path only if we actually deleted video files
                        if (didDeleteVideos) {
                            noVideoOszPath = path.join(DOWNLOAD_DIR, `${id}-novideo.osz`);
                            utils.zipDir(extractDir, noVideoOszPath);
                        }
                    } catch (error) {
                        utils.logErr(`Map video stripping failed:`, error);
                    }

                    // Delete extraction folder
                    fs.rmSync(extractDir, { force: true, recursive: true });
                }

                // Save file details and upload
                // If noVideo path is set, we assume the base has video
                if (noVideoOszPath) {
                    // Get file stats
                    const noVideoStats = fs.statSync(noVideoOszPath);
                    const videoStats = fs.statSync(baseOszPath);

                    // Put together s3 keys
                    const noVideo_s3key = `beatmapsets/${id}-novideo.osz`;
                    const video_s3key = `beatmapsets/${id}.osz`;

                    // Save details to entry
                    entry.beatmapset.novideo_size = noVideoStats.size;
                    entry.beatmapset.novideo_sha256 = await utils.sha256file(noVideoOszPath);
                    entry.beatmapset.novideo_s3_key = noVideo_s3key;
                    entry.beatmapset.video_size = videoStats.size;
                    entry.beatmapset.video_sha256 = await utils.sha256file(baseOszPath);
                    entry.beatmapset.video_s3_key = video_s3key;

                    // Upload the files to s3
                    utils.log(`Uploading ${noVideo_s3key} to S3...`);
                    await s3.upload(env.S3_BUCKET, noVideo_s3key, fs.createReadStream(noVideoOszPath));
                    utils.log(`Uploading ${video_s3key} to S3...`);
                    await s3.upload(env.S3_BUCKET, video_s3key, fs.createReadStream(baseOszPath));
                } else {
                    // Get stats
                    const stats = fs.statSync(baseOszPath);

                    // Save details
                    const s3key = `beatmapsets/${id}${entry.beatmapset.is_download_disabled ? '-dmca' : ''}.osz`;
                    entry.beatmapset.novideo_size = stats.size;
                    entry.beatmapset.novideo_sha256 = await utils.sha256file(baseOszPath);
                    entry.beatmapset.novideo_s3_key = s3key;

                    // Upload file
                    utils.log(`Uploading ${s3key} to S3...`);
                    await s3.upload(env.S3_BUCKET, s3key, fs.createReadStream(baseOszPath));
                }

                // Delete downloads folder
                fs.rmSync(DOWNLOAD_DIR, { recursive: true, force: true });
            };

            await downloadAndUpload();

            // Save entry
            saveEntry(entry);
            countProcessed++;
        } catch (error) {
            utils.logErr(`Error while processing map data for ${id}:`, error);
            countFailed++;
        }

        // Log progress
        logProgress();

        // Wait before looping to hopefully avoid download rate limits
        await utils.sleep(MS_DELAY_BETWEEN_DOWNLOADS);
    }

    utils.log(`Imported ${countProcessed} mapset(s) with ${countFailed} failure(s)`);

    return countProcessed;
};

/**
 * Download and extract mapset IDs from monthly data.ppy.sh database dumps and import all maps that we don't have saved.
 */
const importFromDump = async () => {
    try {
        // Only download dump if we don't already have it or if it's been over a day since we downloaded it
        const lastDumpDownloadTime = parseInt(utils.readMiscData('last_dump_download_time') || 0);
        if (!fs.existsSync(DUMP_DIR) || Date.now() - lastDumpDownloadTime > 1000 * 60 * 60 * 24) {
            // Create dump folder
            if (fs.existsSync(DUMP_DIR)) fs.rmSync(DUMP_DIR, { recursive: true, force: true });
            fs.mkdirSync(DUMP_DIR, { recursive: true });
            utils.log(`Starting download dump to ${DUMP_DIR}...`);

            // Start download and get stream
            const firstOfTheMonth = dayjs().set('D', 1);
            let lastDownloadLog = 0;
            const dumpDownloadStream = await axios({
                method: 'GET',
                url: `https://data.ppy.sh/${firstOfTheMonth.format('YYYY_MM_DD')}_performance_osu_top_1000.tar.bz2`,
                responseType: 'stream',
                onDownloadProgress: e => {
                    const percent = ((e.loaded / e.total) * 100).toFixed(2);
                    if (Date.now() - lastDownloadLog > 5000) {
                        const loadedM = Math.floor(e.loaded / (1024 * 1024));
                        const totalM = Math.floor(e.total / (1024 * 1024));
                        utils.log(`Downloading and extracting dump: ${percent}% (${loadedM}MB / ${totalM}MB)...`);
                        lastDownloadLog = Date.now();
                    }
                }
            });

            // Pipe download stream through bz2 and tar extractors
            const extraction = dumpDownloadStream.data.pipe(bz2()).pipe(
                tar.x({
                    cwd: DUMP_DIR,
                    strip: 1
                })
            );

            // Wait for extraction to finish
            await new Promise((resolve, reject) => {
                extraction.on('finish', () => {
                    utils.log('Dump download complete!');
                    resolve();
                });
                extraction.on('error', err => {
                    reject(err);
                });
            });

            // Save last dump download time
            utils.writeMiscData('last_dump_download_time', Date.now());
        }

        utils.log(`Locating unsaved mapset data in dump...`);

        // Get all mapset IDs we already have saved
        const storedMapsetIds = new Set(
            db
                .prepare(`SELECT id FROM beatmapsets`)
                .all()
                .map(row => row.id)
        );

        // Loop through dump entries to find missing mapsets
        const sqlFileParser = new SqlDumpParser({ tableName: 'osu_beatmapsets' });
        const mapsetsDumpFilePath = path.resolve(DUMP_DIR, 'osu_beatmapsets.sql');
        const sqlFileStream = fs.createReadStream(mapsetsDumpFilePath);
        sqlFileStream.pipe(sqlFileParser);
        const mapsetIdsToSave = [];
        for await (const row of sqlFileParser) {
            const mapsetId = row.beatmapset_id;
            if (storedMapsetIds.has(mapsetId)) continue;
            mapsetIdsToSave.push(mapsetId);
        }

        let countSaved = 0;
        if (mapsetIdsToSave.length > 0) {
            countSaved = await importMapsets(mapsetIdsToSave);
        } else {
            utils.log(`No missing mapsets were found in the dump`);
        }

        // Save last dump import time
        if (mapsetIdsToSave.length == countSaved) {
            utils.writeMiscData('last_dump_import_time', Date.now());
        } else {
            utils.log(`Not marking this dump as successfully imported due to failures`);
        }
    } catch (error) {
        utils.logErr(`Error while importing maps from dump:`, error);
    }
};

/**
 * Use osu's search beatmaps API to work backwards from the most recently ranked maps,
 * importing any that aren't saved until we don't find any more unsaved maps.
 */
const importFromRecents = async () => {
    try {
        let cursor = null;
        const unsavedMapsetIds = [];
        let countCompleteWindows = 0;
        const minCompleteWindowCount = 5;
        while (true) {
            // Fetch mapsets
            const data = await osu.searchBeatmapsets({
                cursor_string: cursor,
                sort: 'ranked_desc',
                nsfw: true
            });

            // Extract data
            cursor = data.cursor_string;
            const mapsets = data.beatmapsets;

            // Loop through mapsets
            let foundUnsavedMapset = false;
            for (const mapset of mapsets) {
                // Skip if we already have this mapset
                const existingMapset = db.prepare(`SELECT 1 FROM beatmapsets WHERE id = ? LIMIT 1`).get(mapset.id);
                if (existingMapset) continue;

                // Make note of unsaved ID
                unsavedMapsetIds.push(mapset.id);
                foundUnsavedMapset = true;
            }

            // If no new mapsets were found in this window, increment complete windows count
            if (!foundUnsavedMapset) {
                countCompleteWindows++;
            } else {
                countCompleteWindows = 0;
            }

            // We're done if no more mapsets, or we didn't find any new ones above
            // foundUnsavedMapsets is only false if all of the mapsets in this batch are already saved
            if (!cursor || mapsets.length === 0 || countCompleteWindows >= minCompleteWindowCount) {
                break;
            }
        }

        if (unsavedMapsetIds.length == 0) return;

        // Reverse list of IDs so we import the newest ones last
        unsavedMapsetIds.reverse();

        // Import unsaved mapsets
        await importMapsets(unsavedMapsetIds);
    } catch (error) {
        utils.logErr(`Error while importing recently ranked mapsets:`, error);
    }
};

/**
 * Using osu's get beatmaps API, fetch data for all saved maps and re-import them if their data has changed.
 */
const scanForChanges = async (rankedAfter = 0) => {
    try {
        const savedMapsets = db.prepare(`SELECT * FROM beatmapsets WHERE time_ranked > ?`).all(rankedAfter);
        const countTotal =
            db.prepare(`SELECT count(*) AS count FROM beatmapsets WHERE time_ranked > ?`).get(rankedAfter)?.count || 0;
        let countProcessed = 0;
        let countChanged = 0;
        let lastLogTime = 0;
        const logProgress = () => {
            if (Date.now() - lastLogTime < 1000 * 5) return;
            const percent = countProcessed ? (countProcessed / countTotal) * 100 : 0;
            utils.log(`Checking map data for changes: ${percent.toFixed(2)}% (${countProcessed} / ${countTotal})`);
            lastLogTime = Date.now();
        };
        logProgress();
        for (const savedMapset of savedMapsets) {
            try {
                // Get list of saved maps
                const savedMaps = db.prepare(`SELECT * FROM beatmaps WHERE beatmapset_id = ?`).all(savedMapset.id);

                // Fetch fresh data from osu api
                // Use the same function used during downloads to get the data formatted
                // with properties matching our database columns
                const { beatmapset: newMapset, beatmaps: newMaps } = await fetchBeatmapsetEntry(savedMapset.id);

                // Map saved and new beatmaps to their IDs
                const savedMapsById = {};
                const newMapsById = {};
                for (const savedMap of savedMaps) {
                    savedMapsById[savedMap.id] = savedMap;
                }
                for (const newMap of newMaps) {
                    newMapsById[newMap.id] = newMap;
                }

                // Check for changes inside a closure so we can return as soon as we find a change
                // We'll use the already defined db column name list to compare properties
                const isChanged = (() => {
                    // Check difficulty counts
                    if (savedMaps.length !== newMaps.length) return true;

                    // Exclude properties that we don't wanna check
                    const excludeMapsetProps = [
                        'id',
                        'novideo_s3_key',
                        'video_s3_key',
                        'novideo_size',
                        'video_size',
                        'novideo_sha256',
                        'video_sha256'
                    ];
                    const excludeMapProps = ['id', 'beatmapset_id'];

                    // If any non-excluded property changed, mark as changed
                    for (const prop of BEATMAPSET_DB_COLUMNS) {
                        if (excludeMapsetProps.includes(prop)) continue;
                        const savedVal = savedMapset[prop];
                        const newVal = newMapset[prop];
                        if (savedVal != newVal) {
                            utils.log(
                                `Mapset changed (${prop}: ${savedVal} -> ${newVal}): ${newMapset.artist} - ${newMapset.title}`
                            );
                            return true;
                        }
                    }

                    // Loop through maps
                    for (const mapId in savedMapsById) {
                        const savedMap = savedMapsById[mapId];
                        const newMap = newMapsById[mapId];

                        // If the new map doesn't exist, mark as changed
                        if (savedMap && !newMap) return true;

                        // If any property changed, mark as changed
                        for (const prop of BEATMAP_DB_COLUMNS) {
                            if (excludeMapProps.includes(prop)) continue;
                            const savedVal = savedMap[prop];
                            const newVal = newMap[prop];
                            if (savedVal != newVal) {
                                utils.log(
                                    `Mapset changed (map ${savedMap.id} ${prop}: ${savedVal} -> ${newVal}): ${newMapset.artist} - ${newMapset.title}`
                                );
                                return true;
                            }
                        }
                    }

                    return false;
                })();

                // Save the mapset if it changed
                if (isChanged) {
                    countChanged++;
                    await importMapsets([savedMapset.id]);
                }
                countProcessed++;

                // Log progress
                logProgress();
            } catch (error) {
                utils.logErr(`Failed to check mapset ${savedMapset.id} for changes`);
            }
        }
        utils.log(`Checked ${countTotal} saved maps for changes and updated ${countChanged} of them`);
    } catch (error) {
        utils.logErr(`Error while scanning maps for changes:`, error);
    }
};

/**
 * Format a beatmapset entry into a standardized object.
 * @param {object} row A row from the `beatmapsets` table.
 */
const formatBeatmapset = row => {};

/**
 * Format a beatmap entry into a standardized object.
 * @param {object} row A row from the `beatmaps` table.
 */
const formatBeatmap = row => {};

/**
 * Get data for one or more saved beatmapsets.
 * @param {number[]} mapsetIds A list of IDs to get data for
 * @param {boolean} [includeBeatmaps=true] Include each mapset's array of maps?
 * @returns An array of beatmapsets.
 */
const getBeatmapsets = (mapsetIds, includeBeatmaps = true) => {};

/**
 * Get data for one or more saved beatmaps.
 * @param {number[]} mapIds A list of IDs to get data for
 * @param {boolean} [includeBeatmapsets=false] Include beatmapsets?
 * @returns An array of beatmaps.
 */
const getBeatmaps = (mapIds, includeBeatmapsets = false) => {};

/**
 * Get data for a single beatmap.
 * @param {number} mapId The map ID
 * @param {boolean} includeBeatmapset Include beatmapset?
 * @returns The beatmap.
 */
const getBeatmap = (mapId, includeBeatmapset = true) => {
    return getBeatmaps([mapId], includeBeatmapset);
};

/**
 * Get data for a single beatmapset.
 * @param {number} mapsetId The mapset ID
 * @param {boolean} includeBeatmaps Include array of beatmaps?
 * @returns The mapset.
 */
const getBeatmapset = (mapsetId, includeBeatmaps = false) => {
    return getBeatmapsets([mapsetId], includeBeatmaps);
};

/**
 * Search and filter within the beatmap index
 * @param {string} query A query containing filters and/or search terms
 * @param {string} [sort='ranked_desc'] The sort order for results
 * @param {number} [limit=100] The maximum number of results to return
 * @param {number} [offset=0] The number of results to skip for pagination
 * @returns A sorted array of beatmapsets with beatmaps included.
 */
const searchBeatmaps = (query, sort = 'ranked_desc', limit = 100, offset = 0) => {};

/**
 * Generate a presigned map download URL
 * @param {number} mapsetId A mapset ID
 * @param {boolean} withVideo Should the download include video if the map has one? Defaults to `true`
 * @returns A presigned URL
 */
const getBeatmapsetDownloadUrl = (mapsetId, withVideo = true) => {
    const row = db.prepare(`SELECT video_s3_key, novideo_s3_key FROM beatmapsets WHERE id = ?`).get(mapsetId);
    if (!row) return null;
    const { video_s3_key: keyVideo, novideo_s3_key: keyNoVideo } = row;
    if (!keyNoVideo) return null;
    return s3.getPresignedUrl(env.S3_BUCKET, withVideo ? keyVideo || keyNoVideo : keyNoVideo);
};

/**
 * Generate a presigned map download URL.
 *
 * This function finds the mapset the map belongs to and calls `getBeatmapsetDownloadUrl()`
 * @param {number} mapId A map ID
 * @param {boolean} withVideo Should the download include video if the map has one? Defaults to `true`
 * @returns A presigned URL
 */
const getBeatmapDownloadUrl = (mapId, withVideo = true) => {
    const row = db.prepare(`SELECT beatmapset_id FROM beatmaps WHERE id = ?`).get(mapId);
    if (!row) return null;
    return getBeatmapsetDownloadUrl(row.beatmapset_id, withVideo);
};

/**
 * The osu!dl API
 */
const api = {
    // Importing and maintenance
    importMapsets,
    importFromDump,
    importFromRecents,
    scanForChanges,

    // Querying
    getBeatmapsets,
    getBeatmapset,
    getBeatmaps,
    getBeatmap,
    searchBeatmaps,

    // Downloading
    getBeatmapDownloadUrl,
    getBeatmapsetDownloadUrl
};

module.exports = api;

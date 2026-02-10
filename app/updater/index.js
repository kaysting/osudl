const env = require('#env');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const tar = require('tar');
const bz2 = require('unbzip2-stream');
const dayjs = require('dayjs');
const db = require('#db');
const utils = require('#utils');
const osu = require('#lib/osu.js');
const SqlDumpParser = require('#lib/SqlDumpParser.js');

const DUMP_DIR = path.join(env.ROOT, 'temp/dump');
const DOWNLOAD_DIR = path.join(env.ROOT, 'temp/downloads');

const saveMapsets = async mapsetIds => {
    try {
        utils.log(`Importing ${mapsetIds.length} mapsets...`);

        // Prepare insert statements
        const beatmapsetCols = [
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
            'has_audio',
            'is_nsfw',
            's3_key',
            'video_s3_key',
            'sha256',
            'size'
        ];
        const beatmapCols = [
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
            'hp'
        ];
        const mapSearchCols = ['title', 'artist', 'version', 'genre', 'tags', 'source', 'beatmap_id', 'beatmapset_id'];
        const insertMapsetStmt = db.prepare(
            `INSERT INTO beatmapsets (${beatmapsetCols.join(', ')})
            VALUES (${beatmapsetCols.map(e => `@${e}`)})`
        );
        const insertMapStmt = db.prepare(
            `INSERT INTO beatmaps (${beatmapCols.join(', ')})
            VALUES (${beatmapCols.map(e => `@${e}`)})`
        );
        const insertMapIndex = db.prepare(
            `INSERT INTO map_search (${mapSearchCols.join(', ')})
            VALUES (${mapSearchCols.map(e => `@${e}`)})`
        );

        // Transaction to save all pending mapsets to the db in bulk
        const savePendingMapsets = db.transaction(entries => {
            for (const entry of entries) {
                const mapset = entry.beatmapset;
                insertMapsetStmt.run(mapset);
                for (const map of entry.beatmapsets) {
                    insertMapStmt.run(map);
                    insertMapIndex.run({ ...map, ...mapset, beatmap_id: map.id, beatmapset_id: mapset.id });
                }
            }
        });

        // Fetch and save data in batches
        while (mapsetIds.length > 0) {
            const ids = mapsetIds.splice(0, 100);
            const entries = [];
            for (const id of ids) {
                // Fetch mapset data
                utils.log(`Fetching data for mapset ${id}`);
                const res = await osu.getBeatmapset(id);

                // Function to download and upload map
                const downloadAndUpload = async () => {
                    // Download mapset
                    utils.log(`Downloading mapset ${id} from osu!...`);
                    const downloadStream = await axios({
                        url: `https://osu.ppy.sh/beatmapsets/${id}/download`,
                        method: 'GET',
                        responseType: 'arraybuffer',
                        maxRedirects: 5,
                        headers: {
                            Referer: `https://osu.ppy.sh/beatmapsets/${id}`,
                            Cookie: `osu_session=${env.OSU_SESSION}`,
                            'User-Agent':
                                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0',
                            Accept: `text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7`
                        }
                    });

                    // Get file details
                    const fileBuffer = downloadStream.data;
                    const fileSize = fileBuffer.length;

                    // Write file to disk for manipulation
                    const filePath = path.join(DOWNLOAD_DIR, `${id}.osz`);
                    fs.writeFileSync(filePath);

                    // Check if mapset has video

                    // If mapset has video, make a copy and remove it

                    // Upload novideo (and video, if applicable) copies to S3
                };

                // Download loop
                while (true) {
                    try {
                        await downloadAndUpload();
                        break;
                    } catch (error) {
                        if (err.response?.status == 429) {
                            utils.log(`Download rate limited by osu!, trying again in a few minute`);
                            await utils.sleep(1000 * 60);
                        } else {
                            throw error;
                        }
                    }
                }

                // Push entry to array to be saved
                entries.push({
                    beatmapset: {},
                    beatmaps: res.beatmaps.map(m => ({}))
                });

                // Wait before looping to hopefully avoid download rate limits
                await utils.sleep(5000);
            }
            savePendingMapsets(entries);
        }
    } catch (error) {
        utils.logErr(`Error while saving mapsets:`, error);
    }
};
const importFromDump = async () => {
    try {
        // Only download dump if we don't already have it or if it's been over a day since we downloaded it
        const lastDumpDownloadTime = parseInt(utils.readMiscData('last_dump_download_time') || 0);
        if (!fs.existsSync(DUMP_DIR) || Date.now() - lastDumpDownloadTime > 1000 * 68 * 60 * 24) {
            // Create dump folder
            if (fs.existsSync(DUMP_DIR)) fs.rmSync(DUMP_DIR, { recursive: true, force: true });
            fs.mkdirSync(DUMP_DIR, { recursive: true });
            utils.log(`Dump will be saved in ${DUMP_DIR}`);

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

        let newMapsetCount = 0;
        if (mapsetIdsToSave.length > 0) {
            await saveMapsets(mapsetIdsToSave);
        } else {
            utils.log(`No missing mapsets were found in the dump`);
        }

        // Repopulate the search table
        const insertIntoIndex = db.prepare(`
        INSERT INTO beatmaps_search (title, artist, version, genre, tags, source, map_id, beatmapset_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
        db.transaction(() => {
            // Get all maps
            const maps = db
                .prepare(
                    `SELECT
                    map.id AS map_id,
                    mapset.id AS beatmapset_id,
                    mapset.title,
                    mapset.artist,
                    mapset.genre,
                    mapset.tags,
                    mapset.source,
                    map.version
                FROM beatmaps map
                JOIN beatmapsets mapset ON map.beatmapset_id = mapset.id`
                )
                .all();
            utils.log(`Rebuilding map search index with ${maps.length} entries`);

            // Clear index
            db.prepare(`DELETE FROM beatmaps_search`).run();

            // Insert missing maps into search index
            for (const row of maps) {
                insertIntoIndex.run(...Object.values(row));
            }
        })();

        // Optimize
        utils.log('Optimizing FTS index...');
        db.prepare("INSERT INTO beatmaps_search(beatmaps_search) VALUES('optimize')").run();

        // Save last dump import time
        utils.writeMiscData('last_dump_import_time', Date.now());
    } catch (error) {
        utils.logErr(`Error while importing maps from dump:`, error);
    }
};

(async () => {
    // Import maps from dump if it's been over a month since the last import
    const lastImportTime = parseInt(utils.readMiscData('last_dump_import_time') || '0');
    const oneMonthAgo = Date.now() - 1000 * 60 * 60 * 24 * 30;
    if (Date.now() - lastImportTime > oneMonthAgo) {
        importFromDump();
    }
})();

utils.initGracefulShutdown(() => {
    db.close();
});

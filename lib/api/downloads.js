const env = require('#env');
const db = require('#db');
const s3 = require('#lib/s3.js');

/**
 * Generate a presigned map download URL
 * @param {number} mapsetId A mapset ID
 * @param {boolean} withVideo Should the download include video if the map has one? Defaults to `true`
 * @returns A presigned URL
 */
const getBeatmapsetDownloadUrl = async (mapsetId, withVideo = true) => {
    const row = db.prepare(`SELECT video_s3_key, novideo_s3_key FROM beatmapsets WHERE id = ?`).get(mapsetId);
    if (!row) return null;

    const { video_s3_key: keyVideo, novideo_s3_key: keyNoVideo } = row;
    if (!keyNoVideo) return null;

    // Determine if we can serve video if requested
    const serveVideo = withVideo && keyVideo != null;

    // Get URL
    const url = await s3.getPresignedUrl(env.S3_BUCKET, serveVideo ? keyVideo : keyNoVideo);

    // Increment download count after successful URL generation
    // At this point we can be basically 100% sure the URL will result in a download
    incrementMapsetDownloadCount(mapsetId, serveVideo);

    return url;
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

let mapsetDownloadCountsCache = {};

const incrementMapsetDownloadCount = (mapsetId, includeVideo) => {
    if (!mapsetDownloadCountsCache[mapsetId]) {
        mapsetDownloadCountsCache[mapsetId] = {
            video: 0,
            novideo: 0
        };
    }
    mapsetDownloadCountsCache[mapsetId][includeVideo ? 'video' : 'novideo']++;
};

const flushMapsetDownloadCounts = () => {
    // Get and reset cache state immediately
    let cache = mapsetDownloadCountsCache;
    mapsetDownloadCountsCache = {};

    // Stop here if no new downloads
    const mapsetIds = Object.keys(cache);
    if (mapsetIds.length === 0) return;

    // Prepare upsert
    const stmtUpsert = db.prepare(`
        INSERT INTO beatmapset_downloads (mapset_id, count_video, count_novideo)
        VALUES (?, ?, ?)
        ON CONFLICT(mapset_id) DO UPDATE SET 
            count_video = count_video + excluded.count_video,
            count_novideo = count_novideo + excluded.count_novideo
    `);

    // Perform changes in a transaction
    db.transaction(() => {
        for (const mapsetId in cache) {
            const count = cache[mapsetId];
            stmtUpsert.run(mapsetId, count.video, count.novideo);
        }
    })();
};

setInterval(flushMapsetDownloadCounts, 1000 * 10);

module.exports = {
    getBeatmapsetDownloadUrl,
    getBeatmapDownloadUrl,
    incrementMapsetDownloadCount
};

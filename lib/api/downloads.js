const env = require('#env');
const db = require('#db');
const s3 = require('#lib/s3.js');

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

module.exports = {
    getBeatmapsetDownloadUrl,
    getBeatmapDownloadUrl
};

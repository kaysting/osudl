const db = require('#db');
const mapsApi = require('#api/beatmaps.js');
const utils = require('#utils');

/**
 * Get a pack entry.
 * @param {string} packId The pack ID
 */
const getPack = packId => {
    // Fetch the base meta info first
    const packMeta = db.prepare(`SELECT * FROM pack_meta WHERE id = ?`).get(packId);
    if (!packMeta) return null;

    // If it's a dynamic query pack, use the beatmaps API to get live sizes
    if (packMeta.query !== null) {
        const stats = mapsApi.searchBeatmapsSizes(packMeta.query);
        return {
            ...packMeta,
            map_count: stats.map_count,
            size_novideo: stats.size_novideo,
            size_video: stats.size_video
        };
    }

    // If it's a static pack, calculate sizes from the junction table
    const stats = db
        .prepare(
            `SELECT
                COUNT(c.mapset_id) AS map_count,
                COALESCE(SUM(b.novideo_size), 0) AS size_novideo,
                COALESCE(SUM(CASE WHEN b.has_video = 1 THEN b.video_size ELSE b.novideo_size END), 0) AS size_video
            FROM pack_contents c
            JOIN beatmapsets b ON c.mapset_id = b.id
            WHERE c.pack_id = ?`
        )
        .get(packId);

    return { ...packMeta, ...stats };
};

/**
 * Get a pack's complete list of mapset IDs.
 * @param {string} packId The pack ID
 * @returns An array of mapset IDs
 */
const getPackContentsRaw = packId => {
    const pack = getPack(packId);
    if (!pack) return null;
    const query = pack.source == 'query' ? pack.query : `pack=${packId}`;
    return mapsApi.searchBeatmapsRaw(query);
};

/**
 * Get the sorted, formatted, and paginated contents of a pack.
 * @param {string} packId The pack ID
 * @param {string} sort The sort order
 * @param {number} limit The number of results to return
 * @param {number} offset The number of results to skip
 * @returns A list of beatmapset objects with beatmaps
 */
const getPackContents = (packId, sort = 'date_desc', limit = 100, offset = 0) => {
    const pack = getPack(packId);
    if (!pack) return null;
    const query = pack.source == 'query' ? pack.query : `pack=${packId}`;
    return mapsApi.searchBeatmaps(query, sort, limit, offset);
};

/** Pack contents insert statement. Expects to be run with a pack id and mapset id. */
const packContentsInsertStmt = db.prepare(`
    INSERT OR IGNORE INTO pack_contents (pack_id, mapset_id)
    SELECT ?, id FROM beatmapsets WHERE id = ?
`);

/**
 * Create a beatmap pack.
 * @param {string} name The pack display name
 * @param {number} [creatorId] The ID of the user who created the pack or `null` if anonymous, defaults to `null`
 * @param {boolean} [visible=true] Whether or not the pack should be visible in pack lists, defaults to `true`
 * @param {string} [query] If set, initialize as a dynamic query pack with this query. Importantly, an empty string counts as a valid query.
 * @returns The resulting pack
 */
const createPack = async (name, creatorId = null, visible = false, query) => {
    // Get new entry id
    const id = utils.randomHex(16);

    // Sanitize name
    const nameSanitized = name.replace(/(\n|\r)/g, ' ').trim();

    let querySanitized = null;
    let source = 'custom';
    if (typeof query === 'string') {
        // Sanitize query if provided
        querySanitized = query.split(' ').filter(Boolean).join(' ');
        source = 'query';

        // Check packs with the same name and query
        // and if found, return the existing pack instead of creating
        // a new one
        const existingEntry = db
            .prepare(`SELECT id FROM pack_meta WHERE name = ? AND query = ?`)
            .get(nameSanitized, querySanitized);
        if (existingEntry) {
            return getPack(existingEntry.id);
        }
    }

    // Create entry
    db.prepare(
        `INSERT INTO pack_meta (
            id, name, creator_user_id, time_created,
            time_updated, source, is_visible, query
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, nameSanitized, creatorId || null, Date.now(), Date.now(), source, visible ? 1 : 0, querySanitized);

    // Return new entry
    return getPack(id);
};

/**
 * Add mapsets to an existing beatmap pack.
 * @param {string} packId The pack ID
 * @param {number[]} newMapsetIds A list of mapset IDs to add
 * @returns The updated pack entry
 */
const addToPack = (packId, newMapsetIds) => {
    const pack = getPack(packId);
    if (pack.source == 'query') return null;
    db.transaction(() => {
        for (const mapsetId of newMapsetIds) {
            packContentsInsertStmt.run(packId, mapsetId);
        }
    })();
    return getPack(packId);
};

/**
 * Add all results of a search query to an existing beatmap pack.
 * @param {string} packId The pack ID
 * @param {string} query The search query whose results to add
 * @returns The updated pack entry
 */
const addQueryToPack = (packId, query) => {
    const pack = getPack(packId);
    if (pack.source == 'query') return null;
    const newMapsetIds = mapsApi.searchBeatmapsRaw(query);
    db.transaction(() => {
        for (const mapsetId of newMapsetIds) {
            packContentsInsertStmt.run(packId, mapsetId);
        }
    })();
    return getPack(packId);
};

/**
 * Remove mapsets from a beatmap pack.
 * @param {string} packId The pack ID
 * @param {number[]} removeIds A list of mapset IDs to remove
 * @returns The updated pack entry
 */
const removeFromPack = (packId, removeIds) => {
    const pack = getPack(packId);
    if (pack.source == 'query') return null;
    const deleteStmt = db.prepare(`DELETE FROM pack_contents WHERE pack_id = ? AND mapset_id = ?`);
    db.transaction(() => {
        for (const mapsetId of removeIds) {
            deleteStmt.run(packId, mapsetId);
        }
    })();
    return getPack(packId);
};

/**
 * Remove all maps from a beatmap pack.
 * @param {string} packId The pack ID
 * @returns The updated pack entry
 */
const wipePack = packId => {
    const pack = getPack(packId);
    if (pack.source == 'query') return null;
    db.prepare(`DELETE FROM pack_contents WHERE pack_id = ?`).run(packId);
    return getPack(packId);
};

/**
 * Rename a beatmap pack.
 * @param {string} packId The pack ID
 * @param {string} name The new name
 * @returns The updated pack entry
 */
const renamePack = (packId, name) => {
    const pack = getPack(packId);
    if (pack.source == 'query') return null;
    if (!getPack(packId)) return null;
    const nameSanitized = name.replace(/(\n|\r)/g, ' ').trim();
    db.prepare(`UPDATE pack_meta SET name = ?, time_updated = ? WHERE id = ?`).run(nameSanitized, Date.now(), packId);
    return getPack(packId);
};

/**
 * Delete a beatmap pack.
 * @param {string} packId The pack ID
 * @returns `true` if deleted, `false` if the pack doesn't exist
 */
const deletePack = packId => {
    const pack = getPack(packId);
    if (!pack) return false;
    db.prepare(`DELETE FROM pack_meta WHERE id = ?`).run(packId);
    return true;
};

/**
 * Create a new download instance for a pack.
 * @param {string} packId The pack ID
 * @param {number} [callingUserId] The ID of the user starting the download, or `null` if anonymous
 * @returns The ID of the new download instance
 */
const initPackDownload = (packId, callingUserId = null) => {
    const pack = getPack(packId);
    if (!pack) return null;
    const downloadId = utils.randomHex(16);
    db.prepare(
        `INSERT INTO pack_downloads (id, pack_id, user_id, time_started)
        VALUES (?, ?, ?, ?)`
    ).run(downloadId, packId, callingUserId, Date.now());
    return downloadId;
};

/**
 * Get an existing pack download instance.
 * @param {string} downloadId The download instance ID
 * @returns The download instance, including pack data under the `pack` property
 */
const getPackDownloadInstance = downloadId => {
    const downloadInstance = db.prepare(`SELECT * FROM pack_downloads WHERE id = ?`).get(downloadId);
    if (!downloadInstance) return null;
    const pack = getPack(downloadInstance.pack_id);
    if (!pack) return null;
    downloadInstance.pack = pack;
    return downloadInstance;
};

/**
 * Increment the downloaded maps counter on a pack download instance.
 * @param {string} downloadId The download instance ID
 * @returns The updated download instance with `pack`
 */
const incrementPackDownloadInstanceMapCount = downloadId => {
    db.prepare(
        `UPDATE pack_downloads
        SET count_maps_downloaded = count_maps_downloaded + 1
        WHERE id = ?`
    ).run(downloadId);
    return getPackDownloadInstance(downloadId);
};

/**
 * Increment the download count on a pack if the provided instance has enough progress.
 * @param {string} downloadId The download instance ID
 * @returns `null` on invalid instance/pack, `false` no no change, `true` on incremented
 */
const incrementPackDownloadCountWithInstance = downloadId => {
    const downloadInstance = getPackDownloadInstance(downloadId);
    if (!downloadInstance) return null;
    const pack = downloadInstance.pack;
    const mapCountThreshold = Math.ceil(pack.map_count * 0.5);
    if (!downloadInstance.is_counted_towards_total && downloadInstance.count_maps_downloaded > mapCountThreshold) {
        db.transaction(() => {
            db.prepare(`UPDATE pack_meta SET count_downloads = count_downloads + 1 WHERE id = ?`).run(pack.id);
            db.prepare(`UPDATE pack_downloads SET is_counted_towards_total = 1 WHERE id = ?`).run(downloadId);
        })();
        return true;
    }
    return false;
};

module.exports = {
    getPack,
    getPackContentsRaw,
    getPackContents,
    createPack,
    addToPack,
    addQueryToPack,
    removeFromPack,
    wipePack,
    renamePack,
    deletePack,
    initPackDownload,
    getPackDownloadInstance,
    incrementPackDownloadInstanceMapCount,
    incrementPackDownloadCountWithInstance
};

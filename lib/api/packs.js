const db = require('#db');
const mapsApi = require('#api/beatmaps.js');
const utils = require('#utils');

/**
 * Get a pack entry.
 * @param {string} packId The pack ID
 */
const getPack = packId => {
    const pack = db
        .prepare(
            `SELECT
                m.id, m.name, m.creator_user_id, m.time_created, m.time_updated,
                m.count_downloads, c.count as map_count, c.size_novideo, c.size_video,
                m.source, m.is_visible, m.content_sha256
            FROM pack_meta m
            JOIN pack_contents c ON m.content_sha256 = c.sha256
            WHERE id = ?`
        )
        .get(packId);
    if (!pack) return null;
    return pack;
};

/**
 * Get a pack's complete list of mapset IDs.
 * @param {string} packId The pack ID
 * @returns An array of mapset IDs
 */
const getPackContents = packId => {
    const pack = getPack(packId);
    const contents = db.prepare(`SELECT mapset_ids FROM pack_contents WHERE sha256 = ?`).get(pack.content_sha256);
    if (!contents) return [];
    return JSON.parse(contents.mapset_ids);
};

/**
 * Get the formatted contents of a pack with pagination.
 * @param {string} packId The pack ID
 * @param {number} limit The number of results to return
 * @param {number} offset The number of results to skip
 * @returns A list of beatmapset objects with beatmaps
 */
const getPackContentsDisplay = (packId, limit = 100, offset = 0) => {
    const mapsetIds = getPackContents(packId);
    if (mapsetIds.length == 0) return [];
    const selectedIds = mapsetIds.slice(offset, offset + limit);
    return mapsApi.getBeatmapsets(selectedIds, true);
};

/**
 * Internal: Create a `pack_contents` entry with the given mapsets.
 * @param {number[]} mapsetIds A list of mapset IDs to create an entry with
 * @returns The sha256 hash of the resulting entry
 */
const createPackContentsEntry = async mapsetIds => {
    // Deduplicate, normalize, filter, and sort mapsets array
    const cleanMapsetIds = Array.from(new Set(mapsetIds))
        .filter(Boolean)
        .map(Number)
        .sort((a, b) => a - b);

    // Get raw JSON for the final list
    const json = JSON.stringify(cleanMapsetIds);

    // Stringify and hash the list of ids
    // This becomes the unique ID for this mapset
    const sha256 = await utils.sha256(json);

    // If this hash already exists, return it without making a new entry
    if (db.prepare(`SELECT 1 FROM pack_contents WHERE sha256 = ?`).get(sha256)) {
        return sha256;
    }

    // Make note of count
    const count = cleanMapsetIds.length;

    // Get total sizes
    // We need to get these values in a loop so as to not overload sqlite
    // with tens of thousands of ids in a single query
    const size = {
        video: 0,
        novideo: 0
    };
    let offset = 0;
    while (true) {
        const ids = cleanMapsetIds.slice(offset, offset + 900);
        if (ids.length == 0) break;
        const res = db
            .prepare(
                `SELECT
                    SUM(novideo_size) AS novideo,
                    SUM(video_size) AS video
                FROM beatmapsets
                WHERE id IN (${ids.map(() => '?').join(', ')})`
            )
            .get(ids);
        offset += ids.length;
        size.video += res.video || 0;
        size.novideo += res.novideo || 0;
    }

    // Create entry
    db.prepare(
        `INSERT INTO pack_contents (sha256, mapset_ids, size_video, size_novideo, count, time_created)
        VALUES (?, ?, ?, ?, ?, ?)`
    ).run(sha256, json, size.video, size.novideo, count, Date.now());

    // Return hash
    return sha256;
};

/**
 * Internal: Delete a `pack_contents` entry if it's not referenced by any existing packs.
 * @param {string} sha256 The contents entry hash
 * @returns `true` if deleted, `false` otherwise
 */
const deleteUnusedPackContentsEntry = sha256 => {
    // Count references
    const count =
        db.prepare(`SELECT count(*) AS count FROM pack_meta WHERE content_sha256 = ?`).get(sha256)?.count || 0;

    // If no references found, delete the content entry
    if (count == 0) {
        db.prepare(`DELETE FROM pack_contents WHERE sha256 = ?`).run(sha256);
        return true;
    }

    return false;
};

/**
 * Create a beatmap pack.
 * @param {string} name The pack display name
 * @param {string} source The source of pack creation
 * @param {number} [creatorId] The ID of the user who created the pack or `null` if anonymous, defaults to `null`
 * @param {boolean} [visible=true] Whether or not the pack should be visible in pack lists, defaults to `true`
 * @param {number[]} [mapsetIds=[]] A list of mapset IDs to initialize the pack with
 * @returns The resulting `pack_meta` entry
 */
const createPack = async (name, source, creatorId = null, visible = false, mapsetIds = []) => {
    // Get hash for maps
    const sha256 = await createPackContentsEntry(mapsetIds);

    // Get new entry id
    const id = utils.randomHex(16);

    // Sanitize name
    const nameSanitized = name.replace(/(\n|\r)/g, ' ').trim();

    // Create entry
    db.prepare(
        `INSERT INTO pack_meta (
            id, name, creator_user_id, content_sha256, time_created,
            time_updated, source, is_visible
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, nameSanitized, creatorId || null, sha256, Date.now(), Date.now(), source, visible ? 1 : 0);

    // Return new entry
    return getPack(id);
};

/**
 * Internal: Edit the contents of a beatmap pack.
 * @param {string} packId The pack ID
 * @param {function} editorFunction A callback function that receives an array of the pack's current mapset IDs and returns an edited array.
 * @returns The updated pack entry
 */
const editPackContents = async (packId, editorFunction = () => {}) => {
    // Get pack entry and contents
    const pack = getPack(packId);
    const currentIds = getPackContents(packId);

    // Run the provided editor function to get the new list of ids
    const newIds = await editorFunction(currentIds);

    // Create a new content entry and hash
    const newHash = await createPackContentsEntry(newIds);

    // If the hash changed, update the pack entry,
    // then delete the old contents entry if it's now unused
    if (pack.content_sha256 !== newHash) {
        db.prepare(
            `UPDATE pack_meta
            SET content_sha256 = ?, time_updated = ?
            WHERE id = ?`
        ).run(newHash, Date.now(), pack.id);
        deleteUnusedPackContentsEntry(pack.content_sha256);
    }

    // Return new pack
    return getPack(packId);
};

/**
 * Add mapsets to an existing beatmap pack.
 * @param {string} packId The pack ID
 * @param {number[]} newMapsetIds A list of mapset IDs to add
 */
const addToPack = (packId, newMapsetIds) => {
    return editPackContents(packId, ids => {
        ids.push(...newMapsetIds);
        return ids;
    });
};

/**
 * Add all results of a search query to an existing beatmap pack.
 * @param {string} packId The pack ID
 * @param {string} query The search query whose results to add
 */
const addQueryToPack = (packId, query) => {
    const newMapsetIds = mapsApi.searchBeatmapsRaw(query);
    return editPackContents(packId, ids => {
        ids.push(...newMapsetIds);
        return ids;
    });
};

/**
 * Remove mapsets from a beatmap pack.
 * @param {string} packId The pack ID
 * @param {number[]} removeIds A list of mapset IDs to remove
 */
const removeFromPack = (packId, removeIds) => {
    return editPackContents(packId, currentIds => {
        const newIds = [];
        for (const id of currentIds) {
            if (removeIds.includes(id)) continue;
            newIds.push(id);
        }
        return newIds;
    });
};

/**
 * Remove all maps from a beatmap pack.
 * @param {string} packId The pack ID
 */
const wipePack = packId => {
    return editPackContents(packId, ids => {
        return [];
    });
};

/**
 * Rename a beatmap pack.
 * @param {string} packId The pack ID
 * @param {string} name The new name
 * @returns The updated pack entry
 */
const renamePack = (packId, name) => {
    if (!getPack(packId)) return null;
    const nameSanitized = name.replace(/(\n|\r)/g, ' ').trim();
    db.prepare(`UPDATE pack_meta SET name = ? WHERE id = ?`).run(nameSanitized, packId);
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
    deleteUnusedPackContentsEntry(pack.content_sha256);
    return true;
};

module.exports = {
    getPack,
    getPackContents,
    getPackContentsDisplay,
    createPack,
    addToPack,
    addQueryToPack,
    removeFromPack,
    wipePack,
    renamePack,
    deletePack
};

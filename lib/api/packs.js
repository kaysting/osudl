const db = require('#db');

/**
 * Get a pack entry.
 * @param {string} packId The pack ID
 * @param {boolean} [withContents=true] Include the pack's list of mapset IDs? Defaults to `true`
 */
const getPack = (packId, withContents = true) => {};

/**
 * Internal: Create a `pack_contents` entry with the given mapsets.
 * @param {number[]} mapsetIds A list of mapset IDs to create an entry with
 * @returns The sha256 hash of the resulting entry
 */
const createPackContentsEntry = mapsetIds => {};

/**
 * Internal: Delete a `pack_contents` entry if it's not referenced by any existing packs.
 * @param {string} sha256 The contents entry hash
 */
const deleteUnusedPackContentsEntry = sha256 => {};

/**
 * Create a beatmap pack.
 * @param {string} name The pack display name
 * @param {string} source The source of pack creation, either `query` or `custom`
 * @param {number} creatorId The ID of the user who created the pack or `null` if anonymous
 * @param {number[]} mapsetIds A list of mapset IDs to initialize the pack with
 * @returns The resulting `pack_meta` entry
 */
const createPack = (name, source, creatorId = null, mapsetIds = []) => {};

/**
 * Internal: Edit the contents of a beatmap pack.
 * @param {string} packId The pack ID
 * @param {function} editorFunction A callback function that receives an array of the pack's current mapset IDs and returns an edited array.
 */
const editPackContents = (packId, editorFunction = () => {}) => {};

/**
 * Add mapsets to an existing beatmap pack.
 * @param {string} packId The pack ID
 * @param {number[]} mapsetIds A list of mapset IDs to add
 */
const addToPack = (packId, mapsetIds) => {};

/**
 * Add all results of a search query to an existing beatmap pack.
 * @param {string} packId The pack ID
 * @param {string} query The search query whose results to add
 */
const addQueryToPack = (packId, query) => {};

/**
 * Remove mapsets from a beatmap pack.
 * @param {string} packId The pack ID
 * @param {number[]} mapsetIds A list of mapset IDs to remove
 */
const removeFromPack = (packId, mapsetIds) => {};

module.exports = {
    getPack,
    createPack,
    addToPack,
    addQueryToPack,
    removeFromPack
};

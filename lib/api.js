/**
 * The osu!dl API
 */
const api = {
    ...require('#api/ingest.js'),
    ...require('#api/beatmaps.js'),
    ...require('#api/packs.js'),
    ...require('#api/downloads.js')
};

module.exports = api;

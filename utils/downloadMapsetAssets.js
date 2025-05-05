const db = require('../helpers/db');
const utils = require('../helpers/utils.js');

(async() => {
    const mapsetIds = (await db.all(
        `SELECT id FROM beatmapsets
        WHERE file_name_cover IS NULL OR file_name_card IS NULL OR file_name_preview IS NULL
        ORDER BY id DESC`
    )).map(entry => entry.id);
    if (!mapsetIds.length) {
        if (i === 0) {
            console.log(`All mapset assets are downloaded!`);
        }
        process.exit(0);
    }
    for (const id of mapsetIds) {
        await utils.downloadBeatmapsetAssets(id);
    }
    process.exit(0);
})();
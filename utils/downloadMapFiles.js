const db = require('../helpers/db');
const utils = require('../helpers/utils');

(async() => {

    while (true) {
        const diffs = await db.all(
            `SELECT DISTINCT set_id FROM beatmaps
            WHERE file_name IS NULL
            LIMIT 1000`
        );
        if (!diffs.length) {
            break;
        }
        for (const diff of diffs) {
            await utils.downloadBeatmapsetDiffs(diff.set_id, true);
        }
    }

})();
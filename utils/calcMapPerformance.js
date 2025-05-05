const db = require('../helpers/db');
const utils = require('../helpers/utils');
const config = require('../config.json');

(async() => {

    let i = 0;
    while (true) {
        const diffIds = (await db.all(
            `SELECT id FROM beatmaps
            WHERE file_name IS NOT NULL
            LIMIT 1000 OFFSET ${i}`
        )).map(entry => entry.id);
        if (!diffIds.length) {
            break;
        }
        for (const id of diffIds) {
            await utils.calculateBeatmapMaxPP(id);
            for (const mods of config.stored_pp_mods) {
                await utils.calculateBeatmapMaxPP(id, mods);
            }
        }
        i += diffIds.length;
    }

    process.exit(0);

})();
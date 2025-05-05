const osuApi = require('../helpers/osuApi.js');
const utils = require('../helpers/utils.js');

(async() => {

    // Replace map data older than this date
    const force = false;

    let cursorString = '';
    while (true) {
        try {
            const res = await osuApi.get(`beatmapsets/search?sort=ranked_desc&nsfw=true&cursor_string=${cursorString}`);
            let savedNewData = false;
            for (const mapset of res.beatmapsets) {
                const mapsetSaved = await utils.getBeatmapsetById(mapset.id);
                if (mapsetSaved && !force) continue;
                await utils.saveBeatmapset(mapset);
                savedNewData = true;
                console.log(`Saved data for mapset ${mapset.id} ${mapset.artist} - ${mapset.title}`);
            }
            if (!savedNewData) {
                console.log(`All recent mapset data is downloaded!`);
                break;
            }
            if (!res.cursor_string) break;
            cursorString = res.cursor_string;
        } catch (error) {
            console.error(error.toString());
        }
    }

    process.exit(0);

})();
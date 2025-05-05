const utils = require('./helpers/utils.js');
const db = require('./helpers/db.js');

(async() => {
    const run = async () => {
        try {
            await utils.forkSync('./utils/fetchMapsetData.js');
            await utils.forkSync('./utils/downloadMapsetFiles.js');
            const lastPlaycountUpdate = await db.get(
                `SELECT MAX(date) as last_playcount_update
                FROM beatmapset_playcount_snapshots`, [], 'last_playcount_update'
            );
            if (!lastPlaycountUpdate || (Date.now() - lastPlaycountUpdate) > (1000 * 60 * 60 * 24)) {
                await utils.forkSync('./utils/fetchMapsetPlaycounts.js');
                await utils.forkSync('./utils/indexAllMaps.js');
            }
        } catch (error) {
            console.error(error.toString());
            await utils.sendDiscordAlert(`<@322141003123523584> Fatal error in update loop: ${error.toString()}`);
            process.exit(1);
        }
    }
    do {
        await run();
        const msDelay = 1000 * 60 * 1;
        console.log(`Scripts will run again in a minute...`);
        await utils.sleep(msDelay);
    } while (true);
})();

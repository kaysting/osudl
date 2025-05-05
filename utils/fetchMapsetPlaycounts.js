const osuApi = require('../helpers/osuApi.js');
const db = require('../helpers/db.js');
const elastic = require('../helpers/elastic.js');
const utils = require('../helpers/utils.js');

(async() => {

    let i = 0;
    while (true) {
        const entries = await db.all(
            `SELECT MIN(id) as map_id, set_id
            FROM beatmaps
            GROUP BY set_id
            LIMIT 50 OFFSET ${i}`
        );
        if (!entries.length) break;
        const mapIds = entries.map(entry => entry.map_id);
        const res = await osuApi.get(`beatmaps?ids[]=${mapIds.join('&ids[]=')}`);
        for (const map of res.beatmaps) {
            const mapset = map.beatmapset;
            const playCountTotal = mapset.play_count;
            await db.run(
                `INSERT INTO beatmapset_playcount_snapshots (set_id, count_plays) VALUES (?, ?)`,
                [ mapset.id, playCountTotal ]
            );
            const oneDayAgo = new Date(Date.now() - (1000 * 60 * 60 * 24));
            const oneWeekAgo = new Date(Date.now() - (1000 * 60 * 60 * 24 * 7));
            const oneMonthAgo = new Date(Date.now() - (1000 * 60 * 60 * 24 * 30));
            const playCountOneDayAgo = await db.get(
                `SELECT count_plays FROM beatmapset_playcount_snapshots
                WHERE set_id = ? AND date < ?`,
                [ mapset.id, oneDayAgo ], 'count_plays'
            );
            const playCountOneWeekAgo = await db.get(
                `SELECT count_plays FROM beatmapset_playcount_snapshots
                WHERE set_id = ? AND date < ?
                ORDER BY date ASC`,
                [ mapset.id, oneWeekAgo ], 'count_plays'
            );
            const playCountOneMonthAgo = await db.get(
                `SELECT count_plays FROM beatmapset_playcount_snapshots
                WHERE set_id = ? AND date < ?
                ORDER BY date ASC`,
                [ mapset.id, oneMonthAgo ], 'count_plays'
            );
            const playCountDaily = playCountOneDayAgo ? playCountTotal - playCountOneDayAgo : 0;
            const playCountWeekly = playCountOneWeekAgo ? playCountTotal - playCountOneWeekAgo : 0;
            const playCountMonthly = playCountOneMonthAgo ? playCountTotal - playCountOneMonthAgo : 0;
            await db.run(
                `UPDATE beatmapsets SET
                    count_plays = ?,
                    count_plays_past_day = ?,
                    count_plays_past_week = ?,
                    count_plays_past_month = ?
                WHERE id = ?`,
                [ playCountTotal, playCountDaily, playCountWeekly, playCountMonthly, mapset.id ]
            );
            console.log(`[${i}] Updated playcount for mapset ${mapset.id}: daily/weekly/monthly/total = ${playCountDaily}/${playCountWeekly}/${playCountMonthly}/${playCountTotal}`);
            i++;
        }
    }

    process.exit(0);

})();
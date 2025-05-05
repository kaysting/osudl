const db = require('../../helpers/db');

(async () => {
    
    const res = await db.run(`
        INSERT INTO beatmaps_searchable
            SELECT v.*
            FROM beatmaps_searchable_view v
            LEFT JOIN beatmaps_searchable s ON v.map_id = s.map_id
            WHERE s.map_id IS NULL
    `);

    console.log(`Added ${res[0].affectedRows} new entries to searchable beatmaps table`);
    process.exit(0);
})();
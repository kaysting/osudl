const db = require('../../helpers/db');

(async () => {
    console.log('Rebuilding beatmap search table...');
    const startTime = Date.now();

    await db.run('DROP TABLE IF EXISTS beatmaps_searchable_staging');
    await db.run('CREATE TABLE beatmaps_searchable_staging LIKE beatmaps_searchable');
    await db.run('INSERT INTO beatmaps_searchable_staging SELECT * FROM beatmaps_searchable_view');
    await db.run(`
        RENAME TABLE
          beatmaps_searchable TO beatmaps_searchable_old,
          beatmaps_searchable_staging TO beatmaps_searchable
    `);
    await db.run('DROP TABLE beatmaps_searchable_old');

    console.log(`Rebuilt in ${(Date.now() - startTime)}ms`);
    process.exit(0);
})();
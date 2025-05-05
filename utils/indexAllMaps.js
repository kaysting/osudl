const elastic = require('../helpers/elastic');
const db = require('../helpers/db');
const utils = require('../helpers/utils');

(async () => {
    const indexName = 'beatmaps';
    const shouldRebuild = process.argv.includes('rebuild');
    const limit = 1000;
    let i = 0;

    if (shouldRebuild) {
        // Delete the existing beatmaps index if it exists
        const indexExists = await elastic.indices.exists({ index: indexName });
        if (indexExists) {
            console.log(`Deleting existing index "${indexName}"...`);
            await elastic.indices.delete({ index: indexName });
        }
    
        // Create the beatmaps index
        console.log(`Creating index "${indexName}"...`);
        await elastic.indices.create({
            index: indexName,
            body: {
                ...(require('../index-beatmaps.json'))
            }
        });
    }

    while (true) {
        const mapsets = await db.all(`SELECT id FROM beatmapsets LIMIT ${limit} OFFSET ${i}`);
        if (!mapsets.length) {
            if (i === 0) {
                console.log(`No beatmaps to index.`);
            }
            break;
        }
        const ops = [];
        for (const mapset of mapsets) {
            const fieldGroups = await utils.getBeatmapsetIndexFields(mapset.id);
            for (const fields of fieldGroups) {
                ops.push({
                    index: {
                        _index: indexName,
                        _id: fields.map_id
                    }
                });
                ops.push(fields);
            }
        }
        const totalBeatmaps = ops.length / 2;
        await elastic.bulk({
            body: ops
        });
        console.log(`Indexed ${totalBeatmaps} beatmaps from ${mapsets.length} mapsets`);
        i += limit;
    }

    await elastic.indices.refresh({ index: indexName });

    console.log('Reindexing complete!');
    process.exit(0);
})();
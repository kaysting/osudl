const fs = require('fs');
const config = require('../../config.json');

const mapsetsById = require('./mapsetsById.json');
const mapsetIds = Object.keys(mapsetsById);
const mapFileNames = fs.readdirSync(config.maps_dir).filter(fileName => fileName.endsWith('.osz'));
const orphanedMapFiles = [];

for (const fileName of mapFileNames) {
    const mapsetId = fileName.split(' ')[0];
    if (!mapsetIds.includes(mapsetId)) {
        console.log(`Orphaned map file found: ${fileName}`);
        orphanedMapFiles.push(fileName);
    }
}

fs.writeFileSync('orphanedMapsets.json', JSON.stringify(orphanedMapFiles, null, 2));
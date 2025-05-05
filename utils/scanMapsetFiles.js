const fs = require('fs');
const path = require('path');
const utils = require('../helpers/utils.js');
const config = require('../config.json');

(async() => {

    const noVideoMapFileNames = fs.readdirSync(config.maps_dir).filter(fileName => fileName.endsWith('.osz'));
    let i = 0;
    for (const fileName of noVideoMapFileNames) {
        const id = parseInt(fileName.split(' ')[0]);
        const noVideoPath = path.join(config.maps_dir, fileName);
        const videoPath = path.join(config.video_maps_dir, fileName);
        await utils.updateBeatmapsetFileData(id, noVideoPath, videoPath);
        i++;
        console.log(`[${i}/${noVideoMapFileNames.length}] Updated mapset ${id} file data: ${fileName}`);
    }
    process.exit(0);

})();
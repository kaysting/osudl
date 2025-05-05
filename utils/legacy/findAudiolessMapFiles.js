const fs = require('fs');
const AdmZip = require('adm-zip');
const config = require('../../config.json');

//const mapFileNames = fs.readdirSync(config.maps_dir).filter(fileName => fileName.endsWith('.osz'));
const mapFileNames = require('./orphanedMapsets.json');
const audiolessFileNames = [];

let i = 0;
for (const fileName of mapFileNames) {
    i++;
    try {
        const zip = new AdmZip(`${config.maps_dir}/${fileName}`);
        const entries = zip.getEntries();
        let hasAudio = false;
        for (const entry of entries) {
            const json = entry.toJSON();
            const name = entry.entryName;
            const size = parseInt(json.header.size.split(' ')[0]);
            if (name.match(/\.(mp3|ogg|wav|m4a)$/gi) && size > 1024*1024) {
                hasAudio = true;
                break;
            }
        }
        if (!hasAudio) {
            console.log(`[${i}/${mapFileNames.length}] Map is MISSING audio: ${fileName}`);
            audiolessFileNames.push(fileName);
        } else {
            console.log(`[${i}/${mapFileNames.length}] Map contains audio: ${fileName}`);
        }
    } catch (error) {
        console.error(`[${i}/${mapFileNames.length}] Error reading ${fileName}: ${error.message}`);
    }
}

fs.writeFileSync('audiolessMapsets.json', JSON.stringify(audiolessFileNames, null, 2));
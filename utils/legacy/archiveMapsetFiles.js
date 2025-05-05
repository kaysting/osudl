const fs = require('fs');
const archiver = require('archiver');
const config = require('../../config.json');

const mapsetsById = require('./mapsetsById.json');

// Ensure the zips directory exists
for (const dir of [ config.zips_dir ]) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

const getMonthString = (date = Date.now()) => {
    const dateObj = new Date(date);
    const year = dateObj.getUTCFullYear().toString().padStart(4, '0');
    const month = (dateObj.getUTCMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
}

async function main() {
    // Read and sort map files in the directory
    const mapFileNames = fs.readdirSync(config.maps_dir);
    mapFileNames.sort((a, b) => {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
    const monthCurrentName = getMonthString();

    // Group files by the month they were ranked
    const filesByMonth = {};
    for (const fileName of mapFileNames) {
        const filePath = `${config.maps_dir}/${fileName}`;
        const id = parseInt(fileName.split(' ')[0]); // Extract beatmapset ID from the file name
        if (!id) continue; // Skip files without a valid ID
        if (!fileName.endsWith('.osz')) continue; // Skip non-osz files

        // Fetch beatmapset details from the database
        const beatmapset = mapsetsById[id];
        if (!beatmapset) {
            console.warn(`Data for beatmapset ${id} not found in mapsetsById.json`);
            continue;
        }

        // Determine the month the beatmapset was ranked
        const monthRankedName = getMonthString(new Date(beatmapset.date_ranked).getTime());

        if (monthRankedName === monthCurrentName) {
            //console.log(`Skipping beatmapset ${id} ranked this month (${monthCurrentName})`);
            continue;
        }

        // Group files by their ranked month
        if (!filesByMonth[monthRankedName]) {
            filesByMonth[monthRankedName] = [];
        }
        filesByMonth[monthRankedName].push(filePath);
    }

    // Figure out which months need to be zipped
    const monthsAll = Object.keys(filesByMonth).sort();
    const monthsNeeded = [];
    let countFilesTotal = mapFileNames.length;
    let countFilesZipped = 0;
    let countFilesZippedRel = 0;
    const timings = [];
    for (const month of monthsAll) {
        const monthFilePaths = filesByMonth[month];
        const zipPath = `${config.zips_dir}/${month}.zip`;
        if (fs.existsSync(zipPath)) {
            //console.log(`Archive of month ${month} already exists: ${zipPath}`);
            countFilesZipped += monthFilePaths.length;
            continue;
        }
        monthsNeeded.push(month);
    }

    if (monthsNeeded.length === 0) {
        console.log(`All months are already zipped (excluding this month)`);
        return;
    }

    // Create zip files for each month
    for (const month of monthsNeeded) {
        const monthFilePaths = filesByMonth[month];
        const zipPathTemp = `${config.zips_dir}/temp.zip`;
        const zipPath = `${config.zips_dir}/${month}.zip`;
        if (fs.existsSync(zipPathTemp)) {
            fs.rmSync(zipPathTemp, { force: true });
        }

        // Create a zip archive for the files
        await new Promise((resolve, reject) => {
            const output = fs.createWriteStream(zipPathTemp);
            const archive = archiver('zip', {
                zlib: { level: 9 } // Maximum compression
            });
            output.on('close', () => {
                fs.renameSync(zipPathTemp, zipPath); // Rename temp zip to final zip
                console.log(`Finalized archive of month ${month}: ${zipPath}`);
                resolve();
            });
            archive.on('error', reject);
            let countMonthFilesZipped = 0;
            archive.on('entry', (entry) => {
                countMonthFilesZipped++;
                countFilesZipped++;
                countFilesZippedRel++;
                timings.push(Date.now());
                while (timings.length > 500) {
                    timings.splice(0, 100);
                }
                const msPerFile = (timings[timings.length - 1] - timings[0]) / timings.length;
                const filesLeft = countFilesTotal - countFilesZipped;
                const msLeft = msPerFile * filesLeft;
                const minsLeft = Math.floor(msLeft / 1000 / 60);
                const percentTotal = ((countFilesZipped / countFilesTotal) * 100).toFixed(2);
                const percentMonth = ((countMonthFilesZipped / monthFilePaths.length) * 100).toFixed(2);
                console.log(`ETA ${minsLeft} mins | Total ${percentTotal}% | Month ${percentMonth}% | Adding map ${entry.name.split('/').pop().split(' ').shift()} to month archive ${month}`);
            });
            archive.pipe(output);
            // Add files to the archive
            for (const filePath of monthFilePaths) {
                archive.file(filePath, {
                    name: filePath.split('/').pop() // Use the file name without the path
                });
            }
            archive.finalize(); // Finalize the archive
        });
    }
}

// Run the main function
main();

// Handle SIGINT (Ctrl+C) to close the database gracefully
process.on('SIGINT', () => {
    console.log('Closing database...');
    process.exit(0);
});
const fs = require('fs');
const path = require('path');
const config = require('../../config.json');

const sanitizeFileName = fileName => {
    // Replace characters that are not allowed in file names
    return fileName.replace(/[<>:"/\\|?*]/g, '_').trim();
}

const links = [];
const mapFileNames = fs.readdirSync(config.maps_dir);
const mapsetsById = require('./mapsetsById.json');

console.log(`Compiling links for ${mapFileNames.length} mapset files...`);
for (const fileName of mapFileNames) {
    const mapFilePath = path.join(config.maps_dir, fileName);
    const setId = parseInt(fileName.split(' ')[0]);
    const set = mapsetsById[setId];
    if (!set) continue;
    const rankedDate = new Date(set.date_ranked);
    const rankedMonthName = `${rankedDate.getFullYear()}-${(rankedDate.getMonth() + 1).toString().padStart(2, '0')}`;
    const rankedYearName = rankedDate.getFullYear().toString();
    const title = sanitizeFileName(set.title);
    const artist = sanitizeFileName(set.artist);
    const mapper = sanitizeFileName(set.mapper);
    const linkPaths = [
        path.join(config.links_dir, '_uncategorised', fileName),
        path.join(config.links_dir, 'month', rankedMonthName, fileName),
        path.join(config.links_dir, 'year', rankedYearName, fileName),
        path.join(config.links_dir, 'artist', artist, fileName),
        path.join(config.links_dir, 'title', title, fileName),
        path.join(config.links_dir, 'mapper', mapper, fileName),
    ];
    const modes = [];
    const starStrings = [];
    const modeStarStrings = [];
    for (const diff of Object.values(set.difficulties)) {
        const modeMap = {
            osu: 'standard',
            taiko: 'taiko',
            mania: 'mania',
            fruits: 'catch',
        };
        const mode = modeMap[diff.mode];
        if (!modes.includes(mode)) {
            modes.push(mode);
        }
        const stars = parseFloat(diff.stars);
        let starString;
        if (stars < 11) {
            const floored = Math.floor(stars);
            starString = `${floored}-${floored + 0.99}`;
        } else {
            starString = `11+`;
        }
        if (!starStrings.includes(starString)) {
            starStrings.push(starString);
        }
        const modeStarString = `${mode}/${starString}`;
        if (!modeStarStrings.includes(modeStarString)) {
            modeStarStrings.push(modeStarString);
        }
    }
    for (const mode of modes) {
        linkPaths.push(path.join(config.links_dir, 'mode', mode, fileName));
        linkPaths.push(path.join(config.links_dir, 'mode-month', mode, rankedMonthName, fileName));
        linkPaths.push(path.join(config.links_dir, 'mode-year', mode, rankedYearName, fileName));
    }
    for (const stars of starStrings) {
        linkPaths.push(path.join(config.links_dir, 'stars', stars, fileName));
    }
    for (const modeStars of modeStarStrings) {
        linkPaths.push(path.join(config.links_dir, 'mode-stars', modeStars, fileName));
    }
    for (const linkPath of linkPaths) {
        links.push([ mapFilePath, linkPath ]);
    }
}
console.log(`Processing ${links.length} mapset links...`);

for (const link of links) {
    const [ src, dest ] = link;
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
        console.log(`Created directory: ${destDir}`);
    }
    if (!fs.existsSync(dest)) {
        fs.symlinkSync(src, dest);
        console.log(`Created symlink: ${dest} -> ${src}`);
    } else {
        //console.log(`Link already exists: ${dest}`);
    }
}

// Function to round a number based on its size
const roundSmart = (num) => {
    if (num < 1)
        return parseFloat(num.toFixed(3));
    if (num < 10)
        return parseFloat(num.toFixed(2));
    if (num < 100)
        return parseFloat(num.toFixed(1));
    return parseFloat(num.toFixed(0));
};

// Function to format bytes into a human-readable string
const formatBytes = bytes => {
    const units = [ 'B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB' ];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
        bytes /= 1024;
        i++;
    }
    return `${roundSmart(bytes)} ${units[i]}`;
};

const formatNumber = num => {
    return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

console.log(`Creating quick download readmes...`);
const readmeDirs = [
    path.join(config.links_dir, 'month'),
    path.join(config.links_dir, 'year'),
    path.join(config.links_dir, 'stars'),
    path.join(config.links_dir, 'mode'),
];
const readmeSubDirs = [
    path.join(config.links_dir, 'mode-stars'),
    path.join(config.links_dir, 'mode-month'),
    path.join(config.links_dir, 'mode-year'),
];
for (const dirPathAbs of readmeSubDirs) {
    const subDirNames = fs.readdirSync(dirPathAbs).filter(name => fs.statSync(path.join(dirPathAbs, name)).isDirectory());
    const subDirPaths = subDirNames.map(name => path.join(dirPathAbs, name));
    readmeDirs.push(...subDirPaths);
}
for (const dirPathAbs of readmeDirs) {
    const dirPathRel = path.relative(config.links_dir, dirPathAbs);
    const subDirNames = fs.readdirSync(dirPathAbs).filter(name => fs.statSync(path.join(dirPathAbs, name)).isDirectory());
    subDirNames.sort((a, b) => a.localeCompare(b, undefined, {
        sensitivity: 'base',
        numeric: true
    }));
    if (dirPathRel.match(/(month|year)/g)) {
        subDirNames.reverse();
    }
    const mdLines = [
        `# Download links for ${dirPathRel.replace('./', '')}\n`
    ];
    for (const subDirName of subDirNames) {
        const files = fs.readdirSync(path.join(dirPathAbs, subDirName));
        const mapFileNames = files.filter(file => file.endsWith('.osz'));
        let size = 0;
        let count = mapFileNames.length;
        for (const fileName of mapFileNames) {
            const stats = fs.statSync(path.join(dirPathAbs, subDirName, fileName));
            size += stats.size;
        }
        const sizeFormatted = formatBytes(size);
        const countFormatted = formatNumber(count);
        mdLines.push(`**[Download ${subDirName}](/${dirPathRel}/${subDirName}/?format=zip): ${countFormatted} maps** (${sizeFormatted})\n`);
    }
    mdLines.push(`*This file was created automatically as part of the map linking process. See this site's home page, [osu! Ranked Maps](/), for details.*`)
    fs.writeFileSync(path.join(dirPathAbs, 'README.md'), mdLines.join('\n'));
}
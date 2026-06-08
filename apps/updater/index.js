const db = require('#db');
const utils = require('#utils');
const ingest = require('#api/ingest.js');

const axios = require('axios');
let isOsuOnline = null;
const checkOsuAccessibility = async () => {
    const oldStatus = isOsuOnline;
    let statusCode = null;
    try {
        await axios.get('https://osu.ppy.sh/api/v2/auth/token');
        isOsuOnline = true;
    } catch (error) {
        statusCode = error.response?.status;
        isOsuOnline = statusCode === 401;
    }
    if (oldStatus !== isOsuOnline) {
        if (isOsuOnline) {
            utils.log(`osu! API is online`);
        } else {
            utils.logErr(
                `osu! API is currently inaccessible (error ${statusCode}), updates will be delayed until access is restored`
            );
        }
    }
    setTimeout(checkOsuAccessibility, 1000 * 60 * 10);
    return isOsuOnline;
};

// Import maps from dump if it's been over a month since the last import
const runImport = async () => {
    const lastImportTime = parseInt(utils.readMiscData('last_dump_import_time') || '0');
    const oneMonth = 1000 * 60 * 60 * 24 * 30;
    if (isOsuOnline && Date.now() - lastImportTime > oneMonth) {
        await ingest.importFromDump();
    }
    setTimeout(runImport, 1000 * 60 * 60 * 24);
};

const runRecents = async () => {
    if (isOsuOnline && utils.readMiscData('last_dump_import_time')) {
        await ingest.importFromRecents();
    }
    setTimeout(runRecents, 1000 * 60);
};

// Check all saved maps against the osu API for changes
const runFullScan = async () => {
    if (isOsuOnline && utils.readMiscData('last_dump_import_time')) {
        await ingest.scanForChanges();
        setTimeout(runFullScan, 1000 * 60 * 60 * 24);
    } else {
        setTimeout(runFullScan, 1000 * 60);
    }
};

// Frequently scan recently ranked maps for changes
// This allows us to reflect unranks/updates quickly
const runRecentScan = async () => {
    if (isOsuOnline && utils.readMiscData('last_dump_import_time')) {
        const oneWeekAgo = Date.now() - 1000 * 60 * 60 * 24 * 7;
        await ingest.scanForChanges(oneWeekAgo);
    }
    setTimeout(runRecentScan, 1000 * 60 * 15);
};

(async () => {
    // Check osu API status
    await checkOsuAccessibility();

    // Start these immediately
    runImport();
    runRecents();
    runRecentScan();

    // Delay these
    setTimeout(runFullScan, 1000 * 60 * 60);

    utils.log(`Started update processes`);
})();

utils.initGracefulShutdown(() => {
    db.close();
});

const db = require('#db');
const utils = require('#utils');
const ingest = require('#api/ingest.js');

// Import maps from dump if it's been over a month since the last import
const runImport = async () => {
    const lastImportTime = parseInt(utils.readMiscData('last_dump_import_time') || '0');
    const oneMonth = 1000 * 60 * 60 * 24 * 30;
    if (Date.now() - lastImportTime > oneMonth) {
        await ingest.importFromDump();
    }
    setTimeout(runImport, 1000 * 60 * 60 * 24);
};

const runRecents = async () => {
    if (utils.readMiscData('last_dump_import_time')) {
        await ingest.importFromRecents();
    }
    setTimeout(runRecents, 1000 * 60);
};

// Check all saved maps against the osu API for changes
const runFullScan = async () => {
    if (utils.readMiscData('last_dump_import_time')) {
        await ingest.scanForChanges();
        setTimeout(runFullScan, 1000 * 60 * 60 * 24);
    } else {
        setTimeout(runFullScan, 1000 * 60);
    }
};

// Frequently scan recently ranked maps for changes
// This allows us to reflect unranks/updates quickly
const runRecentScan = async () => {
    if (utils.readMiscData('last_dump_import_time')) {
        const oneWeekAgo = Date.now() - 1000 * 60 * 60 * 24 * 7;
        await ingest.scanForChanges(oneWeekAgo);
    }
    setTimeout(runRecentScan, 1000 * 60 * 15);
};

(async () => {
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

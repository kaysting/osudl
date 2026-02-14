const db = require('#db');
const utils = require('#utils');
const api = require('#api');

// Import maps from dump if it's been over a month since the last import
const runImport = async () => {
    const lastImportTime = parseInt(utils.readMiscData('last_dump_import_time') || '0');
    const oneMonth = 1000 * 60 * 60 * 24 * 30;
    if (Date.now() - lastImportTime > oneMonth) {
        await api.importFromDump();
    }
    setTimeout(runImport, 1000 * 60 * 60 * 24);
};

const runRecents = async () => {
    if (utils.readMiscData('last_dump_import_time')) {
        await api.importFromRecents();
    }
    setTimeout(runRecents, 1000 * 60);
};

// Check all saved maps against the osu API for changes
const runFullScan = async () => {
    if (utils.readMiscData('last_dump_import_time')) {
        await api.scanForChanges();
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
        await api.scanForChanges(oneWeekAgo);
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

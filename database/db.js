const fs = require('fs');
const env = require('#env');
const Database = require('better-sqlite3');
const utils = require('#utils');
const path = require('path');

// Open database
utils.log(`Using database ${env.DB_PATH}`);
const db = new Database(env.DB_PATH);

// Set pragmas
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 15000');
db.pragma('synchronous = NORMAL');

// Function to apply migrations
const applyMigrations = () => {
    const migrationsDir = path.join(env.ROOT, 'database/migrations');
    try {
        // Get list of migration files
        const fileNames = fs
            .readdirSync(migrationsDir)
            .filter(f => f.endsWith('.sql'))
            .sort();

        // Get the last applied migration
        // readMiscData will return null on error or nonexistence, in which case
        // we can assume all migrations need to be applied
        const latestAppliedMigration = utils.readMiscData('latest_applied_migration');

        // Get pending migration files
        const pendingMigrations = fileNames.filter(f => f > latestAppliedMigration);
        if (pendingMigrations.length == 0) {
            utils.log(`No new database migrations found`);
            return;
        }
        utils.log(`Applying ${pendingMigrations.length} pending database migrations from ${migrationsDir}...`);

        // Process pending migrations inside transaction
        db.transaction(() => {
            for (const fileName of pendingMigrations) {
                // Read and apply migration SQL
                utils.log(`Applying database migration ${fileName}...`);
                const sql = fs.readFileSync(path.join(migrationsDir, fileName), 'utf8');
                db.exec(sql);

                // Update latest applied migration immediately to prevent reapplication on failure after this
                utils.writeMiscData('latest_applied_migration', fileName);
            }
        })();
    } catch (error) {
        utils.logError(`Failed to apply database migrations:`, error);
        process.exit(1);
    }
};

// Apply migrations
applyMigrations();

module.exports = db;

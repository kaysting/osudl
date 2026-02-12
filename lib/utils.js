const dayjs = require('dayjs');
const stream = require('stream/promises');
const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');
const os = require('os');

const isWin = os.platform() === 'win32';

const utils = {
    /**
     * Use system utilities to zip a directory.
     * @param {string} srcDir The source directory whose files to zip
     * @param {string} destFile The resulting zip file path
     */
    zipDir: (srcDir, destFile) => {
        try {
            if (isWin) {
                // FIX: Use '.' instead of '*' to avoid hitting CMD character limits on large maps
                execSync(`tar --format=zip -cf "${destFile}" .`, { cwd: srcDir, stdio: 'pipe' });
            } else {
                // Linux/Mac standard zip
                execSync(`zip -r -q "${destFile}" .`, { cwd: srcDir, stdio: 'pipe' });
            }
        } catch (err) {
            // Capture the actual output (stderr/stdout) from the command
            const stderr = err.stderr ? err.stderr.toString() : '';
            const stdout = err.stdout ? err.stdout.toString() : '';
            const output = stderr || stdout || 'No output captured';

            // Throw a new error that includes the command output
            // This way, your main loop can log the specific CRC error details
            throw new Error(`Zip failed: ${output.trim()}`);
        }
    },

    /**
     * Use system utilities to extract a zip file.
     * @param {string} src The zip file
     * @param {string} dest A directory to unzip to
     */
    unzip: (src, dest) => {
        try {
            if (isWin) {
                // Windows tar
                execSync(`tar -xf "${src}" -C "${dest}"`, { stdio: 'pipe' });
            } else {
                // Linux unzip
                execSync(`unzip -o -q "${src}" -d "${dest}"`, { stdio: 'pipe' });
            }
        } catch (err) {
            // Capture the actual output (stderr/stdout) from the command
            const stderr = err.stderr ? err.stderr.toString() : '';
            const stdout = err.stdout ? err.stdout.toString() : '';
            const output = stderr || stdout || 'No output captured';

            // Throw a new error that includes the command output
            // This way, your main loop can log the specific CRC error details
            throw new Error(`Unzip failed: ${output.trim()}`);
        }
    },

    /**
     * Log to the console with a timestamp.
     * @param  {...any} args Arguments to pass to `console.log`
     */
    log: (...args) => {
        console.log(`[${dayjs().format('YYYY-MM-DD HH:mm:ss')}]`, ...args);
    },

    /**
     * Log an error to the console with a timestamp.
     * @param  {...any} args Arguments to pass to `console.error`
     */
    logErr: (...args) => {
        console.error(`[${dayjs().format('YYYY-MM-DD HH:mm:ss')}]`, ...args);
    },

    /**
     * Read a value from the `misc` database table.
     * @param {string} key The key to read
     * @returns The value (as a string)
     */
    readMiscData: key => {
        try {
            return require('#db').prepare(`SELECT value FROM misc WHERE key = ?`).get(key)?.value;
        } catch (error) {
            return null;
        }
    },

    /**
     * Write to the `misc` database table.
     * @param {string} key The key to write to
     * @param {*} value The value to write (will be converted to a string)
     */
    writeMiscData: (key, value) => {
        require('#db').prepare(`INSERT OR REPLACE INTO misc (key, value) VALUES (?, ?)`).run(key, value);
    },

    /**
     * Register exit, signal, and error handlers on the process and run a cleanup function.
     * @param {Function} cleanup A function to run before exiting, useful for running cleanup logic
     */
    initGracefulShutdown: (cleanup = () => {}) => {
        let hasCleanupRun = false;
        const cleanupOnce = () => {
            if (hasCleanupRun) return;
            cleanup();
            hasCleanupRun = true;
        };

        process.on('exit', () => {
            cleanupOnce();
        });

        process.on('SIGINT', () => {
            utils.log(`Received SIGINT`);
            cleanupOnce();
            process.exit(0);
        });

        process.on('SIGTERM', () => {
            utils.log(`Received SIGTERM`);
            cleanupOnce();
            process.exit(0);
        });

        process.on('uncaughtException', err => {
            utils.logErr(`Uncaught error:`, err);
            cleanupOnce();
            process.exit(1);
        });

        process.on('unhandledRejection', reason => {
            utils.logErr(`Unhandled rejection:`, reason);
            cleanupOnce();
            process.exit(1);
        });
    },

    /**
     * Convert an osu mode string into an integer.
     * @param {string|number} mode The mode to convert
     * @returns An integer 0-3, where 0 = osu, 1 = taiko, 2 = catch, and 3 = mania
     */
    osuModeToInt: mode => {
        switch (mode) {
            case 'osu':
            case 0:
                return 0;
            case 'taiko':
            case 1:
                return 1;
            case 'fruits':
            case 'catch':
            case 2:
                return 2;
            case 'mania':
            case 3:
                return 3;
        }
    },

    /**
     * Converts an osu map status to an integer value.
     * @param {string|number} status The original status
     * @returns An integer
     */
    osuStatusToInt: status => {
        switch (status) {
            case 'graveyard':
            case -2:
                return -2;
            case 'wip':
            case -1:
                return -1;
            case 'pending':
            case 0:
                return 0;
            case 'ranked':
            case 1:
                return 1;
            case 'approved':
            case 2:
                return 2;
            case 'qualified':
            case 3:
                return 3;
            case 'loved':
            case 4:
                return 4;
        }
    },

    /**
     * Calculate the sha256 hash of a file by streaming to save memory.
     * @param {string} filePath A path to the file to hash
     * @returns The hash
     */
    sha256file: async filePath => {
        const input = fs.createReadStream(filePath);
        const hash = crypto.createHash('sha256');

        // Pipe the file stream to the hash object and wait for completion
        await stream.pipeline(input, hash);

        // Get the final digest in hexadecimal format
        return hash.digest('hex');
    },

    sleep: ms => new Promise(resolve => setTimeout(resolve, ms))
};

module.exports = utils;

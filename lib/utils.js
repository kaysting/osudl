const dayjs = require('dayjs');
const stream = require('stream/promises');
const fs = require('fs');
const crypto = require('crypto');

const utils = {
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
        process.on('exit', () => {
            cleanup();
            process.exit(0);
        });

        process.on('SIGINT', () => {
            utils.log(`Received SIGINT`);
            cleanup();
            process.exit(0);
        });

        process.on('SIGTERM', () => {
            utils.log(`Received SIGTERM`);
            cleanup();
            process.exit(0);
        });

        process.on('uncaughtException', err => {
            utils.logErr(`Uncaught error:`, err);
            cleanup();
            process.exit(1);
        });

        process.on('unhandledRejection', reason => {
            utils.logErr(`Unhandled rejection:`, reason);
            cleanup();
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

const dayjs = require('dayjs');

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
        return require('#db').prepare(`SELECT value FROM misc WHERE key = ?`).get(key)?.value;
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
    }
};

module.exports = utils;

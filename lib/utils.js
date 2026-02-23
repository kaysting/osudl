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
            try {
                cleanup();
            } catch (error) {
                utils.logErr(`Error during cleanup:`, error);
            }
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
        mode = typeof mode === 'string' ? mode.toLowerCase() : mode;
        switch (mode) {
            case 'o':
            case 'osu':
            case 'std':
            case 0:
                return 0;
            case 't':
            case 'taiko':
            case 'drums':
            case 1:
                return 1;
            case 'fruits':
            case 'catch':
            case 'c':
            case 'ctb':
            case 2:
                return 2;
            case 'mania':
            case 'keys':
            case 'm':
            case 3:
                return 3;
        }
        // Fallback to standard
        return 0;
    },

    /**
     * Get the formatted name of an osu mode.
     * @param {string|int} mode Mode identifier
     * @param {boolean} full Whether or not to include the `osu!` prefix and full name of osu standard
     */
    osuModeToName: (mode, full = false) => {
        const int = utils.osuModeToInt(mode);
        switch (int) {
            case 0:
                return full ? `osu!standard` : 'osu';
            case 1:
                return full ? `osu!taiko` : 'taiko';
            case 2:
                return full ? `osu!catch` : 'catch';
            case 3:
                return full ? `osu!mania` : 'mania';
        }
    },

    /**
     * Converts an osu map status to an integer value.
     * @param {string|number} status The original status
     * @returns An integer
     */
    osuStatusToInt: status => {
        status = typeof status === 'string' ? status.toLowerCase() : status;
        switch (status) {
            case 'graveyard':
            case 'g':
            case -2:
                return -2;
            case 'wip':
            case 'w':
            case -1:
                return -1;
            case 'pending':
            case 'p':
            case 0:
                return 0;
            case 'ranked':
            case 'r':
            case 1:
                return 1;
            case 'approved':
            case 'a':
            case 2:
                return 2;
            case 'qualified':
            case 'q':
            case 3:
                return 3;
            case 'loved':
            case 'l':
            case 4:
                return 4;
        }
        return 1;
    },

    /**
     * Converts an osu status integer to its respective name.
     * @param {string|number} status The status
     * @returns A status name
     */
    osuStatusToName: status => {
        status = typeof status === 'string' ? status.toLowerCase() : status;
        switch (status) {
            case -2:
                return 'graveyard';
            case -1:
                return 'wip';
            case 0:
                return 'pending';
            case 1:
                return 'ranked';
            case 2:
                return 'approved';
            case 3:
                return 'qualified';
            case 4:
                return 'loved';
            default:
                return status;
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

    /**
     * Get the sha256 hash of data.
     * @param {*} data The data to hash
     */
    sha256: async data => {
        return crypto.createHash('sha256').update(data).digest('hex');
    },

    /**
     * Generate a cryptographically secure random hex string
     * @param {number} length The length of the resulting string
     */
    randomHex: length => {
        return crypto
            .randomBytes(Math.ceil(length / 2))
            .toString('hex')
            .slice(0, length);
    },

    /**
     * Wait the specified amount of time and then resolve.
     * @param {number} ms Milliseconds
     * @returns A promise
     */
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),

    /**
     * Get the start and end points of a date range
     * @param {string} str A date string in the format `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`
     * @returns Start and end ms timestamps
     */
    parseDateRange: str => {
        const parts = str.split('-').map(p => parseInt(p));
        if (parts.some(isNaN)) return null;

        let start, end;
        if (parts.length === 1) {
            start = new Date(parts[0], 0, 1).getTime();
            end = new Date(parts[0] + 1, 0, 1).getTime();
        } else if (parts.length === 2) {
            start = new Date(parts[0], parts[1] - 1, 1).getTime();
            end = new Date(parts[0], parts[1], 1).getTime(); // Month + 1 handles year rollover automatically
        } else {
            start = new Date(parts[0], parts[1] - 1, parts[2]).getTime();
            end = new Date(parts[0], parts[1] - 1, parts[2] + 1).getTime();
        }
        return { start, end };
    },

    /**
     * Converts an integer or single decimal place float to a start float and end float.
     *
     * For example:
     * - 5 -> { start: 5.0, end: 5.99 }
     * - 5.5 -> { start: 5.50, end: 5.59 }
     * @param {number} num Input number
     */
    numberToFloatRange: num => {
        if (isNaN(parseFloat(num))) return null;
        const str = num.toString();
        const decimalIndex = str.indexOf('.');

        if (decimalIndex === -1) {
            // Integer case: 5 -> { start: 5.0, end: 5.99 }
            return { start: parseFloat(num).toFixed(2), end: (parseFloat(num) + 0.99).toFixed(2) };
        } else {
            // Single decimal case: 5.5 -> { start: 5.50, end: 5.59 }
            const decimalPlaces = str.length - decimalIndex - 1;
            if (decimalPlaces >= 2) {
                // 2 or more decimals: leave unchanged
                return { start: num, end: num };
            }
            const start = parseFloat(num.toFixed(2));
            const end = parseFloat((num + 0.09).toFixed(2));
            return { start, end };
        }
    },

    /**
     * Clamp a number between a min and max.
     * @param {number} value Input value
     * @param {number} min Minimum output value
     * @param {number} max Maximum output value
     * @returns The clamped output
     */
    clamp: (value, min, max) => {
        return Math.max(min, Math.min(max, value));
    },

    /**
     * Sanitize a file name so it's safe for filesystems.
     * @param {string} fileName The input file name
     * @returns The sanitized file name
     */
    sanitizeFileName: fileName => {
        return fileName.replace(/[^a-zA-Z0-9-_\.\(\)\[\] ]/gi, '_');
    },

    /**
     * Convert RGB to hex.
     * @param {number} r Red
     * @param {number} g Green
     * @param {number} b Blue
     * @returns A CSS-valid hex color code
     */
    rgbToHex: (r, g, b) => {
        return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
    },

    /**
     * Convert HSL to hex.
     * @param {number} h Hue
     * @param {number} s Saturation
     * @param {number} l Lightness
     * @returns A CSS-valid hex color code
     */
    hslToHex: (h, s, l) => {
        l /= 100;
        const a = (s * Math.min(l, 1 - l)) / 100;

        const f = n => {
            const k = (n + h / 30) % 12;
            const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
            return Math.round(255 * color)
                .toString(16)
                .padStart(2, '0');
        };

        return `#${f(0)}${f(8)}${f(4)}`;
    },

    /**
     * Get the difficulty colors for an osu map's star rating. Returns `bg` for the background and `fg` for the text, assuming the star rating badge is being rendered.
     *
     * Colors are in CSS-valid hex format.
     *
     * These colors are up to date as of the high SR gradient addition.
     * @param {number} stars The star rating
     * @returns An object with `bg` and `fg` properties
     */
    starsToColor: stars => {
        const bgPoints = [
            { stars: 0, color: [128, 128, 128] },
            { stars: 0.09, color: [128, 128, 128] },
            { stars: 0.1, color: [64, 146, 250] },
            { stars: 2, color: [78, 255, 214] },
            { stars: 2.5, color: [121, 255, 88] },
            { stars: 3.3, color: [245, 240, 92] },
            { stars: 4, color: [250, 156, 104] },
            { stars: 5, color: [246, 79, 120] },
            { stars: 6, color: [179, 76, 193] },
            { stars: 6.7, color: [99, 98, 220] },
            { stars: 8, color: [0, 0, 0] }
        ];

        const fgPoints = [
            { stars: 0, color: [0, 0, 0] },
            { stars: 6.49, color: [0, 0, 0] },
            { stars: 6.5, color: [255, 217, 102] },
            { stars: 8.99, color: [255, 217, 102] },
            { stars: 9, color: [246, 246, 85] },
            { stars: 10, color: [255, 127, 102] },
            { stars: 11, color: [235, 71, 153] },
            { stars: 12.5, color: [108, 108, 224] }
        ];

        // Helper to find color based on points range
        const interpolate = (points, val) => {
            // Handle "stars outside of range" by returning min or max color
            if (val <= points[0].stars) return points[0].color;
            if (val >= points[points.length - 1].stars) return points[points.length - 1].color;

            for (let i = 0; i < points.length - 1; i++) {
                const pointA = points[i];
                const pointB = points[i + 1];

                if (val >= pointA.stars && val <= pointB.stars) {
                    const ratio = (val - pointA.stars) / (pointB.stars - pointA.stars);
                    const r = Math.round(pointA.color[0] + ratio * (pointB.color[0] - pointA.color[0]));
                    const g = Math.round(pointA.color[1] + ratio * (pointB.color[1] - pointA.color[1]));
                    const b = Math.round(pointA.color[2] + ratio * (pointB.color[2] - pointA.color[2]));
                    return [r, g, b];
                }
            }
            return points[0].color; // Fallback
        };

        return {
            bg: utils.rgbToHex(...interpolate(bgPoints, stars)),
            fg: utils.rgbToHex(...interpolate(fgPoints, stars))
        };
    },

    /**
     * Format a number using `toLocaleString` and the `en-US` locale.
     * @param {number} number Input number
     * @param {number|'auto'} [decimals='auto'] The number of decimal places to format to. Set to `auto` to allow anywhere from 0 to 2.
     * @returns The formatted number
     */
    formatNumber: (number, decimals = 'auto') => {
        return Number(number).toLocaleString('en-US', {
            maximumFractionDigits: parseInt(decimals) || 0,
            minimumFractionDigits: decimals === 'auto' ? 0 : parseInt(decimals) || 0
        });
    },

    /**
     * Format a number of bytes to a human-readable size, where 1024 B = 1 KB.
     * @param {number} bytes Number of bytes
     * @returns Formatted size
     */
    formatSize: bytes => {
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let unitIndex = 0;
        while (bytes >= 1024 && unitIndex < units.length) {
            bytes /= 1024;
            unitIndex++;
        }
        let decimals = 0;
        if (bytes < 10) decimals = 2;
        else if (bytes < 100) decimals = 1;
        return `${utils.formatNumber(bytes, decimals)} ${units[unitIndex]}`;
    }
};

module.exports = utils;

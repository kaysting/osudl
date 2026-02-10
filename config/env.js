require('dotenv').config({ quiet: true });
const path = require('path');

const env = {};

/** An absolute path to the root of the project. */
env.ROOT = path.resolve(__dirname, '..');

/** An absolute path to the SQLite database file. */
env.DB_PATH = process.env.DB_PATH || path.join(env.ROOT, 'database/osudl.db');

/** osu! API client ID. */
env.OSU_CLIENT_ID = process.env.OSU_CLIENT_ID;
/** osu! API client secret. */
env.OSU_CLIENT_SECRET = process.env.OSU_CLIENT_SECRET;
/**
 * osu! user session cookie.
 *
 * Find this in your browser's devtools.
 *
 * **IMPORTANT:** In your user settings, set "default beatmap download type" to "with video if available"
 */
env.OSU_SESSION_COOKIE = process.env.OSU_SESSION_COOKIE;

/** The S3 endpoint URL, including the bucket name. */
env.S3_ENDPOINT = process.env.S3_ENDPOINT;
/** S3 access key. */
env.S3_ACCESS_KEY = process.env.S3_ACCESS_KEY;
/** S3 secret key. */
env.S3_SECRET_KEY = process.env.S3_SECRET_KEY;
/**
 * S3 region.
 *
 * Required for Amazon S3 but the default 'auto' should be fine everywhere else.
 */
env.S3_REGION = process.env.S3_REGION || 'auto';
/**
 * Force path style for S3.
 *
 * Needs to be true for some S3 servers.
 */
env.S3_FORCE_PATH_STYLE = process.env.S3_FORCE_PATH_STYLE === 'true';

env.PORT = process.env.PORT || 8080;

let isMissingRequired = false;
for (const [key, value] of Object.entries(env)) {
    if (value === '' || value === null || value === undefined) {
        console.error(`Environment variable ${key} is required`);
        isMissingRequired = true;
    }
}
if (isMissingRequired) process.exit();

module.exports = env;

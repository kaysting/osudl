const express = require('express');
const archiver = require('archiver');
const axios = require('axios');
const downloadsApi = require('#api/downloads.js');
const packsApi = require('#api/packs.js');
const mapsApi = require('#api/beatmaps.js');
const utils = require('#utils');

const router = express.Router();

// Middleware to make sure the requested pack exists
const ensurePackExists = (req, res, next) => {
    const packId = req.params.packId;
    req.pack = packsApi.getPack(packId);
    if (!req.pack) {
        return res.status(404).end(`Pack ${packId} doesn't exist :(`);
    }
    next();
};

// Middleware to make sure the requested download entry exists
const ensureDownloadExists = (req, res, next) => {
    const downloadId = req.params.downloadId;
    req.downloadInstance = packsApi.getPackDownloadInstance(downloadId);
    if (!req.downloadInstance) {
        return res.status(404).end(`Pack download instance ${downloadId} is invalid :(`);
    }
    next();
};

// Pack list
router.get('/', async (req, res) => {});

// Pack info page
router.get('/:packId', ensurePackExists, async (req, res) => {});

// Paginated JSON map data list
// Used on the download page to show progress for each map
router.get('/:packId/beatmapsets', ensurePackExists, async (req, res) => {
    const limit = utils.clamp(parseInt(req.query.limit) || 100, 1, 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const beatmapsets = packsApi.getPackContents(req.pack.id, limit, offset);
    res.json({
        beatmapsets
    });
});

// Initialize a pack download
// Creates a download entry and redirects to the download page for it
// This is how we can show progress specific to a single download instance
router.get('/:packId/download', ensurePackExists, async (req, res) => {
    const downloadId = packsApi.initPackDownload(req.pack.id, req.user?.id);
    res.redirect(`/packs/${req.pack.id}/download/${downloadId}`);
});

// Pack download page
router.get('/:packId/download/:downloadId', ensurePackExists, ensureDownloadExists, async (req, res) => {
    res.json({ downloadInstance: req.downloadInstance });
});

// Pack download as streamed zip
router.get('/:packId/download/:downloadId/zip', ensurePackExists, ensureDownloadExists, async (req, res) => {
    // Get video setting
    const includeVideo = req.query.video === 'false' ? false : true;

    // Set attachment headers
    const filename = utils.sanitizeFileName(`${req.pack.name}${!includeVideo ? ' (no videos)' : ''}.zip`);
    res.attachment(filename);

    // Initialize archive
    const archive = archiver('zip', {
        zlib: { level: 0 }
    });

    // Handle archiver errors
    archive.on('error', err => {
        utils.logErr('Zip stream error:', err);
        if (!res.headersSent) res.status(500).send({ error: err.message });
        else res.end();
    });

    // Pipe archive to response
    archive.pipe(res);

    // Log progress
    let i = 0;
    let lastLogTime = 0;
    const logProgress = () => {
        if (Date.now() - lastLogTime < 2000) return;
        const percentComplete = (i / req.pack.map_count) * 100;
        req.log(`Streaming zip: ${percentComplete.toFixed(2)}% complete`);
        lastLogTime = Date.now();
    };

    // Loop through pack maps
    const mapsetIds = packsApi.getPackContentsRaw(req.pack.id);
    for (const mapsetId of mapsetIds) {
        try {
            // Get map download URL from S3
            const url = await downloadsApi.getBeatmapsetDownloadUrl(mapsetId, includeVideo);

            // Get map download stream
            const response = await axios({
                method: 'get',
                url: url,
                responseType: 'stream'
            });

            // Append file to archive stream and wait for it to finish before continuing
            await new Promise((resolve, reject) => {
                // Get mapset data and build file name
                const mapset = mapsApi.getBeatmapset(mapsetId, false);
                if (!mapset) return reject(`Mapset doesn't exist in the database`);
                const fileName = utils.sanitizeFileName(`${mapsetId} ${mapset.artist} - ${mapset.title}.osz`);

                archive.append(response.data, { name: fileName });

                response.data.on('end', resolve);
                response.data.on('error', reject);
            });

            // Update download instance and pack entries
            packsApi.incrementPackDownloadInstanceMapCount(req.downloadInstance.id);
            packsApi.incrementPackDownloadCountWithInstance(req.downloadInstance.id);

            i++;
            logProgress();
        } catch (error) {
            utils.logErr(`Failed to add ${mapsetId} to zip:`, error);
        }
    }

    // Finalize archive
    archive.finalize();
});

// Redirect to the download for a specific map
// We use this endpoint to attribute the map download to the pack
// This lets us track download progress even with fully client-side downloads
router.get(
    '/:packId/download/:downloadId/beatmapset/:mapsetId',
    ensurePackExists,
    ensureDownloadExists,
    async (req, res) => {}
);

module.exports = router;

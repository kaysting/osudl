const express = require('express');
const mapsApi = require('#api/beatmaps.js');

const router = express.Router();

// Beatmap search
router.get('/', async (req, res) => {
    const query = req.query.q;
    const sort = req.query.s || 'auto';
    const page = Math.max(0, parseInt(req.query.p) || 1);
    const limit = 120;
    const offset = (page - 1) * limit;
    const results = mapsApi.searchBeatmaps(query, sort, limit, offset);
    res.renderPage('mapSearch', {
        topbar: {
            icon: 'search',
            title: 'Search and filter maps'
        },
        search: {
            query,
            sort,
            page
        },
        results: results.beatmapsets
    });
});

// Beatmap info page
router.get('/:id', async (req, res) => {
    res.end(`Not implemented, check back later`);
});

module.exports = router;

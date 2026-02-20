const express = require('express');
const mapsApi = require('#api/beatmaps.js');

const router = express.Router();

// Beatmap search
router.get('/', async (req, res) => {
    const query = req.query.q;
    const sort = (req.query.s || 'auto').substring(0, 200);
    const page = Math.max(1, parseInt(req.query.p) || 1);
    const limit = 120;
    const offset = (page - 1) * limit;
    const results = mapsApi.searchBeatmaps(query, sort, limit, offset);
    res.renderPage('mapSearch', {
        title: query ? `Maps matching ${query}` : 'Search and filter maps',
        topbar: {
            icon: 'search',
            title: 'Search and filter maps'
        },
        meta: {
            title: query ? `${results.count.total_beatmapsets.toLocaleString()} beatmapsets matching "${query}"` : null
        },
        search: {
            query,
            sort,
            page,
            limit,
            offset
        },
        results
    });
});

// Beatmap info page
router.get('/:id', async (req, res) => {
    res.end(`Not implemented, check back later`);
});

module.exports = router;

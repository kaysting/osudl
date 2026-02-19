const express = require('express');
const mapsApi = require('#api/beatmaps.js');

const router = express.Router();

// Beatmap search
router.get('/', async (req, res) => {
    res.end(`Not implemented, check back later`);
});

// Beatmap info page
router.get('/:id', async (req, res) => {
    res.end(`Not implemented, check back later`);
});

module.exports = router;

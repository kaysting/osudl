const express = require('express');
const mapsApi = require('#api/beatmaps.js');

const router = express.Router();

// Beatmap search
router.get('/', async (req, res) => {});

// Beatmap info page
router.get('/:id', async (req, res) => {});

module.exports = router;

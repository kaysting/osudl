const express = require('express');
const utils = require('#utils');
const api = require('#api');

const router = express.Router();

router.post('/packs/create', async (req, res) => {
    let { name, query } = req.query;

    // Trim name and query
    name = name?.trim();
    query = query?.trim();

    // If no name is provided but a query is, create a name based on query
    query = typeof query === 'string' ? query : undefined;
    if (!name && query !== undefined) {
        name = query ? `Maps matching ${query}` : `All maps`;
    }

    // Ensure name is set
    if (!name) return res.status(400).json({ success: false, error: 'Missing name' });

    // We're hardcoding creator to null and visibility to false here for now
    // but these should become dynamic once users can create packs
    const is_visible = false;
    const creator_id = null;
    let pack = await api.createPack(name, creator_id, is_visible, query);

    // Send resulting pack
    res.json({
        success: true,
        pack
    });
});

router.use((err, req, res, next) => {
    utils.logErr(err);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

module.exports = router;

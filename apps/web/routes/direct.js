const express = require('express');
const api = require('#api');

const router = express.Router();

const unsavedText = `- If the map is newly ranked, we probably just haven't stored it yet, so check back in a few minutes.\n- If the map is ranked and old, please join the Discord server and let us know so we can add it.\n\nWe only mirror ranked/approved/loved maps.`;

// Accepts map ID and redirects to presigned mapset download
router.get('/b/:id', async (req, res) => {
    const id = req.params.id;
    const withVideo = req.query.video === 'false' ? false : true;
    const url = await api.getBeatmapDownloadUrl(id, withVideo);
    if (!url) {
        return res
            .status(404)
            .end(`Sorry! We don't have a beatmapset containing a beatmap with the ID ${id}.\n\n${unsavedText}`);
    }
    res.redirect(url);
});

// Accepts mapset ID and redirects to presigned mapset download
router.get('/s/:id', async (req, res) => {
    const id = req.params.id;
    const withVideo = req.query.video === 'false' ? false : true;
    const url = await api.getBeatmapsetDownloadUrl(id, withVideo);
    if (!url) {
        return res.status(404).end(`Sorry! We don't have a beatmapset with the ID ${id}.\n\n${unsavedText}`);
    }
    res.redirect(url);
});

module.exports = router;

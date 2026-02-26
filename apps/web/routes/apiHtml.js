const express = require('express');
const utils = require('#utils');
const api = require('#api');

const router = express.Router();

router.get('/markdown/:mdFileName', async (req, res) => {
    res.render('partials/markdown.ejs', { path: `${req.params.mdFileName}.md` });
});

router.get('/beatmapsets/:mapsetId/info', async (req, res) => {});

router.use((req, res, next) => {
    res.status(404).end(`404 Not Found`);
});

router.use((err, req, res, next) => {
    utils.logErr(err);
    res.status(500).end(`500 Internal Server Error`);
});

module.exports = router;

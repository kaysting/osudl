const express = require('express');
const utils = require('#utils');
const marked = require('marked');
const api = require('#api');

const router = express.Router();

router.get('/search-filter-help', async (req, res) => {
    res.render('partials/markdown.ejs', { path: 'filter-help.md' });
});

router.use((req, res, next) => {
    res.status(404).end(`404 Not Found`);
});

router.use((err, req, res, next) => {
    utils.logErr(err);
    res.status(500).end(`500 Internal Server Error`);
});

module.exports = router;

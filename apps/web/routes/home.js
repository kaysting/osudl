const express = require('express');
const api = require('#api');
const utils = require('#utils');

const router = express.Router();

let stats = api.getStats();

setInterval(() => {
    try {
        stats = api.getStats();
    } catch (error) {
        utils.logErr(`Error getting stats for homepage:`, error);
    }
}, 1000 * 60);

router.get('/', async (req, res) => {
    res.renderPage('home', {
        topbar: {
            icon: 'home',
            title: 'osu!dl'
        },
        stats
    });
});

module.exports = router;

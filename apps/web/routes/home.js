const express = require('express');

const router = express.Router();

router.get('/', async (req, res) => {
    res.renderPage('home', {
        topbar: {
            icon: 'home',
            title: 'osu!dl'
        }
    });
});

module.exports = router;

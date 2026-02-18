const express = require('express');

const router = express.Router();

router.get('/', async (req, res) => {
    res.end(`Welcome to osudl`);
});

module.exports = router;

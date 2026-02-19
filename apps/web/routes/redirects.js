const express = require('express');

const router = express.Router();

const redirects = {
    discord: 'https://discord.com/invite/SqHKyH3pFS',
    github: 'https://github.com/kaysting/osudl',
    kofi: 'https://ko-fi.com/kaysting'
};

for (const [slug, target] of Object.entries(redirects)) {
    router.get(`/${slug}`, (req, res) => {
        res.redirect(target);
    });
}

module.exports = router;

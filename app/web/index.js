const express = require('express');
const env = require('#env');
const db = require('#db');
const utils = require('#utils');

const app = express();

app.listen(env.PORT, () => {
    utils.log(`Webserver listening on port ${env.PORT}`);
});

utils.initGracefulShutdown(() => {
    db.close();
});

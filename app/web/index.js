const env = require('#env');
const path = require('path');
const express = require('express');
const db = require('#db');
const utils = require('#utils');

const app = express();

// Register global middleware
app.use((req, res, next) => {
    // Get IP from headers or req.ip
    const ip = req.headers['cf-connecting-ip'] || req.ip;

    // Log request including processing time
    const START_TIME = process.hrtime.bigint();
    const originalEnd = res.end;
    res.end = function (...args) {
        const elapsed = (Number(process.hrtime.bigint() - START_TIME) / 1_000_000).toFixed(2);
        const status = res.statusCode;
        const logParts = [ip, req.method, status, req.originalUrl, `[${elapsed}ms]`];
        utils.log(...logParts);
        return originalEnd.apply(this, args);
    };

    next();
});

// Register other middleware
app.use(express.static(path.join(env.ROOT, 'app/web/public')));
app.use(express.json());

// Register routes
app.use('/', require('./routes/direct'));

// Handle 404s
app.use((req, res) => {
    res.status(404).end(`404 Not Found\nThe resource you requested couldn't be found.`);
});

// Handle errors
app.use((err, req, res, next) => {
    utils.logErr(err);
    res.status(500).end(`500 Internal Server Error\nTry again in a bit.`);
});

app.listen(env.PORT, () => {
    utils.log(`Webserver listening on port ${env.PORT}`);
});

utils.initGracefulShutdown(() => {
    db.close();
});

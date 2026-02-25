const env = require('#env');
const path = require('path');
const fs = require('fs');
const express = require('express');
const ejs = require('ejs');
const db = require('#db');
const utils = require('#utils');

// Start server
const { app, io } = require('./server');
const { marked } = require('marked');

// Handle socket connections
io.on('connection', socket => {
    utils.log(`New socket connection: ${socket.id}`);

    socket.on('disconnect', () => {
        utils.log(`Socket disconnected: ${socket.id}`);
    });

    socket.on('subscribe', room => {
        socket.join(room);
        utils.log(`Socket ${socket.id} subscribed to room: ${room}`);
    });

    socket.on('unsubscribe', room => {
        socket.leave(room);
        utils.log(`Socket ${socket.id} unsubscribed from room: ${room}`);
    });
});

// Register global middleware
app.use((req, res, next) => {
    // Get IP from headers or req.ip
    const ip = req.headers['cf-connecting-ip'] || req.ip;

    // Build logging function
    req.log = (...args) => {
        utils.log(ip, req.method, `${req.originalUrl}:`, ...args);
    };

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

    // Request renderer
    res.renderPage = (page, data) => {
        res.render('layout', {
            page,
            ...data
        });
    };

    next();
});

// Pass stuff into EJS
app.locals.env = env;
app.locals.utils = utils;
app.locals.asset = (pathRel, returnAbsolute = false) => {
    pathRel = pathRel.replace(/^\/+/g, ''); // remove leading slash for append
    const filePath = path.join(__dirname, 'public', pathRel);
    const baseUrl = returnAbsolute ? env.BASE_URL : '';
    try {
        const stats = fs.statSync(filePath);
        const mtime = stats.mtime.getTime();
        return `${baseUrl}/${pathRel}?v=${mtime}`;
    } catch (error) {
        return `${baseUrl}/${pathRel}`;
    }
};
app.locals.includeMarkdown = mdPath => {
    return marked.parse(fs.readFileSync(path.join(env.ROOT, 'apps/web/views/markdown', mdPath), 'utf8'));
};

// Set up rendering
app.set('view engine', 'ejs');
app.set('views', path.join(env.ROOT, 'apps/web/views'));

// Register middleware
app.use(express.static(path.join(env.ROOT, 'apps/web/public')));
app.use(
    express.json({
        verify: (req, res, buf) => {
            req.rawBody = buf; // Store raw bytes for later
        }
    })
);
app.use(express.urlencoded({ extended: true }));

// Register routes
app.use('/api/json', require('./routes/apiJson'));
app.use('/api/partials', require('./routes/apiHtml'));
app.use('/', require('./routes/direct'));
app.use('/', require('./routes/home'));
app.use('/', require('./routes/redirects'));
app.use('/beatmapsets', require('./routes/beatmaps'));
app.use('/packs', require('./routes/packs'));

// Handle 404s
app.use((req, res) => {
    res.status(404).end(`404 Not Found\nThe resource you requested couldn't be found.`);
});

// Handle errors
app.use((err, req, res, next) => {
    utils.logErr(err);
    res.status(500).end(`500 Internal Server Error\nTry again in a bit.`);
});

utils.initGracefulShutdown(() => {
    db.close();
});

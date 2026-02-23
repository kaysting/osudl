const env = require('#env');
const utils = require('#utils');
const http = require('http');
const socketIo = require('socket.io');
const express = require('express');

// Create express app
const app = express();

// Create http server
const server = http.createServer(app);

// Create socket
const io = socketIo(server, {
    cors: {
        origin: '*'
    }
});

// Start HTTP server
server.listen(env.PORT, () => {
    utils.log(`Webserver listening on port ${env.PORT}`);
});

module.exports = {
    server,
    app,
    io
};

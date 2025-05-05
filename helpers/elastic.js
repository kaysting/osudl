const Elastic = require('@elastic/elasticsearch');
const config = require('../config.json');

const client = new Elastic.Client({
    node: 'https://localhost:9200',
    auth: {
        username: config.elastic_user,
        password: config.elastic_password
    },
    tls: {
        rejectUnauthorized: false
    }
});

module.exports = client;
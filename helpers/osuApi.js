const axios = require('axios');
const config = require('../config.json');

let tokenExpire = 0;
let accessToken;
async function getToken() {
    if (Date.now() > (tokenExpire - (1000 * 60 * 60))) {
        const response = await axios.post('https://osu.ppy.sh/oauth/token', {
            client_id: config.osu_client_id,
            client_secret: config.osu_client_secret,
            grant_type: 'client_credentials',
            scope: 'public'
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const data = response.data;
        accessToken = data.access_token;
        tokenExpire = (Date.now() + (data.expires_in * 1000));
    }
    return accessToken;
}

async function request(method, endpoint, body) {
    let opts = {
        headers: {
            Authorization: `Bearer ${await getToken()}`
        },
        method: method.toLowerCase(),
        url: `https://osu.ppy.sh/api/v2/${endpoint}`
    };
    if (method.toLowerCase() === 'post' && body) {
        opts.headers['Content-Type'] = 'application/json';
        opts.data = body;
    }
    const response = await axios(opts);
    return response.data;
}

module.exports = {
    get: async (endpoint) => {
        return await request('GET', endpoint);
    },
    post: async (endpoint, body) => {
        return await request('POST', endpoint, body);
    }
};
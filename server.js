const fs = require('fs');
const path = require('path');
const express = require('express');
const archiver = require('archiver');
const dayjs = require('dayjs');
const utils = require('./helpers/utils.js');
const db = require('./helpers/db.js');
const elastic = require('./helpers/elastic.js');
const config = require('./config.json');

const app = express();
const port = process.argv[2] || process.env.PORT || 8727;

app.use(express.static('web'));
app.use('/.well-known', express.static('web/.well-known'));
app.use(express.json());

app.use(async (req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const ua = req.headers['user-agent'];
    const path = req.path || '';
    const query = req.originalUrl.split('?')[1] || ''; // Use raw query string
    const body = req.body || {};
    req.log = (text) => {
        console.log(`[${dayjs().format('YYYY-MM-DD HH:mm:ss')} INFO]: [${ip}] ${text}`);
    };
    req.logError = (text) => {
        console.log(`[${dayjs().format('YYYY-MM-DD HH:mm:ss')} ERROR]: [${ip}] ${text}`);
    };
    req.log(`Handling request for ${path} ${query ? `with query ${query}` : ''}`);
    next();
    try {
        await db.run(
            `INSERT INTO requests (date, ip, ua, path, query, body) VALUES (?, ?, ?, ?, ?, ?)`,
            [ new Date(), ip, ua, path, query, JSON.stringify(body) ]
        );
    } catch (error) {
        req.logError(`Error logging request to database: ${error.message}`);
    }
});

const parseBeatmapsetQuery = query => {
    const filterRegex = /(cs|ar|od|hp|keys|stars|sr|bpm|length|circles|sliders|spinners|title|artist|mapper|diff|diffname|source|mode|rankdate|submitdate|date|video|nsfw|plays|playcount|pp|pp\.[a-z]{2,6})\s?(<=|>=|=|<|>)\s?(".*?"|\S+)(?=\s|$)/gi;
    const truthy = [ 't', 'true', '1', 'yes', 'on' ];
    const falsy = [ 'f', 'false', '0', 'no', 'off' ];

    const exactFields = {
        cs: 'cs', keys: 'cs', ar: 'ar', od: 'od', hp: 'hp',
        stars: 'stars', sr: 'stars', bpm: 'bpm', length: 'length_secs',
        circles: 'count_circles', sliders: 'count_sliders', spinners: 'count_spinners',
        playcount: 'count_plays', plays: 'count_plays', pp: 'max_pp.nomod'
    };

    for (const mods of config.stored_pp_mods) {
        exactFields[`pp.${mods}`] = `max_pp.${mods}`;
    }

    const fuzzyFieldsMulti = {
        title: ['title', 'title_unicode'], artist: ['artist', 'artist_unicode'],
        mapper: ['mapper'],
        diffname: ['diff_name'], diff: ['diff_name'],
        source: ['source']
    };

    const filters = [];
    for (const match of query.matchAll(filterRegex)) {
        filters.push({
            property: match[1].toLowerCase(),
            operator: match[2],
            value: match[3].trim().replace(/"/g, '')
        });
    }
    const searchStr = query.replace(filterRegex, '').trim();
    let willBeScored = false;

    // This will store filters *by field* for merging ranges, matches, etc
    const fieldGroups = { must: {} };

    const addFilter = ({
        clause = 'must', type, field, value
    }) => {
        if (!fieldGroups[clause][field]) fieldGroups[clause][field] = [];
        fieldGroups[clause][field].push({ type, value });
    };

    // loop through filters
    for (const { property, operator, value } of filters) {
        const valueFloat = parseFloat(value);
        const valueInt = parseInt(value);

        // Numeric/range fields
        if (exactFields[property]) {
            if (isNaN(valueFloat) && isNaN(valueInt)) continue;
            const field = exactFields[property];
            const valueFloatCeil = valueFloat + 0.01;
            const valueFloatFloor = valueFloat - 0.01;
            switch (operator) {
                case '=':
                    addFilter({
                        type: 'range', field,
                        value: { gte: valueFloatFloor, lte: valueFloatCeil }
                    });
                    break;
                case '<':
                    addFilter({ type: 'range', field, value: { lt: valueFloat } }); break;
                case '<=':
                    addFilter({ type: 'range', field, value: { lte: valueFloat } }); break;
                case '>':
                    addFilter({ type: 'range', field, value: { gt: valueFloat } }); break;
                case '>=':
                    addFilter({ type: 'range', field, value: { gte: valueFloat } }); break;
            }
            // Special keys logic to filter only mania maps
            if (property === 'keys') addFilter({ type: 'term', field: 'mode', value: 'mania' });
            continue;
        }

        // Multi-field fuzzy matches
        if (fuzzyFieldsMulti[property]) {
            for (const field of fuzzyFieldsMulti[property]) {
                if (operator === '=') {
                    addFilter({
                        type: 'match', field,
                        value: { query: value, fuzziness: 'AUTO' }
                    });
                    willBeScored = true;
                }
            }
            continue;
        }

        // Mode aliases
        if (property === 'mode') {
            const modeMap = {
                osu: ['s', 'o', 'std', 'osu', 'standard', '0'],
                taiko: ['t', 'drums', 'taiko', '1'],
                mania: ['m', 'keys', 'mania', '2'],
                fruits: ['c', 'catch', 'fruits', '3'],
            };
            for (const [mode, aliases] of Object.entries(modeMap)) {
                if (aliases.includes(value.toLowerCase())) {
                    addFilter({ type: 'term', field: 'mode', value: mode });
                }
            }
            continue;
        }

        // Video/nsfw
        if (property === 'video' || property === 'nsfw') {
            const field = property === 'video' ? 'has_video' : 'is_nsfw';
            if (truthy.includes(value.toLowerCase()))
                addFilter({ type: 'term', field, value: true });
            else if (falsy.includes(value.toLowerCase()))
                addFilter({ type: 'term', field, value: false });
            continue;
        }

        // Date logic
        if ([ 'rankdate', 'submitdate', 'date' ].includes(property)) {
            const split = value.split('-').filter(Boolean).map(Number);
            let field = (property === 'submitdate') ? 'date_submitted' : 'date_ranked';

            let start, end;
            if (split.length === 3) {
                // Full date: yyyy-mm-dd
                start = new Date(split[0], split[1] - 1, split[2]);
                end = new Date(split[0], split[1] - 1, split[2] + 1);
            } else if (split.length === 2) {
                // Year and month: yyyy-mm
                start = new Date(split[0], split[1] - 1, 1);
                end = new Date(split[0], split[1], 1);
            } else if (split.length === 1) {
                // Only year: yyyy
                start = new Date(split[0], 0, 1);
                end = new Date(split[0] + 1, 0, 1);
            }

            if (operator === '=') {
                addFilter({
                    type: 'range',
                    field,
                    value: {
                        gte: start.toISOString(),
                        lt: end.toISOString()
                    }
                });
            } else {
                // For <, <=, >, >=, take the provided precision only
                const isoStart = start.toISOString();
                const isoEnd = end.toISOString();
                switch (operator) {
                    case '<': addFilter({ type: 'range', field, value: { lt: isoStart } }); break;
                    case '<=': addFilter({ type: 'range', field, value: { lte: isoStart } }); break;
                    case '>': addFilter({ type: 'range', field, value: { gt: isoEnd } }); break;
                    case '>=': addFilter({ type: 'range', field, value: { gte: isoEnd } }); break;
                }
            }
            continue;
        }
    }

    // Build Elastic query
    // Dynamically arrange filters into sub-and/or clauses
    const queryElastic = { bool: { must: [], should: [] } };
    for (const [field, arr] of Object.entries(fieldGroups.must)) {
        if (arr.length === 1) {
            // If the filter is only used once, add it directly
            const item = arr[0];
            queryElastic.bool.must.push({ [item.type]: { [field]: item.value } });
        } else if (arr.length > 1) {
            // If the filter is used multiple times, add inequalities directly
            // and group the equalities into a sub-OR clause
            const orItems = [];
            for (const item of arr) {
                const rangeDiff = item.type === 'range' ? item.value.gte - item.value.lte : 0;
                if (item.type === 'term' || item.type === 'match' || rangeDiff <= 0.02) {
                    orItems.push(item);
                } else {
                    queryElastic.bool.must.push({ [item.type]: { [field]: item.value } });
                }
            }
            queryElastic.bool.must.push({
                bool: {
                    should: orItems.map(item => ({ [item.type]: { [field]: item.value } }))
                }
            });
        }
    }

    // Special: add search string logic
    if (searchStr) {
        const valueInt = parseInt(searchStr);
        if (!isNaN(valueInt)) queryElastic.bool.should.push(
            { term: { mapset_id: valueInt } }, { term: { map_id: valueInt } }
        );
        queryElastic.bool.should.push({
            multi_match: {
                query: searchStr,
                fields: [
                    'title^4',
                    'title_unicode^4',
                    'artist^2',
                    'artist_unicode^2',
                    'diff_name'
                ],
                fuzziness: 'AUTO'
            }
        });
        queryElastic.bool.minimum_should_match = 1;
        willBeScored = true;
    }

    return { filters, searchStr, queryElastic, willBeScored };
};

const maxQueryResults = 200;
const querySorts = {
    title_asc: { 'title.keyword': 'asc' },
    title_desc: { 'title.keyword': 'desc' },
    artist_asc: { 'artist.keyword': 'asc' },
    artist_desc: { 'artist.keyword': 'desc' },
    ranked_asc: { date_ranked: 'asc' },
    ranked_desc: { date_ranked: 'desc' },
    submitted_asc: { date_submitted: 'asc' },
    submitted_desc: { date_submitted: 'desc' },
    difficulty_asc: { stars: 'asc' },
    difficulty_desc: { stars: 'desc' },
    length_asc: { length_secs: 'asc' },
    length_desc: { length_secs: 'desc' },
    bpm_asc: { bpm: 'asc' },
    bpm_desc: { bpm: 'desc' },
    playcount_asc: { count_plays: 'asc' },
    playcount_desc: { count_plays: 'desc' },
    playcount_weekly_asc: { count_plays_past_week: 'asc' },
    playcount_weekly_desc: { count_plays_past_week: 'desc' },
    relevancy_asc: [
        { _score: 'asc' },
        { date_ranked: 'asc' }
    ],
    relevancy_desc: [
        { _score: 'desc' },
        { date_ranked: 'desc' }
    ],
    max_nomod_pp_asc: { 'max_pp.nomod': 'asc' },
    max_nomod_pp_desc: { 'max_pp.nomod': 'desc' },
};

app.get('/api/beatmapsets/query', async (req, res) => {

    let startTime;
    // Get params
    const query = req.query.query || '';
    const limit = Math.min(parseInt(req.query.limit) || maxQueryResults, maxQueryResults) || maxQueryResults;

    // Parse search after if provided
    let searchAfter = undefined;
    try {
        if (req.query.cursor) {
            const json = Buffer.from(req.query.cursor, 'base64').toString('utf-8');
            searchAfter = JSON.parse(json);
        }
    } catch (error) {
        req.logError(`Error parsing cursor string: ${error.message}`);
        return res.status(400).json({ success: false, message: 'Invalid cursor string' });
    }

    // Parse query into Elasticsearch format
    const parsed = parseBeatmapsetQuery(query);

    // Get sort and order
    let sortString = Object.keys(querySorts).includes((req.query.sort || '').toLowerCase()) ? req.query.sort : 'ranked_desc';
    const forceCustomSort = req.query.sort_force || false;
    if (parsed.willBeScored && !forceCustomSort) {
        sortString = 'relevancy_desc';
    } else if (!parsed.willBeScored && sortString.startsWith('relevancy')) {
        sortString = 'ranked_desc';
    }
    const sort = [
        ...(querySorts[sortString].length ? querySorts[sortString] : [querySorts[sortString]]),
        { mapset_id: 'desc' }
    ];

    // Query Elasticsearch for mapset IDs until limit is met
    startTime = Date.now();
    const mapsetIds = [];
    const hits = [];
    while (true) {

        // Query results
        const esResSearch = await elastic.search({
            index: 'beatmaps',
            query: parsed.queryElastic,
            sort,
            size: 100,
            search_after: searchAfter,
            _source: [ 'mapset_id' ]
        });

        // Break if no more results
        if (esResSearch.hits.hits.length === 0) break;

        // Loop through hits and add to unique mapset IDs
        let isLimitMet = false;
        for (const hit of esResSearch.hits.hits) {
            const mapsetId = hit._source.mapset_id;
            // Save hit
            hits.push(hit);
            // If the mapset ID is already in the list, skip it
            if (mapsetIds.includes(mapsetId)) continue;
            // Break if limit is met
            if (mapsetIds.length >= limit) {
                isLimitMet = true;
                hits.pop();
                break;
            }
            // Save hit and unique mapset ID
            mapsetIds.push(mapsetId);
        }

        // Break if limit is met
        if (isLimitMet) break;

        // Save the last hit's sort value for search_after
        const lastHit = esResSearch.hits.hits[esResSearch.hits.hits.length - 1];
        searchAfter = lastHit.sort;

    }

    // Get the last hit's sort value for the cursor
    let cursor = null;
    const lastHit = hits.pop();
    if (lastHit) {
        cursor = Buffer.from(JSON.stringify(lastHit.sort)).toString('base64');
    }

    // Fetch stats for total count and file sizes
    const esResStats = await elastic.search({
        index: 'beatmaps',
        query: parsed.queryElastic,
        aggs: {
            unique_mapsets: {
                terms: {
                    field: 'mapset_id',
                    size: 1000000
                },
                aggs: {
                    total_file_size_novideo: {
                        max: { field: 'file_size_novideo' }
                    },
                    total_file_size_video: {
                        max: { field: 'file_size_video' }
                    }
                }
            }
        }
    });
    const uniqueMapsets = esResStats.aggregations.unique_mapsets.buckets;
    const totalFileSizeNoVideo = uniqueMapsets.reduce((sum, bucket) => sum + (bucket.total_file_size_novideo.value || 0), 0);
    const totalFileSizeVideo = uniqueMapsets.reduce((sum, bucket) => sum + (bucket.total_file_size_video.value || 0), 0);
    const stats = {
        total_count: uniqueMapsets.length,
        total_file_size_novideo: totalFileSizeNoVideo,
        total_file_size_video: totalFileSizeVideo
    };
    const msQuery = Date.now() - startTime;

    // Get full beatmapset objects for each entry
    const results = [];
    startTime = Date.now();
    for (const id of mapsetIds) {
        const result = await utils.getBeatmapsetById(id);
        results.push(result);
    }
    const msFetch = Date.now() - startTime;

    // Finish up and respond
    stats.process_time = msQuery + msFetch;
    req.log(`Retrieved ${results.length} (of ${stats.total_count}) mapsets matching query "${query}" in ${msQuery}ms query + ${msFetch}ms fetch = ${stats.process_time}ms`);
    const data = {
        success: true,
        query: {
            source: query,
            filters: parsed.filters,
            search_str: parsed.searchStr,
            sort: sortString
        },
        cursor,
        stats,
        beatmapsets: results
    };
    res.json(data);

});

app.get('/api/beatmapsets/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
        return res.status(400).json({ success: false, message: 'Invalid mapset ID' });
    }
    try {
        const mapset = await utils.getBeatmapsetById(id);
        if (!mapset) {
            return res.status(404).json({ success: false, message: 'Mapset not found' });
        }
        res.json({ success: true, mapset });
    } catch (error) {
        req.logError(`Error fetching mapset with ID ${id}:`, error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

app.get('/files/beatmapsets/zip/query', async (req, res) => {
    // Get params
    const includeVideo = req.query.video || false;
    const query = req.query.query || '';
    const token = req.query.token || '';
    // Check token
    if (!token) {
        return res.status(400).end(`No verification token provided`);
    }
    const isVerified = await utils.verifyTurnstileToken(token);
    if (!isVerified) {
        return res.status(400).end(`Invalid verification token provided`);
    }
    // Communicate to the client
    const zipFileName = 'maps.zip';
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);
    // Create uncompressed archive and pipe to response
    const archive = archiver('zip', {
        zlib: { level: 0 }
    });
    let i = 0;
    let totalFiles = 0;
    archive.on('entry', entry => {
        req.log(`[${i}/${totalFiles}] Added file to zip: ${entry.name}`);
        i++;
    });
    archive.on('error', (err) => {
        req.logError(`Error during zip download: ${err.message}`);
        res.status(500).send(err.message);
    });
    archive.on('close', () => {
        req.log(`Finished zip download of ${mapsetIds.length} mapsets`);
    });
    archive.pipe(res);
    // Send info file to zip
    const info = [
        `ZIP download requested at ${new Date().toISOString()}`,
        `Query: ${query}`,
        `\nThanks for using osu!dl :3`
    ].join('\n');
    archive.append(info, { name: 'info.txt' });
    // Parse query and perform initial search
    const parsed = parseBeatmapsetQuery(query);
    let searchRes = await elastic.search({
        index: 'beatmaps',
        scroll: '1m',
        size: 1000,
        query: parsed.queryElastic,
        _source: [ 'mapset_id' ]
    });
    const mapsetIds = [];
    // Perform subsequent searches to get all results
    while (searchRes.hits.hits.length > 0) {
        for (const hit of searchRes.hits.hits) {
            const mapsetId = hit._source.mapset_id;
            if (!mapsetIds.includes(mapsetId)) {
                mapsetIds.push(mapsetId);
            }
        }
        searchRes = await elastic.scroll({
            scroll_id: searchRes._scroll_id,
            scroll: '1m'
        });
    }
    // Clear scroll context
    await elastic.clearScroll({
        scroll_id: searchRes._scroll_id
    });
    req.log(`Selected ${mapsetIds.length} mapsets matching query "${req.query.query}" for zip download`);
    // Add files to zip
    totalFiles = mapsetIds.length;
    for (const id of mapsetIds) {
        const paths = await utils.getBeatmapsetFilePaths(id);
        const filePath = includeVideo ? paths.video : paths.noVideo;
        const fileName = path.basename(filePath);
        archive.file(filePath, { name: fileName });
    }
    archive.finalize();
    // Clean up on user disconnect
    req.on('close', () => {
        if (archive.closed) return;
        req.log(`Aborted zip download`);
        archive.abort();
    });
});

app.get('/files/beatmapsets/zip/selection', async (req, res) => {
    const includeVideo = req.query.video || false;
    const mapsetIds = req.body.ids || [];
    const token = req.query.token || '';
    // Check token
    if (!token) {
        return res.status(400).end(`No verification token provided`);
    }
    const isVerified = await utils.verifyTurnstileToken(token);
    if (!isVerified) {
        return res.status(400).end(`Invalid verification token provided`);
    }
    // Communicate to the client
    req.log(`Selected ${mapsetIds.length} mapsets for zip download`);
    const zipFileName = 'maps.zip';
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);
    // Create uncompressed archive and pipe files to response
    const archive = archiver('zip', {
        zlib: { level: 0 }
    });
    archive.on('entry', entry => {
        req.log(`Added mapset to zip: ${entry.name}`);
    });
    archive.on('error', (err) => {
        req.logError(`Error during zip download: ${err.message}`);
        res.status(500).send(err.message);
    });
    archive.on('close', () => {
        req.log(`Finished zip download of ${mapsetIds.length} mapsets`);
    });
    archive.pipe(res);
    for (const id of mapsetIds) {
        const paths = await utils.getBeatmapsetFilePaths(id);
        const filePath = includeVideo ? paths.video : paths.noVideo;
        const fileName = path.basename(filePath);
        archive.file(filePath, { name: fileName });
    }
    archive.finalize();
    // Clean up on user disconnect
    req.on('close', () => {
        if (archive.closed) return;
        req.log(`Aborted zip download`);
        archive.abort();
    });
});

app.get('/files/beatmapsets/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
        return res.status(400).end();
    }
    const paths = await utils.getBeatmapsetFilePaths(id);
    if (!paths.noVideo && !paths.video) {
        return res.status(404).end();
    }
    const video = req.query.video || false;
    const filePath = paths[video ? 'video' : 'noVideo'];
    if (!fs.existsSync(filePath)) {
        return res.status(404).end();
    }
    res.download(filePath);
});

app.use('/files/beatmapsets/backgrounds', express.static(
    path.join(config.backgrounds_dir),
    {
        immutable: true,
        maxAge: 1000 * 60 * 60 * 24 * 30 // 30 days
    }
));

app.use('/files/beatmapsets/previews', express.static(path.join(config.audio_dir)));

app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'web', 'index.html'));
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
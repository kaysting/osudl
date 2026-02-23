const db = require('#db');
const utils = require('#utils');

/**
 * Format a beatmapset entry into a standardized object.
 * @param {object} row A row from the `beatmapsets` table.
 */
const formatBeatmapset = row => {
    const fileNameVideo = utils.sanitizeFileName(`${row.id} ${row.artist} - ${row.title}.osz`);
    const fileNameNoVideo = row.has_video ? fileNameVideo.replace('.osz', ' (no video).osz') : fileNameVideo;
    return {
        id: row.id,
        title: row.title,
        artist: row.artist,
        mapper: row.mapper,
        source: row.source,
        language: row.language,
        genre: row.genre,
        tags: row.tags,
        status: row.status,
        status_name: utils.osuStatusToName(row.status),
        time_submitted: row.time_submitted,
        time_ranked: row.time_ranked,
        has_video: row.has_video,
        is_download_disabled: row.is_download_disabled,
        is_nsfw: row.is_nsfw,
        size_video: row.video_size,
        size_novideo: row.novideo_size,
        suggested_file_name_video: fileNameVideo,
        suggested_file_name_novideo: fileNameNoVideo
    };
};

/**
 * Format a beatmap entry into a standardized object.
 * @param {object} row A row from the `beatmaps` table.
 */
const formatBeatmap = row => {
    return {
        ...row,
        status_name: utils.osuStatusToName(row.status),
        mode_name: utils.osuModeToName(row.mode),
        difficulty_color: utils.starsToColor(row.stars)
    };
};

/**
 * Get data for one or more saved beatmapsets.
 * @param {number[]} mapsetIds A list of IDs to get data for
 * @param {boolean} [includeBeatmaps=true] Include each mapset's array of maps?
 * @returns An array of beatmapsets.
 */
const getBeatmapsets = (mapsetIds, includeBeatmaps = true) => {
    // Get mapsets
    const rows = db
        .prepare(`SELECT * FROM beatmapsets WHERE id IN (${mapsetIds.map(() => '?').join(', ')})`)
        .all(mapsetIds);

    // Map mapsets to ID
    const mapsetsById = {};
    for (const row of rows) {
        mapsetsById[row.id] = formatBeatmapset(row);
    }

    // If we're including maps...
    if (includeBeatmaps) {
        // Get map rows
        const mapRows = db
            .prepare(
                `SELECT * FROM beatmaps
                WHERE beatmapset_id IN (${mapsetIds.map(() => '?').join(', ')})
                ORDER BY mode, stars ASC`
            )
            .all(...mapsetIds);

        // Add maps to their respective mapsets object
        for (const row of mapRows) {
            const entry = mapsetsById[row.beatmapset_id];
            if (!entry) continue;
            if (!entry.beatmaps) mapsetsById[row.beatmapset_id].beatmaps = [];
            mapsetsById[row.beatmapset_id].beatmaps.push(formatBeatmap(row));
        }
    }

    // Return original list of mapset IDs mapped to their formatted objects
    // Doing this retains the original sort order
    return mapsetIds.map(id => mapsetsById[id] || null).filter(Boolean);
};

/**
 * Get data for one or more saved beatmaps.
 * @param {number[]} mapIds A list of IDs to get data for
 * @param {boolean} [includeBeatmapsets=false] Include beatmapsets?
 * @returns An array of beatmaps.
 */
const getBeatmaps = (mapIds, includeBeatmapsets = true) => {
    // Get maps
    const rows = db.prepare(`SELECT * FROM beatmaps WHERE id IN (${mapIds.map(() => '?').join(', ')})`).all(mapIds);

    // Map maps to ID
    const mapsById = {};
    for (const row of rows) {
        mapsById[row.id] = formatBeatmap(row);
    }

    if (includeBeatmapsets) {
        // Get list of unique mapsets
        const mapsetIds = Array.from(new Set(rows.map(r => r.beatmapset_id)));
        const mapsetRows = db
            .prepare(`SELECT * FROM beatmapsets WHERE id IN (${mapsetIds.map(() => '?').join(', ')})`)
            .all(...mapsetIds);

        // Map mapsets to ID
        const mapsetsById = {};
        for (const row of mapsetRows) {
            mapsetsById[row.id] = formatBeatmapset(row);
        }

        // Add mapsets to maps
        for (const mapId of mapIds) {
            const entry = mapsById[mapId];
            if (!entry) continue;
            mapsById[mapId].beatmapset = mapsetsById[entry.beatmapset_id];
        }
    }

    return mapIds.map(id => mapsById[id] || null).filter(Boolean);
};

/**
 * Get data for a single beatmap.
 * @param {number} mapId The map ID
 * @param {boolean} includeBeatmapset Include beatmapset?
 * @returns The beatmap.
 */
const getBeatmap = (mapId, includeBeatmapset = true) => {
    return getBeatmaps([mapId], includeBeatmapset)[0] || null;
};

/**
 * Get data for a single beatmapset.
 * @param {number} mapsetId The mapset ID
 * @param {boolean} includeBeatmaps Include array of beatmaps?
 * @returns The mapset.
 */
const getBeatmapset = (mapsetId, includeBeatmaps = true) => {
    return getBeatmapsets([mapsetId], includeBeatmaps)[0] || null;
};

/**
 * Get SQL `WHERE` clauses, statement params, extracted filters, and text search contents from a user search query.
 * @param {string} query The search query
 */
const getSearchFilterSql = query => {
    const TOKEN_REGEX = /(?:([a-zA-Z0-9_]+)\s*(<=|>=|!=|=|<|>|:)\s*("[^"]+"|\S+))|("[^"]+"|\S+)/gi;

    const filters = [];
    const textTerms = [];

    let match;
    while ((match = TOKEN_REGEX.exec(query)) !== null) {
        if (match[1]) {
            // It's a filter (Key + Op + Value)
            const key = match[1].toLowerCase();
            const op = match[2];
            let val = match[3];

            // Strip quotes if present (e.g. "The Koral Reef" -> The Koral Reef)
            if (val.startsWith('"') && val.endsWith('"')) {
                val = val.slice(1, -1);
            }

            filters.push({ key, op, val });

            // Add mode filter if this filter is keys
            if (key == 'keys') {
                filters.push({
                    key: 'mode',
                    op: '=',
                    val: 'mania'
                });
            }
        } else {
            // It's a standard search term
            let term = match[4];

            // Strip quotes here too
            if (term.startsWith('"') && term.endsWith('"')) {
                term = term.slice(1, -1);
            }

            textTerms.push(term);
        }
    }

    const modeCols = {
        mode: 'map.mode'
    };
    const statusCols = {
        status: 'map.status'
    };
    const dateCols = {
        date: 'mapset.time_ranked',
        ranked: 'mapset.time_ranked',
        year: 'mapset.time_ranked',
        month: 'mapset.time_ranked',
        day: 'mapset.time_ranked',
        submitted: 'mapset.time_submitted'
    };
    const stringCols = {
        title: 'map_search.title',
        artist: 'map_search.artist',
        mapper: 'map_search.mapper',
        version: 'map_search.version',
        diff: 'map_search.version'
    };
    const numberCols = {
        stars: 'map.stars',
        length: 'map.length',
        cs: 'map.cs',
        keys: 'map.cs',
        ar: 'map.ar',
        od: 'map.od',
        acc: 'map.od',
        accuracy: 'map.od',
        hp: 'map.hp',
        health: 'map.hp',
        circles: 'map.circles',
        notes: 'map.circles',
        hits: 'map.circles',
        fruits: 'map.circles',
        sliders: 'map.sliders',
        drumrolls: 'map.sliders',
        longnotes: 'map.sliders',
        holdnotes: 'map.sliders',
        holds: 'map.sliders',
        spinners: 'map.spinners',
        streams: 'map.spinners',
        swells: 'map.spinners',
        showers: 'map.spinners',
        bananas: 'map.spinners'
    };
    const exactCols = {
        pack: 'pack_contents.pack_id'
    };

    // Filter filters to only keep a single equality filter for each key
    // This also filters out invalid filters
    const targetCols = new Set();
    const activeFilters = filters.filter(f => {
        if (f.op != '=' && f.op != ':') return true;
        const col =
            modeCols[f.key] ||
            statusCols[f.key] ||
            dateCols[f.key] ||
            stringCols[f.key] ||
            numberCols[f.key] ||
            exactCols[f.key];
        if (!col) return false;
        if (targetCols.has(col)) return false;
        targetCols.add(col);
        return true;
    });

    const whereClauses = [];
    const sqlParams = [];
    let shouldJoinSearchTable = false;
    let shouldJoinPackContents = false;

    for (const f of activeFilters) {
        // Get filter details
        const { key, op, val } = f;

        // Get individual range or list values
        const range = val
            .split('-')
            .map(v => (typeof v === 'string' ? v.trim() : v))
            .filter(Boolean)
            .splice(0, 2);
        const rangeFloats = range.map(v => parseFloat(v)).filter(Boolean);
        const list = val
            .split(',')
            .map(v => (typeof v === 'string' ? v.trim() : v))
            .filter(Boolean);
        const listFloats = list.map(v => parseFloat(v)).filter(Boolean);

        const orClauses = [];

        // Handle exact columns
        if (exactCols[key]) {
            const col = exactCols[key];
            if (key == 'pack') shouldJoinPackContents = true;
            for (const v of list) {
                orClauses.push(`${col} = ?`);
                sqlParams.push(v);
            }
        }

        // Handle mode filter
        if (modeCols[key]) {
            const col = modeCols[key];
            for (const v of list) {
                const mode = utils.osuModeToInt(v);
                orClauses.push(`${col} = ?`);
                sqlParams.push(mode);
            }
        }

        // Handle status filter
        if (statusCols[key]) {
            const col = statusCols[key];
            for (const v of list) {
                console.log(v);
                const status = utils.osuStatusToInt(v);
                whereClauses.push(`${col} = ?`);
                sqlParams.push(status);
            }
        }

        // Handle date filters
        if (dateCols[key]) {
            const col = dateCols[key];
            if (rangeFloats.length == 2 && val.match(/^\d{4}-\d{4}$/)) {
                // If the range appears to be 2 years, use their earliest and latest values as a range
                const r1 = utils.parseDateRange(range[0]);
                const r2 = utils.parseDateRange(range[1]);
                if (r1 && r2) {
                    whereClauses.push(`(${col} BETWEEN ? AND ?)`);
                    sqlParams.push(Math.min(r1.start, r2.start), Math.max(r1.end, r2.end));
                }
            } else if (list.length > 1) {
                // OR each range
                for (const v of list) {
                    const range = utils.parseDateRange(v);
                    if (range) {
                        orClauses.push(`(${col} BETWEEN ? AND ?)`);
                        sqlParams.push(range.start, range.end);
                    }
                }
            } else {
                // Intelligently use earliest or latest time depending on operator
                // Or use range if equal
                const range = utils.parseDateRange(val);
                if (range) {
                    if (op == '<' || op == '<=') {
                        whereClauses.push(`${col} ${op} ?`);
                        sqlParams.push(range.start);
                    } else if (op == '>' || op == '>=') {
                        whereClauses.push(`${col} ${op} ?`);
                        sqlParams.push(range.end);
                    } else {
                        whereClauses.push(`(${col} BETWEEN ? AND ?)`);
                        sqlParams.push(range.start, range.end);
                    }
                }
            }
        }

        // Handle string filters
        if (stringCols[key]) {
            const col = stringCols[key];
            if (op == '=' || op == ':') {
                // Use a MATCH comparison to search within the target string
                for (const v of list) {
                    orClauses.push(`${col} MATCH ?`);
                    sqlParams.push(v);
                    shouldJoinSearchTable = true;
                }
            } else {
                // Use exact search with greater or less than
                whereClauses.push(`${col} ${op} ?`);
                sqlParams.push(val);
            }
        }

        // Handle numeric filters
        if (numberCols[key]) {
            const col = numberCols[key];
            if (rangeFloats.length == 2) {
                // Get min and max provided value and use depending on operator
                const min = Math.min(...rangeFloats);
                const max = Math.max(...rangeFloats);
                if (op == '<' || op == '<=') {
                    whereClauses.push(`${col} ${op} ?`);
                    sqlParams.push(min);
                } else if (op == '>' || op == '>=') {
                    whereClauses.push(`${col} ${op} ?`);
                    sqlParams.push(max);
                } else {
                    whereClauses.push(`(${col} BETWEEN ? AND ?)`);
                    sqlParams.push(min, max);
                }
            } else if (listFloats.length > 1) {
                // Search within float range for each value
                for (const v of listFloats) {
                    const range = utils.numberToFloatRange(v);
                    orClauses.push(`${col} BETWEEN ? AND ?`);
                    sqlParams.push(range.start, range.end);
                }
            } else {
                // Get range of value to include decimals
                if (!isNaN(parseFloat(val))) {
                    const range = utils.numberToFloatRange(val);
                    orClauses.push(`${col} BETWEEN ? AND ?`);
                    sqlParams.push(range.start, range.end);
                }
            }
        }

        // If we have or clauses, push them together
        if (orClauses.length) whereClauses.push(`(${orClauses.join(' OR ')})`);
    }

    // Join text parts
    const textQuery = textTerms
        .map(term => term.trim())
        .map(term => `"${term.replace(/"/g, '""')}"`)
        .filter(Boolean)
        .join(' ');

    if (textQuery || shouldJoinSearchTable) {
        whereClauses.push(`map_search MATCH ?`);
        if (textQuery) sqlParams.push(textQuery);
        shouldJoinSearchTable = true;
    }

    const fromAndJoinClauses = [
        `FROM beatmaps map`,
        `JOIN beatmapsets mapset ON mapset.id = map.beatmapset_id`,
        shouldJoinSearchTable ? `JOIN map_search ON map_search.beatmap_id = map.id` : '',
        shouldJoinPackContents ? `JOIN pack_contents ON pack_contents.mapset_id = mapset.id` : ''
    ].join('\n');

    const whereClause = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    return {
        whereClause,
        sqlParams,
        filters,
        textQuery,
        fromAndJoinClauses,
        shouldJoinPackContents,
        shouldJoinSearchTable
    };
};

/**
 * Search and filter stored beatmaps and get a raw list of all matching beatmapset IDs.
 * @param {string} query The search query
 * @returns An unsorted array of resulting beatmapset IDs
 */
const searchBeatmapsRaw = query => {
    // Parse query
    const { whereClause, sqlParams, fromAndJoinClauses } = getSearchFilterSql(query);

    // Get results
    const mapsetIds = db
        .prepare(
            `SELECT mapset.id AS id
            ${fromAndJoinClauses}
            ${whereClause}
            GROUP BY mapset.id`
        )
        .all(...sqlParams)
        .map(r => r.id);

    // Return ids directly
    return mapsetIds;
};

/**
 * Get the video and novideo size if you were to download all queried mapset.
 * @param {string} query The search query
 * @returns An object with `size_video` and `size_novideo` number properties
 */
const searchBeatmapsSizes = query => {
    // Parse query
    const { whereClause, sqlParams, fromAndJoinClauses } = getSearchFilterSql(query);

    // Get sizes using a subquery to completely deduplicate mapsets first
    const totals = db
        .prepare(
            `SELECT
                COUNT(id) AS map_count,
                COALESCE(SUM(novideo_size), 0) AS size_novideo,
                COALESCE(SUM(CASE WHEN has_video = 1 THEN video_size ELSE novideo_size END), 0) AS size_video
            FROM (
                SELECT DISTINCT mapset.id, mapset.novideo_size, mapset.video_size, mapset.has_video
                ${fromAndJoinClauses}
                ${whereClause}
            )`
        )
        .get(...sqlParams);

    return totals;
};

/**
 * Search and filter stored beatmaps.
 * @param {string} query A query containing filters and/or search terms
 * @param {string} [sort='ranked_desc'] The sort order for results
 * @param {number} [limit=100] The maximum number of results to return
 * @param {number} [offset=0] The number of results to skip for pagination
 * @param {boolean} [idsOnly=false] If `true`, return resulting mapset ids only instead of full beatmapset objects
 * @returns A sorted array of beatmapsets with beatmaps included.
 */
const searchBeatmaps = (query = '', sort = 'auto', limit = 100, offset = 0) => {
    // Parse query
    const { whereClause, sqlParams, fromAndJoinClauses, shouldJoinSearchTable } = getSearchFilterSql(query);

    // Get sort order
    let orderBy = 'mapset.time_ranked DESC';
    switch (sort) {
        case 'ranked_desc':
            orderBy = `mapset.time_ranked DESC`;
            break;
        case 'ranked_asc':
            orderBy = `mapset.time_ranked ASC`;
            break;
        case 'stars_desc':
            orderBy = `map.stars DESC`;
            break;
        case 'stars_asc':
            orderBy = `map.stars ASC`;
            break;
        case 'bpm_desc':
            orderBy = `map.bpm DESC`;
            break;
        case 'bpm_asc':
            orderBy = `map.bpm ASC`;
            break;
        case 'length_desc':
            orderBy = `map.total_length DESC`;
            break;
        case 'length_asc':
            orderBy = `map.total_length ASC`;
            break;
        default:
            shouldJoinSearchTable
                ? (orderBy = `map_search.rank, mapset.time_ranked DESC`)
                : (orderBy = 'mapset.time_ranked DESC');
            break;
    }

    // Get total result count
    const totals = db
        .prepare(
            `SELECT
                COUNT(DISTINCT mapset.id) AS total_beatmapsets,
                COUNT(*) AS total_beatmaps
            ${fromAndJoinClauses}
            ${whereClause}`
        )
        .get(...sqlParams);

    // Get results
    // We only join the search table if we're preforming full text search
    // We also use the beatmaps table so we can get results if ANY map in a mapset passes filters
    const mapsetIds = db
        .prepare(
            `SELECT mapset.id AS id
            ${fromAndJoinClauses}
            ${whereClause}
            GROUP BY mapset.id
            ORDER BY ${orderBy}
            LIMIT ? OFFSET ?`
        )
        .all(...sqlParams, limit, offset)
        .map(r => r.id);

    // Get full beatmapset entries
    const beatmapsets = getBeatmapsets(mapsetIds);

    // Return results
    return {
        beatmapsets,
        limit,
        offset,
        count: totals
    };
};

module.exports = {
    getBeatmap,
    getBeatmaps,
    getBeatmapset,
    getBeatmapsets,
    searchBeatmaps,
    searchBeatmapsRaw,
    searchBeatmapsSizes
};

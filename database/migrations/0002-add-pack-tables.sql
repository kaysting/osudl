CREATE TABLE
    'users' (
        'id' INTEGER NOT NULL PRIMARY KEY, -- osu user ID
        'name' TEXT NOT NULL,
        'avatar_url' TEXT NOT NULL, -- returned by osu api
        'banner_url' TEXT NOT NULL,
        'time_created' INTEGER NOT NULL,
        'time_last_login' INTEGER NOT NULL -- updated every 5 ish minutes the user loads a page
    );

-- This table will track things like video/novideo preference
CREATE TABLE
    'user_preferences' (
        'user_id' INTEGER NOT NULL,
        'key' TEXT NOT NULL,
        'value' TEXT NOT NULL,
        PRIMARY KEY ('user_id', 'key')
    );

CREATE TABLE
    'pack_meta' (
        'id' TEXT NOT NULL PRIMARY KEY, -- some unique hex string, probably 8 chars
        'name' TEXT NOT NULL,
        'creator_user_id' INTEGER, -- nullable for anonymous downloads
        'content_sha256' TEXT NOT NULL, -- matches the sha256 col of an entry in the pack_contents table
        'time_created' INTEGER NOT NULL,
        'time_updated' INTEGER NOT NULL,
        'count_downloads' INTEGER NOT NULL DEFAULT 0, -- increment this when a download is 50% complete (or something?)
        'source' TEXT NOT NULL, -- either 'query' or 'custom'
        'query' TEXT, -- stores the query if source is query
        'is_visible' INTEGER NOT NULL DEFAULT 1 -- determines if the pack is visible on search/pack lists
    );

CREATE TABLE
    'pack_contents' (
        'sha256' TEXT NOT NULL PRIMARY KEY, -- the hash of the ids below
        'mapset_ids' BLOB NOT NULL, -- a sorted array of mapset ids
        'size_video' INTEGER NOT NULL,
        'size_novideo' INTEGER NOT NULL,
        'count' INTEGER NOT NULL,
        'time_created' INTEGER NOT NULL
    );

CREATE TABLE
    'pack_downloads' (
        'id' TEXT NOT NULL PRIMARY KEY,
        'pack_id' TEXT NOT NULL,
        'user_id' INTEGER,
        'time_started' INTEGER NOT NULL,
        'time_finished' INTEGER
    );

CREATE INDEX idx_pack_creator ON pack_meta (creator_user_id);

CREATE INDEX idx_pack_downloads_count ON pack_meta (count_downloads DESC);

CREATE INDEX idx_dl_time ON pack_downloads (time_started DESC);
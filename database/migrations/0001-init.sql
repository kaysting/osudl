CREATE TABLE
    'beatmapsets' (
        'id' INTEGER NOT NULL,
        'title' TEXT NOT NULL,
        'artist' TEXT NOT NULL,
        'mapper' TEXT NOT NULL,
        'source' TEXT NOT NULL,
        'language' TEXT NOT NULL,
        'genre' TEXT NOT NULL,
        'tags' TEXT NOT NULL,
        'status' INTEGER NOT NULL,
        'time_submitted' INTEGER NOT NULL,
        'time_ranked' INTEGER NOT NULL,
        'has_video' INTEGER NOT NULL,
        'is_download_disabled' INTEGER NOT NULL,
        'is_nsfw' INTEGER NOT NULL,
        -- Storage details left null until stored
        'novideo_s3_key' TEXT,
        'video_s3_key' TEXT,
        'novideo_size' INTEGER,
        'video_size' INTEGER,
        'novideo_sha256' TEXT,
        'video_sha256' TEXT,
        PRIMARY KEY ('id')
    );

CREATE TABLE
    'beatmaps' (
        'id' INTEGER NOT NULL,
        'beatmapset_id' INTEGER NOT NULL,
        'version' TEXT NOT NULL,
        'mode' INTEGER NOT NULL, -- 0 = osu, 1 = taiko, 2 = catch, 3 = mania
        'status' INTEGER NOT NULL,
        'total_length' INTEGER NOT NULL,
        'stars' REAL NOT NULL,
        'bpm' REAL NOT NULL,
        'cs' REAL NOT NULL,
        'ar' REAL NOT NULL,
        'od' REAL NOT NULL,
        'hp' REAL NOT NULL,
        'count_circles' INTEGER NOT NULL,
        'count_sliders' INTEGER NOT NULL,
        'count_spinners' INTEGER NOT NULL,
        PRIMARY KEY ('id')
    );

CREATE INDEX idx_beatmaps_set_id ON beatmaps (beatmapset_id);

CREATE INDEX idx_sets_status_time ON beatmapsets (status, time_ranked DESC);

CREATE INDEX idx_sets_is_download_disabled ON beatmapsets (is_download_disabled);

CREATE INDEX idx_sets_is_nsfw ON beatmapsets (is_nsfw);

CREATE INDEX idx_maps_mode_stars ON beatmaps (mode, stars);

CREATE INDEX idx_maps_bpm ON beatmaps (bpm);

CREATE INDEX idx_maps_length ON beatmaps (total_length);

CREATE INDEX idx_maps_mode_cs ON beatmaps (mode, cs);

CREATE INDEX idx_maps_mode_ar ON beatmaps (mode, ar);

CREATE INDEX idx_maps_mode_od ON beatmaps (mode, od);

CREATE INDEX idx_maps_mode_hp ON beatmaps (mode, hp);

CREATE VIRTUAL TABLE map_search USING fts5 (
    'title',
    'artist',
    'version',
    'genre',
    'tags',
    'source',
    'beatmap_id' UNINDEXED,
    'beatmapset_id' UNINDEXED
);

CREATE TABLE
    'misc' ('key' TEXT NOT NULL, 'value' TEXT, PRIMARY KEY ('key'))
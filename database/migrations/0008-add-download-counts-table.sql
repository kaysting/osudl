CREATE TABLE
    'beatmapset_downloads' (
        'mapset_id' INTEGER NOT NULL PRIMARY KEY,
        'count_video' INTEGER NOT NULL DEFAULT 0,
        'count_novideo' INTEGER NOT NULL DEFAULT 0
    );
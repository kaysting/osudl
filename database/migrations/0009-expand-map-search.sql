DROP TABLE map_search;

CREATE VIRTUAL TABLE map_search USING fts5 (
    'title',
    'artist',
    'mapper',
    'genre',
    'source',
    'language',
    'version',
    'tags',
    'beatmap_id' UNINDEXED,
    'beatmapset_id' UNINDEXED
);

INSERT INTO
    map_search (
        title,
        artist,
        mapper,
        genre,
        source,
        language,
        version,
        tags,
        beatmap_id,
        beatmapset_id
    )
SELECT
    s.title,
    s.artist,
    s.mapper,
    s.genre,
    s.source,
    s.language,
    b.version,
    s.tags,
    b.id AS beatmap_id,
    s.id AS beatmapset_id
FROM
    beatmaps b
    JOIN beatmapsets s ON b.beatmapset_id = s.id;
DROP TABLE IF EXISTS pack_contents;

CREATE TABLE
    pack_contents (
        pack_id TEXT NOT NULL,
        mapset_id INTEGER NOT NULL,
        PRIMARY KEY (pack_id, mapset_id),
        FOREIGN KEY (pack_id) REFERENCES pack_meta (id) ON DELETE CASCADE,
        FOREIGN KEY (mapset_id) REFERENCES beatmapsets (id) ON DELETE CASCADE
    );

-- Index for finding which packs contain a specific mapset
CREATE INDEX pack_contents_mapset ON pack_contents (mapset_id);

-- Wipe old hashed packs
DELETE FROM pack_meta;

-- Remove the hash column
ALTER TABLE pack_meta
DROP COLUMN content_sha256;
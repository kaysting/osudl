ALTER TABLE pack_downloads
ADD COLUMN count_maps_downloaded INTEGER NOT NULL DEFAULT 0;

ALTER TABLE pack_downloads
DROP COLUMN time_finished;
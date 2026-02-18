ALTER TABLE pack_downloads
ADD COLUMN is_counted_towards_total INTEGER NOT NULL DEFAULT 0;
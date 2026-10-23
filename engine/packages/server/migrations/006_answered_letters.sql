-- Letters each Tinker has answered (work order 018): an answered letter never
-- returns to the Post's deck; a discarded one still does.
ALTER TABLE tinkers ADD COLUMN answered jsonb NOT NULL DEFAULT '[]';

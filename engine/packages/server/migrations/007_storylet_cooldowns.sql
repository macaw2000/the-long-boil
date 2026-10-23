-- When each storylet with a cooldown was last played (work order 019): such
-- a storylet stays closed for its cooldown_hours after it is played.
ALTER TABLE tinkers ADD COLUMN played_at jsonb NOT NULL DEFAULT '{}';

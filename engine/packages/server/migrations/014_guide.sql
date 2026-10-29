-- Brassbuckle's first-session guide: how far the player has pressed through
-- it, whether they skipped it, and which places it has shown them. Kept with
-- the Tinker, so a second device neither replays it nor hides the screen
-- again. NULL until the client first saves it.
ALTER TABLE tinkers ADD COLUMN guide jsonb;

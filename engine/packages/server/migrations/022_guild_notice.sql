-- The guild notice board: one notice, pinned by the leader or an officer,
-- for members who come by at different times. Empty when nothing is pinned.
ALTER TABLE guilds
  ADD COLUMN notice    text NOT NULL DEFAULT '' CHECK (char_length(notice) <= 500),
  ADD COLUMN notice_at timestamptz,
  ADD COLUMN notice_by bigint REFERENCES tinkers (id);

-- How a guild takes applications, set by its leader: whether it takes any,
-- the total level it asks, and whether applicants are let in at once.
ALTER TABLE guilds
  ADD COLUMN recruiting  boolean NOT NULL DEFAULT true,
  ADD COLUMN min_level   integer NOT NULL DEFAULT 0 CHECK (min_level BETWEEN 0 AND 9999),
  ADD COLUMN auto_accept boolean NOT NULL DEFAULT false;

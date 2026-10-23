-- The story engine (milestone 6): Nerve, the Post's hand and clock, each
-- Needle's falling clock, and the story qualities projection (build plan,
-- Database: "qualities: story qualities, Nerve, Needles"). Skills and items
-- are not stored here; the story reads them from skills and inventory.

ALTER TABLE tinkers
  ADD COLUMN nerve      integer NOT NULL DEFAULT 10 CHECK (nerve >= 0),
  ADD COLUMN nerve_at   timestamptz,
  ADD COLUMN post_at    timestamptz,
  ADD COLUMN hand       jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN needle_at  jsonb NOT NULL DEFAULT '{}';

-- Tinkers made before the story existed start it now, with Pip's letter due.
UPDATE tinkers SET nerve_at = now(), post_at = now() - interval '2 hours';
ALTER TABLE tinkers ALTER COLUMN nerve_at SET NOT NULL, ALTER COLUMN post_at SET NOT NULL;

CREATE TABLE qualities (
  tinker_id  bigint NOT NULL REFERENCES tinkers (id),
  name       text NOT NULL,
  value      integer NOT NULL,
  PRIMARY KEY (tinker_id, name)
);

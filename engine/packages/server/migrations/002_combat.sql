-- Combat state (milestone 3): the equipped weapon, the seeded generator,
-- part-eaten Rations, each zone's Ledger Page counter, and bosses beaten.
-- Combat XP is split by share (70% / 5%), so skill XP holds fractions.

ALTER TABLE tinkers
  ADD COLUMN weapon         text,
  ADD COLUMN rng            bigint NOT NULL DEFAULT 0 CHECK (rng >= 0 AND rng < 4294967296),
  ADD COLUMN ration_debt    double precision NOT NULL DEFAULT 0,
  ADD COLUMN pity           jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN bosses_beaten  jsonb NOT NULL DEFAULT '[]';

ALTER TABLE skills ALTER COLUMN xp TYPE double precision;

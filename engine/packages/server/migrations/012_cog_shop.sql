-- The Cog Shop (GDD section 8). Gilded Cogs are kept per Tinker like Crowns,
-- and so are what they bought: queue slots, the Boiler's hours, the Nerve
-- cap and the Boiler Boost. head_boosted records whether the head's current
-- go started under the Boost (rules TinkerState.headBoosted).
ALTER TABLE tinkers
  ADD COLUMN cogs          bigint NOT NULL DEFAULT 0 CHECK (cogs >= 0),
  ADD COLUMN queue_slots   smallint NOT NULL DEFAULT 2,
  ADD COLUMN boiler_hours  smallint NOT NULL DEFAULT 12,
  ADD COLUMN nerve_cap     smallint NOT NULL DEFAULT 10,
  ADD COLUMN boost_until   timestamptz NOT NULL DEFAULT 'epoch',
  ADD COLUMN head_boosted  boolean NOT NULL DEFAULT false;

-- The extra queue slot.
ALTER TABLE queue DROP CONSTRAINT queue_slot_check;
ALTER TABLE queue ADD CONSTRAINT queue_slot_check CHECK (slot IN (0, 1, 2));

-- Crates bought or granted, held until their lock ends (72 hours for a
-- bought crate, to blunt card fraud) and then put in the Tinker's inventory
-- the next time it is touched. `reference` is unique, so a payment that is
-- reported twice delivers once.
CREATE TABLE crate_deliveries (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tinker_id     bigint NOT NULL REFERENCES tinkers (id),
  qty           integer NOT NULL CHECK (qty > 0),
  source        text NOT NULL CHECK (source IN ('grant', 'stripe')),
  reference     text UNIQUE,
  created_at    timestamptz NOT NULL,
  unlocks_at    timestamptz NOT NULL,
  delivered_at  timestamptz
);
CREATE INDEX crate_deliveries_waiting ON crate_deliveries (tinker_id) WHERE delivered_at IS NULL;

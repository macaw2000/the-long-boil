-- Gear and tools (work order 029): what is worn in the six combat-level
-- slots, by slot; the tool held for each skill, by skill; and the tool speed
-- the head go started with, which it keeps to the end, as headBoosted does.
ALTER TABLE tinkers
  ADD COLUMN worn      jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN tools     jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN head_tool smallint NOT NULL DEFAULT 0 CHECK (head_tool >= 0);

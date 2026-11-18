-- How a Tinker looks (work order 042). `body` is the free pick, null until the
-- player has made it, when the first body in content/looks/looks.json is
-- shown. `outfit` and `backdrop` are what is worn, null for the leathers and
-- the plain wall every Tinker starts with. `looks` are the outfits and
-- backdrops bought with Cogs; one opened by Favour is not kept here, since
-- the Favour itself says it may be worn.
ALTER TABLE tinkers
  ADD COLUMN body      text,
  ADD COLUMN outfit    text,
  ADD COLUMN backdrop  text,
  ADD COLUMN looks     text[] NOT NULL DEFAULT '{}';

-- Finding a Tinker by the start of its name, whatever its case.
CREATE INDEX tinkers_name_lower ON tinkers (lower(name) text_pattern_ops);

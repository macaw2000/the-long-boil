-- The worn armour piece's item id (GDD section 6: "a loadout is one weapon
-- and one armour piece"), alongside the weapon. NULL until one is put on.
ALTER TABLE tinkers ADD COLUMN armour text;

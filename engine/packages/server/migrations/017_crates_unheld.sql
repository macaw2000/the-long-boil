-- Bought crates are no longer held (Jeremy, 2 November 2026): content/tuning/cog-shop.json
-- sets lock_hours to 0, and crates bought under the old 72-hour hold are released now,
-- so they land the next time their Tinker is brought up to date.
UPDATE crate_deliveries
   SET unlocks_at = created_at
 WHERE delivered_at IS NULL AND revoked_at IS NULL AND unlocks_at > created_at;

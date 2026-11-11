-- The Guild tab's recent activity, read from the event log. Guild events
-- carry their guild's id; members' level-ups and boss fights are read per
-- Tinker. Both indexes cover only the events the feed reads.
CREATE INDEX events_guild ON events ((payload->>'guild'), at)
  WHERE type IN ('guild_founded', 'guild_joined', 'guild_left', 'guild_renamed', 'guild_rank', 'guild_notice');
CREATE INDEX events_feats ON events (tinker_id, at) WHERE type IN ('level_up', 'boss_attempted');

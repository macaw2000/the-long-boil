-- The admin console counts who comes back from counted visits (build plan
-- milestone 14). Fights log an event a kill, so without this each look at the
-- Overview would read the whole log for a few rows a day.
CREATE INDEX events_visits ON events (tinker_id, recorded_at) WHERE type = 'check_in_counted';

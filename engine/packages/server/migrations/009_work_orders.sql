-- Build plan milestone 9: Work Orders (work order 022). A Tinker's desk of
-- waiting orders and the clock for the next one, as one projection beside
-- the event log, like the Post's hand.
ALTER TABLE tinkers
  ADD COLUMN work_orders jsonb NOT NULL DEFAULT '{"offers": [], "nextAt": null, "serial": 0}';

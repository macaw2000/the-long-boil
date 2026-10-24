-- The dev clock on a deployed dev server (src/api.ts, devClockInDatabase):
-- how far the server's clock runs ahead of the wall clock. A container's
-- disk does not outlive a deploy, so the offset lives here. One row at most;
-- a server without LONG_BOIL_DEV never reads it.

CREATE TABLE dev_clock (
  only_row   boolean PRIMARY KEY DEFAULT true CHECK (only_row),
  offset_ms  bigint NOT NULL CHECK (offset_ms >= 0)
);

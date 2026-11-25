-- Jobs finished (a craft, a gather or a fight), which open the left bar's
-- places in the first hour. A long absence counts for a few (rules JOBS_CREDIT).
ALTER TABLE tinkers ADD COLUMN jobs_done integer NOT NULL DEFAULT 0;

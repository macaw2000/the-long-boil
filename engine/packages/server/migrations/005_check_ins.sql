-- When each Tinker's last counted visit began, for record.check_ins: a
-- check-in counts as a visit an hour or more after the last counted one.
ALTER TABLE tinkers ADD COLUMN check_in_at timestamptz;

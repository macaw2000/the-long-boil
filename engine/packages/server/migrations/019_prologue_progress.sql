-- Work order 037 rewrote the Prologue, and no scene now opens at the old
-- progress 80 (the lecture done) or 90 (the Gazette done): a Tinker left there
-- would be stuck. Both are one scene from the brass plate, which opens at 70.
-- This moves the projection only; the event log keeps what was played.
UPDATE qualities SET value = 70 WHERE name = 'prologue.progress' AND value IN (80, 90);

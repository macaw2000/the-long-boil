-- Hot steam (work order 045): a stock of goes that run at six times speed
-- while the player is at the workshop. The default grants the full stock to
-- every Tinker already here. hot_until is the window a look or a check-in
-- opens; head_hot records whether the head's current go started hot (rules
-- TinkerState.hotGoes, hotUntil, headHot).
-- first_kills: the ordinary monsters a Tinker has beaten at least once, for
-- their first-kill drops (work order 047). firsts: the first-hour goals
-- already claimed (work order 049).
ALTER TABLE tinkers
  ADD COLUMN hot_goes     integer NOT NULL DEFAULT 300 CHECK (hot_goes >= 0),
  ADD COLUMN hot_until    timestamptz NOT NULL DEFAULT 'epoch',
  ADD COLUMN head_hot     boolean NOT NULL DEFAULT false,
  ADD COLUMN first_kills  jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN firsts       jsonb NOT NULL DEFAULT '[]';

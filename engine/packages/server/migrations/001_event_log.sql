-- The first schema: accounts, Tinkers, the per-Tinker event log, and the
-- projections the game reads (GDD section 10, Data; docs/build-plan.md).
-- Every state change appends to events and updates the projections in the
-- same transaction, so the projections can always be rebuilt from the log.

CREATE TABLE accounts (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  login       text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tinkers (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id       bigint NOT NULL REFERENCES accounts (id),
  name             text NOT NULL,
  crowns           bigint NOT NULL DEFAULT 0 CHECK (crowns >= 0),
  progress_ms      bigint NOT NULL DEFAULT 0,
  resolved_to      timestamptz NOT NULL,
  steam_until      timestamptz NOT NULL,
  last_seq         bigint NOT NULL DEFAULT 0,
  content_version  text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tinkers_account ON tinkers (account_id);

-- GDD section 10: 3 Tinkers per account.
CREATE FUNCTION tinkers_per_account() RETURNS trigger AS $$
BEGIN
  IF (SELECT count(*) FROM tinkers WHERE account_id = NEW.account_id) >= 3 THEN
    RAISE EXCEPTION 'an account holds at most 3 Tinkers';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER tinkers_per_account BEFORE INSERT ON tinkers
  FOR EACH ROW EXECUTE FUNCTION tinkers_per_account();

CREATE TABLE events (
  tinker_id        bigint NOT NULL REFERENCES tinkers (id),
  seq              bigint NOT NULL,
  type             text NOT NULL,
  at               timestamptz NOT NULL,
  payload          jsonb NOT NULL,
  content_version  text NOT NULL,
  recorded_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tinker_id, seq)
);

CREATE TABLE inventory (
  tinker_id  bigint NOT NULL REFERENCES tinkers (id),
  item       text NOT NULL,
  bound      boolean NOT NULL,
  qty        bigint NOT NULL CHECK (qty > 0),
  PRIMARY KEY (tinker_id, item, bound)
);

CREATE TABLE skills (
  tinker_id  bigint NOT NULL REFERENCES tinkers (id),
  skill      text NOT NULL,
  xp         bigint NOT NULL CHECK (xp >= 0),
  PRIMARY KEY (tinker_id, skill)
);

CREATE TABLE queue (
  tinker_id  bigint NOT NULL REFERENCES tinkers (id),
  slot       smallint NOT NULL CHECK (slot IN (0, 1)),
  action_id  text NOT NULL,
  remaining  integer NOT NULL CHECK (remaining > 0),
  PRIMARY KEY (tinker_id, slot)
);

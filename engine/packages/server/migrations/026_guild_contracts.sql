-- Guild Contracts (work order 043). None of these reference guilds: a row is
-- written while a Tinker's own row is locked, and a foreign key would also
-- want the guild's, which guild steps lock the other way round.
CREATE TABLE guild_weeks (
  guild_id   bigint NOT NULL,
  week       timestamptz NOT NULL,
  -- The five kinds drawn, and the most tiers each has reached. A tier once
  -- reached stays, though a member joining later raises the targets.
  kinds      text[] NOT NULL,
  reached    integer[] NOT NULL,
  closed_at  timestamptz,
  PRIMARY KEY (guild_id, week)
);
-- Who a week's targets are scaled to, and the part of the week each was there for.
CREATE TABLE guild_week_members (
  guild_id   bigint NOT NULL,
  week       timestamptz NOT NULL,
  account_id bigint NOT NULL,
  share      double precision NOT NULL,
  PRIMARY KEY (guild_id, week, account_id)
);
CREATE TABLE guild_contract_shares (
  guild_id   bigint NOT NULL,
  week       timestamptz NOT NULL,
  kind       text NOT NULL,
  tinker_id  bigint NOT NULL,
  seconds    bigint NOT NULL,
  PRIMARY KEY (guild_id, week, kind, tinker_id)
);
-- One payment an account a week, whichever guild paid it; collected when the Tinker is next touched.
CREATE TABLE guild_token_payments (
  account_id bigint NOT NULL,
  week       timestamptz NOT NULL,
  guild_id   bigint NOT NULL,
  tinker_id  bigint NOT NULL,
  tokens     integer NOT NULL CHECK (tokens > 0),
  collected  boolean NOT NULL DEFAULT false,
  PRIMARY KEY (account_id, week)
);
CREATE INDEX guild_token_due ON guild_token_payments (tinker_id) WHERE NOT collected;

ALTER TABLE tinkers ADD COLUMN guild_tokens integer NOT NULL DEFAULT 0 CHECK (guild_tokens >= 0);
ALTER TABLE guilds ADD COLUMN workshop_points integer NOT NULL DEFAULT 0 CHECK (workshop_points >= 0);

-- The activity feed also tells of tiers reached.
DROP INDEX events_guild;
CREATE INDEX events_guild ON events ((payload->>'guild'), at)
  WHERE type IN ('guild_founded', 'guild_joined', 'guild_left', 'guild_renamed', 'guild_rank', 'guild_notice', 'guild_tier');

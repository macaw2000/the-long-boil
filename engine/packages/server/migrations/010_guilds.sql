-- Build plan milestone 10: guilds. A guild starts as a charter that Tinkers
-- pledge Crowns toward and forms when the 500,000-Crown fee is paid in full;
-- an unfilled or abandoned charter refunds its pledges. One guild per
-- account, one leader per guild.
CREATE TABLE guilds (
  id           bigserial PRIMARY KEY,
  name         text NOT NULL,
  status       text NOT NULL CHECK (status IN ('charter', 'active', 'abandoned', 'disbanded')),
  pledged      bigint NOT NULL DEFAULT 0 CHECK (pledged >= 0),
  created_at   timestamptz NOT NULL,
  charter_ends timestamptz NOT NULL,
  formed_at    timestamptz,
  closed_at    timestamptz
);
-- A name is unique among guilds that are open or forming.
CREATE UNIQUE INDEX guilds_name ON guilds (lower(name)) WHERE status IN ('charter', 'active');

CREATE TABLE guild_members (
  guild_id    bigint NOT NULL REFERENCES guilds (id),
  tinker_id   bigint NOT NULL UNIQUE REFERENCES tinkers (id),
  account_id  bigint NOT NULL UNIQUE REFERENCES accounts (id),
  rank        text NOT NULL CHECK (rank IN ('leader', 'officer', 'member')),
  joined_at   timestamptz NOT NULL,
  work_orders integer NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, tinker_id)
);
CREATE UNIQUE INDEX guild_one_leader ON guild_members (guild_id) WHERE rank = 'leader';

CREATE TABLE guild_pledges (
  id          bigserial PRIMARY KEY,
  guild_id    bigint NOT NULL REFERENCES guilds (id),
  tinker_id   bigint NOT NULL REFERENCES tinkers (id),
  crowns      bigint NOT NULL CHECK (crowns > 0),
  at          timestamptz NOT NULL,
  refunded_at timestamptz
);
CREATE INDEX guild_pledges_guild ON guild_pledges (guild_id);

-- Invitations from a guild and applications to one, until answered.
CREATE TABLE guild_requests (
  guild_id     bigint NOT NULL REFERENCES guilds (id),
  tinker_id    bigint NOT NULL REFERENCES tinkers (id),
  kind         text NOT NULL CHECK (kind IN ('invite', 'application')),
  by_tinker_id bigint NOT NULL REFERENCES tinkers (id),
  at           timestamptz NOT NULL,
  PRIMARY KEY (guild_id, tinker_id)
);

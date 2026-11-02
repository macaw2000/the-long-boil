-- The admin console (build plan milestone 14, Jeremy, 2 November 2026): who
-- each account is (the email and provider it signed in with, kept for running
-- the game and shown only to admins), when it was last seen, and its ban. A
-- ban is per account and chosen per ban: 'chat' stops posting and hides the
-- account's messages; 'full' also keeps it out of the game. Nothing is deleted,
-- so lifting a ban restores everything. An admin can remove one chat message.
ALTER TABLE accounts
  ADD COLUMN email        text,
  ADD COLUMN provider     text,
  ADD COLUMN last_seen_at timestamptz,
  ADD COLUMN ban          text CHECK (ban IN ('chat', 'full')),
  ADD COLUMN ban_reason   text,
  ADD COLUMN banned_at    timestamptz,
  ADD CONSTRAINT accounts_ban_whole CHECK ((ban IS NULL) = (banned_at IS NULL));

CREATE INDEX accounts_last_seen ON accounts (last_seen_at DESC);

ALTER TABLE chat_messages ADD COLUMN removed_at timestamptz;

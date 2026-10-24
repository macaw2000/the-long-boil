-- Build plan milestone 8: city chat. Messages are kept, so history survives
-- a restart; a mute hides a sender's account from one muting account only.
CREATE TABLE chat_messages (
  id         bigserial PRIMARY KEY,
  channel    text NOT NULL,
  tinker_id  bigint NOT NULL REFERENCES tinkers (id),
  account_id bigint NOT NULL REFERENCES accounts (id),
  body       text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 280),
  at         timestamptz NOT NULL
);
CREATE INDEX chat_messages_channel ON chat_messages (channel, id DESC);
CREATE INDEX chat_messages_account ON chat_messages (account_id, at DESC);

CREATE TABLE chat_mutes (
  account_id       bigint NOT NULL REFERENCES accounts (id),
  muted_account_id bigint NOT NULL REFERENCES accounts (id),
  PRIMARY KEY (account_id, muted_account_id),
  CHECK (account_id <> muted_account_id)
);

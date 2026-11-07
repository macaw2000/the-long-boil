-- The Boiler reminder (work order 039). Reminders are on by default; the
-- token is what an email's one-click link carries, so turning them off needs
-- no sign-in. reminded_steam is the Boiler run a Tinker was last emailed about.
ALTER TABLE accounts
  ADD COLUMN reminders boolean NOT NULL DEFAULT true,
  ADD COLUMN reminder_token uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN reminded_at timestamptz,
  ADD COLUMN reminders_notice boolean NOT NULL DEFAULT false;
-- Accounts made before reminders signed up under a promise of no such email,
-- and the privacy page says a change like this is said in the game. They get
-- no reminder until they have seen that notice. New accounts are told at sign-in.
UPDATE accounts SET reminders_notice = true;
CREATE UNIQUE INDEX accounts_reminder_token ON accounts (reminder_token);
ALTER TABLE tinkers ADD COLUMN reminded_steam timestamptz;

# Work order 039: the Boiler reminder

**Agents:** `scrivener` for the email's words; the lead session for the schema, server, client and infra; `educator` and `inspector` on the words; `registrar` for the row.
**Status:** done (6 November 2026). `email.boiler_reminder` reviewed after two failed rounds; the opt-out passed all eight novice reads. Sending starts by itself once AWS grants SES production access.
**Blocks:** nothing in the build plan.

## Why this one

No tester who started since 3 November was seen again after their first stretch, and nothing called them back. Jeremy, 6 November 2026: reminders are on by default, and "make sure there is easy opt-out instructions on the email".

## What it is

- **One email when a Boiler runs out** and the player has not returned. A Boiler only refills on a check-in, so a player who stays away gets one email and no more.
- **At most one email an account every two days,** so a player who visits daily is not written to daily (the inspector's review).
- **An account made before this sees a notice in the game first,** and gets no reminder until it has: those players signed up under "never used for marketing", and the privacy page promises that a change like this is said in the game.
- **On by default** for every account with an email. No email for a banned account, or to anyone seen in the last 30 minutes.
- **Only Boilers that ran out in the last 24 hours,** so turning this on does not write to everyone who ever played.
- **Opt-out:** every email says how, in plain words, with a one-click link that needs no sign-in, and carries List-Unsubscribe headers. A switch in the game does the same.
- **Sent through SES** from `reminders@thelongboil.com`, DKIM-signed. The server waits while SES is in its sandbox, and starts by itself once production access is granted.

## Scrivener

`content/email/boiler_reminder.json`. Must read true for every player, from one who left after a minute to one deep in Act I, so it says only what is always true, as a present state: the Boiler is out of steam, the workshop is idle, anything it made is waiting there. The email is sent without looking at the queue, so it never says work was running or has stopped. It reaches a person outside the game, who may have played once and forgotten the words: no game term beyond Boiler and workshop, and it must say what The Long Boil is. `{tinker}` stands for the Tinker's name. Layer 0, no new canon.

- `subject`: at most 10 words. Not alarming, and not a fake emergency.
- `lines`: two or three short paragraphs, at most 60 words in all.
- `button`: the link back, at most 4 words.
- `opt_out`: plain, not in voice: why they got this, and that the link below turns reminders off with one click, no sign-in. At most 30 words.
- `opt_out_link`: the link's words, at most 4 words, such as "Turn off reminders".

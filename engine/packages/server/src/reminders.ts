// The Boiler reminder (work order 039): one email when a Tinker's Boiler runs
// out and the player has not come back. A Boiler refills only on a check-in,
// so someone who stays away gets one email and no more, and someone who keeps
// visiting gets at most one every two days. Reminders are on by default, and
// every email says how to turn them off with one click.

import { GetAccountCommand, SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import type { GameContent } from "./content-loader.js";
import type { Db } from "./db.js";

const HOUR_MS = 3_600_000;
const EVERY_MS = 5 * 60_000;
/** Only a Boiler that ran out this recently: turning reminders on must not write to everyone who ever played. */
const FRESH_MS = 24 * HOUR_MS;
/** Someone seen this recently is still here, or was a moment ago. */
const AWAY_MS = HOUR_MS / 2;
/** At most one email an account in this long, so a player who visits once a day is not written to daily. */
const COOLDOWN_MS = 48 * HOUR_MS;

export interface ReminderWords {
  subject: string;
  lines: string[];
  button: string;
  opt_out: string;
  opt_out_link: string;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
  unsubscribeUrl: string;
}

export interface Mailer {
  /** False while the sender cannot reach players, as in SES's sandbox. */
  ready(): Promise<boolean>;
  send(mail: Mail): Promise<void>;
}

export function sesMailer(from: string, region: string): Mailer {
  const client = new SESv2Client({ region });
  return {
    async ready() {
      return (await client.send(new GetAccountCommand({}))).ProductionAccessEnabled === true;
    },
    async send(mail) {
      await client.send(
        new SendEmailCommand({
          FromEmailAddress: from,
          Destination: { ToAddresses: [mail.to] },
          Content: {
            Simple: {
              Subject: { Data: mail.subject, Charset: "UTF-8" },
              Body: { Text: { Data: mail.text, Charset: "UTF-8" }, Html: { Data: mail.html, Charset: "UTF-8" } },
              Headers: [
                { Name: "List-Unsubscribe", Value: `<${mail.unsubscribeUrl}>` },
                { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
              ],
            },
          },
        }),
      );
    },
  };
}

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The email for one player. The opt-out is part of the body in both forms, never only a header. */
export function reminderMail(words: ReminderWords, to: string, tinker: string, token: string, siteUrl: string, prefix = ""): Mail {
  const fill = (line: string) => line.replaceAll("{tinker}", tinker);
  const unsubscribeUrl = `${siteUrl}${prefix}/reminders/off?token=${token}`;
  const lines = words.lines.map(fill);
  const text = [...lines, `${words.button}: ${siteUrl}`, "--", words.opt_out, `${words.opt_out_link}: ${unsubscribeUrl}`].join("\n\n");
  const html = [
    `<div style="font-family:Georgia,serif;font-size:16px;line-height:1.5;color:#2b2118;max-width:520px">`,
    ...lines.map((line) => `<p>${escapeHtml(line)}</p>`),
    `<p><a href="${escapeHtml(siteUrl)}" style="color:#8a5a12;font-weight:bold">${escapeHtml(words.button)}</a></p>`,
    `<hr style="border:0;border-top:1px solid #d8cdbb;margin:24px 0">`,
    `<p style="font-size:14px">${escapeHtml(words.opt_out)}</p>`,
    `<p style="font-size:14px"><a href="${escapeHtml(unsubscribeUrl)}" style="color:#8a5a12">${escapeHtml(words.opt_out_link)}</a></p>`,
    `</div>`,
  ].join("");
  return { to, subject: fill(words.subject), text, html, unsubscribeUrl };
}

/**
 * Emails everyone due a reminder. The Boiler's end is on the game's clock and
 * last seen on the wall clock, so each is compared with its own. Each account
 * is claimed before it is sent to, so two servers overlapping in a deploy
 * cannot both write, and a send that fails is logged and not tried again.
 */
export async function sendReminders(db: Db, words: ReminderWords, mailer: Mailer, siteUrl: string, prefix: string, gameNow: number, at = Date.now()): Promise<number> {
  const due = (
    await db.query(
      `SELECT DISTINCT ON (a.id) a.id, a.email, a.reminder_token, t.name
       FROM accounts a JOIN tinkers t ON t.account_id = a.id
       WHERE a.reminders AND NOT a.reminders_notice AND a.email IS NOT NULL AND a.ban IS NULL
         AND (a.last_seen_at IS NULL OR a.last_seen_at < $1)
         AND (a.reminded_at IS NULL OR a.reminded_at < $4)
         AND t.steam_until <= $2 AND t.steam_until > $3
         AND t.reminded_steam IS DISTINCT FROM t.steam_until
       ORDER BY a.id, t.steam_until DESC`,
      [new Date(at - AWAY_MS), new Date(gameNow), new Date(gameNow - FRESH_MS), new Date(at - COOLDOWN_MS)],
    )
  ).rows;
  let sent = 0;
  for (const row of due) {
    const claimed = await db.query("UPDATE accounts SET reminded_at = $2 WHERE id = $1 AND (reminded_at IS NULL OR reminded_at < $3)", [
      row.id,
      new Date(at),
      new Date(at - COOLDOWN_MS),
    ]);
    if (!claimed.rowCount) continue;
    await db.query("UPDATE tinkers SET reminded_steam = steam_until WHERE account_id = $1 AND steam_until <= $2", [row.id, new Date(gameNow)]);
    try {
      await mailer.send(reminderMail(words, row.email, row.name, row.reminder_token, siteUrl, prefix));
      sent += 1;
    } catch (error) {
      console.warn(`reminder for account ${row.id} not sent: ${(error as Error).name}`);
    }
  }
  return sent;
}

/** Turns reminders off for the account this token belongs to; false for a token that is nobody's. */
export async function remindersOff(db: Db, token: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/.test(token)) return false;
  return ((await db.query("UPDATE accounts SET reminders = false WHERE reminder_token = $1", [token])).rowCount ?? 0) > 0;
}

/** Whether this account gets reminders, null when it has no email to send them to, and whether it still needs telling. */
export async function remindersOf(db: Db, login: string): Promise<{ reminders: boolean | null; reminderNotice: boolean }> {
  const row = (await db.query("SELECT email, reminders, reminders_notice FROM accounts WHERE login = $1", [login])).rows[0];
  return { reminders: row?.email ? row.reminders : null, reminderNotice: Boolean(row?.email && row.reminders_notice) };
}

/** The account has seen the notice, so reminders may start. */
export async function reminderNoticeSeen(db: Db, login: string): Promise<void> {
  await db.query("UPDATE accounts SET reminders_notice = false WHERE login = $1", [login]);
}

export async function setReminders(db: Db, login: string, on: boolean): Promise<void> {
  await db.query("UPDATE accounts SET reminders = $2 WHERE login = $1", [login, on]);
}

/** Looks for anyone due every few minutes, once the sender can reach them. */
export function startReminders(db: Db, content: GameContent, mailer: Mailer, siteUrl: string, prefix: string, now: () => number): void {
  let said = false;
  const tick = async () => {
    try {
      if (await mailer.ready()) {
        const sent = await sendReminders(db, content.reminder, mailer, siteUrl, prefix, now());
        if (sent) console.log(`reminders: sent ${sent}`);
      } else if (!said) {
        said = true;
        console.log("reminders: waiting for SES production access");
      }
    } catch (error) {
      console.warn(`reminders: ${(error as Error).name}`);
    }
  };
  setInterval(tick, EVERY_MS).unref();
  void tick();
}

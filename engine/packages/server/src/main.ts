import { join } from "node:path";
import { buildApi, devClock, devClockInDatabase } from "./api.js";
import { cognitoAuth } from "./auth.js";
import { stripePayments } from "./payments.js";
import { loadContent } from "./content-loader.js";
import { connect, migrate } from "./db.js";

const db = connect();
const ran = await migrate(db);
if (ran.length) console.log(`applied migrations: ${ran.join(", ")}`);
const content = loadContent();
const corsOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:8081").split(",").filter(Boolean);
// LONG_BOIL_OPEN_TRADING=1 lifts the trading gate for local play; the GDD's gate is the default.
const trading = process.env.LONG_BOIL_OPEN_TRADING === "1" ? { level: 0, days: 0 } : undefined;
// With a user pool, every request needs a Cognito token (milestone 11); without one, the dev login.
const { COGNITO_USER_POOL_ID: userPoolId, COGNITO_CLIENT_ID: clientId } = process.env;
if (Boolean(userPoolId) !== Boolean(clientId)) throw new Error("set both COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID, or neither");
// ADMIN_EMAILS: Google accounts that get the dev tools and skip the trading gate, comma-separated.
const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").filter((email) => email.trim());
const auth = userPoolId && clientId ? cognitoAuth({ userPoolId, clientId, adminEmails }) : undefined;
// LONG_BOIL_DEV=1 adds a clock that can be skipped forward, for playing days of the game in an evening.
// Locally it is kept in a file; on a deployed dev server, behind sign-in, in the database, and only admins may skip it.
const dev =
  process.env.LONG_BOIL_DEV !== "1"
    ? undefined
    : auth
      ? await devClockInDatabase(db)
      : devClock(join(import.meta.dirname, "../../../.dev-clock.json"));
// Stripe Checkout for Cog Crates (GDD section 8): both STRIPE_API_KEY and STRIPE_WEBHOOK_SECRET, or neither.
const { STRIPE_API_KEY: apiKey, STRIPE_WEBHOOK_SECRET: webhookSecret } = process.env;
if (Boolean(apiKey) !== Boolean(webhookSecret)) throw new Error("set both STRIPE_API_KEY and STRIPE_WEBHOOK_SECRET, or neither");
const payments = apiKey && webhookSecret ? stripePayments({ apiKey, webhookSecret, allowLive: process.env.STRIPE_ALLOW_LIVE === "1" }) : undefined;
// SITE_URL: where Stripe sends a player back to after paying.
const siteUrl = process.env.SITE_URL || undefined;
// API_PREFIX=/api behind CloudFront, which sends /api/* to the server with the path unchanged.
const prefix = process.env.API_PREFIX || undefined;
const app = buildApi({
  db,
  content,
  corsOrigins,
  ...(trading ? { trading } : {}),
  ...(dev ? { devClock: dev.clock, now: dev.now } : {}),
  ...(auth ? { auth } : {}),
  ...(prefix ? { prefix } : {}),
  ...(payments ? { payments } : {}),
  ...(siteUrl ? { siteUrl } : {}),
});
if (dev) console.log("dev clock on: POST /dev/skip moves time forward");
console.log(payments ? `payments: Stripe Checkout, ${payments.testMode ? "test mode" : "LIVE"}` : "payments: none (crates are not sold for money)");
console.log(auth ? `sign-in: Cognito user pool ${userPoolId}, ${adminEmails.length} admin email(s)` : "sign-in: dev login (trusts any login)");
const port = Number(process.env.PORT ?? 3000);
// HOST=0.0.0.0 in a container; the default keeps a dev server off the network.
const host = process.env.HOST ?? "127.0.0.1";
await app.listen({ port, host });
console.log(`The Long Boil server on http://${host}:${port}${prefix ?? ""} (content ${content.rules.version})`);

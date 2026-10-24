import { join } from "node:path";
import { buildApi, devClock } from "./api.js";
import { loadContent } from "./content-loader.js";
import { connect, migrate } from "./db.js";

const db = connect();
const ran = await migrate(db);
if (ran.length) console.log(`applied migrations: ${ran.join(", ")}`);
const content = loadContent();
const corsOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:8081").split(",").filter(Boolean);
// LONG_BOIL_OPEN_TRADING=1 lifts the trading gate for local play; the GDD's gate is the default.
const trading = process.env.LONG_BOIL_OPEN_TRADING === "1" ? { level: 0, days: 0 } : undefined;
// LONG_BOIL_DEV=1 adds a clock that can be skipped forward, for playing days of the game in an evening.
const dev = process.env.LONG_BOIL_DEV === "1" ? devClock(join(import.meta.dirname, "../../../.dev-clock.json")) : undefined;
const app = buildApi({ db, content, corsOrigins, ...(trading ? { trading } : {}), ...(dev ? { devClock: dev.clock, now: dev.now } : {}) });
if (dev) console.log("dev clock on: POST /dev/skip moves time forward");
const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: "127.0.0.1" });
console.log(`The Long Boil server on http://127.0.0.1:${port} (content ${content.rules.version})`);

import { buildApi } from "./api.js";
import { loadContent } from "./content-loader.js";
import { connect, migrate } from "./db.js";

const db = connect();
const ran = await migrate(db);
if (ran.length) console.log(`applied migrations: ${ran.join(", ")}`);
const content = loadContent();
const corsOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:8081").split(",").filter(Boolean);
// LONG_BOIL_OPEN_TRADING=1 lifts the trading gate for local play; the GDD's gate is the default.
const trading = process.env.LONG_BOIL_OPEN_TRADING === "1" ? { level: 0, days: 0 } : undefined;
const app = buildApi({ db, content, corsOrigins, ...(trading ? { trading } : {}) });
const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: "127.0.0.1" });
console.log(`The Long Boil server on http://127.0.0.1:${port} (content ${content.rules.version})`);

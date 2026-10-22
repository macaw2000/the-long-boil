import { buildApi } from "./api.js";
import { loadContent } from "./content-loader.js";
import { connect, migrate } from "./db.js";

const db = connect();
const ran = await migrate(db);
if (ran.length) console.log(`applied migrations: ${ran.join(", ")}`);
const content = loadContent();
const app = buildApi({ db, content });
const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: "127.0.0.1" });
console.log(`The Long Boil server on http://127.0.0.1:${port} (content ${content.rules.version})`);

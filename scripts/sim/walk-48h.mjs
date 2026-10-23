// The Assayer's 48-hour walk of the first playable slice (GDD section 10's
// "48-hour test"; docs/build-plan.md). It builds the real API in-process with
// an injected clock, against its own database, and plays GDD section 7's
// first session and first two days through the same HTTP routes the client
// calls. It changes no engine code, content or tuning.
//
// Run from the repo root, after `cd engine && npm run build`:
//   createdb long_boil_sim            # once
//   node scripts/sim/walk-48h.mjs     # all three cadences: 2, 3 and 4 check-ins a day
//   node scripts/sim/walk-48h.mjs 3   # one cadence
//   SIM_VERBOSE=1 node scripts/sim/walk-48h.mjs 3   # every check-in, line by line
//
// The database (SIM_DB, default long_boil_sim) is dropped and rebuilt from the
// migrations before each cadence. It refuses long_boil_dev and long_boil_test.
//
// Player policy, fixed and stated (not tuned to any result):
// - First session: prospect 1 copper and smelt it, then tinker 5 Brass
//   Spanners and fight 10 Rust Rat Runts; equip the first spanner; spike
//   Pip's bill; sell the scrap; pay the bill; play every open scene.
// - Story: at every check-in, play every letter, then every open storylet,
//   while Nerve lasts. Take a challenge when its shown odds are 0.5 or better,
//   otherwise the first option that is certain and open.
// - End of the first session: follow Brassbuckle's pointer, about an hour of
//   Scavenging (67 bent nails), then Runts for the rest of the Boiler.
// - Later check-ins split the queue (GDD section 6, the balanced player):
//   slot 1 rotates scavenge, prospect copper, smelt brass, cook barley,
//   tinker brass goods, sized to half the time until the next check-in;
//   slot 2 fights the Rust Rat Runt (the spanner is the only weapon the
//   copper-to-spanner chain makes, so the policy stays on the Runt).
// - Sell everything the collectors buy, up to the weekly cap, keeping one
//   spanner. Surplus rat scrap goes to the Exchange once it is open.
// - A second account, Bea, scavenges nails, sells them, and buys scrap on the
//   Exchange, so an order can fill.

import { buildApi } from "../../engine/packages/server/dist/api.js";
import { loadContent } from "../../engine/packages/server/dist/content-loader.js";
import { connect, migrate } from "../../engine/packages/server/dist/db.js";
import { totalLevel } from "../../engine/packages/rules/dist/index.js";

const DB_NAME = process.env.SIM_DB ?? "long_boil_sim";
if (["long_boil_dev", "long_boil_test"].includes(DB_NAME)) throw new Error(`refusing to use ${DB_NAME}`);
const VERBOSE = process.env.SIM_VERBOSE === "1";

const MIN = 60_000;
const HOUR = 60 * MIN;
// Thursday 22 October 2026, 18:00 UTC: an evening first session; the collectors' week (Monday UTC) does not turn inside 48 hours.
const T0 = Date.UTC(2026, 9, 22, 18, 0, 0);

const SCHEDULES = {
  // Hours after the first session's start. Day 0 is Thursday evening.
  2: [13, 25, 37, 48], // Fri 07:00, 19:00; Sat 07:00, 18:00
  3: [13, 18.5, 28, 37, 42.5, 48], // Fri 07:00, 12:30, 22:00; Sat 07:00, 12:30, 18:00
  4: [4, 13, 18, 23, 28, 37, 42, 48], // Thu 22:00; Fri 07, 12, 17, 22; Sat 07, 12, 18
};

const A = (s) => `action.rustmoor.${s}`;
const I = (s) => `item.rustmoor.${s}`;
const RUNT = "monster.rustmoor.rust_rat_runt";
const SPANNER = I("brass_spanner");
const SCRAP = I("rat_scrap");

const content = loadContent();
const curve = content.rules;

function log(...args) {
  if (VERBOSE) console.log(...args);
}
const hhmm = (t) => new Date(t).toISOString().slice(5, 16).replace("T", " ");
const offH = (t) => ((t - T0) / HOUR).toFixed(2);

async function runCadence(perDay) {
  const db = connect(DB_NAME);
  await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(db);
  let clock = T0;
  const now = () => clock;
  const app = buildApi({ db, content, now, trading: { level: 0, days: 0 } }); // gate lifted, as LONG_BOIL_OPEN_TRADING=1
  const gated = buildApi({ db, content, now }); // the GDD's gate

  const call = async (method, url, payload, via = app) => {
    const r = await via.inject({ method, url, ...(payload ? { payload } : {}) });
    return { status: r.statusCode, body: r.json() };
  };
  const ok = async (method, url, payload, via) => {
    const r = await call(method, url, payload, via);
    if (r.status >= 300) throw new Error(`${method} ${url} ${JSON.stringify(payload)} -> ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };

  const economy = (await ok("GET", "/content")).economy;
  const actions = new Map((await ok("GET", "/content")).actions.map((a) => [a.id, a]));

  const notes = []; // the walk, in player terms
  const note = (s) => {
    notes.push(`[${hhmm(clock)} +${offH(clock)}h] ${s}`);
    log(notes.at(-1));
  };
  const nerveLog = []; // { at, before, after, spent }
  const scenesPlayed = [];
  let nerveSpent = 0;

  const held = (tinker, item) => tinker.inventory.filter((s) => s.item === item).reduce((n, s) => n + s.qty, 0);
  const heldUnbound = (tinker, item) => tinker.inventory.filter((s) => s.item === item && !s.bound).reduce((n, s) => n + s.qty, 0);
  const level = (tinker, skill) => tinker.skills.find((s) => s.skill === skill)?.level ?? 1;
  const ledgerLine = (outcome) => {
    const l = outcome.ledger;
    const parts = l.lines.map((line) => `${line.id.split(".").pop()} x${line.count}`);
    if (l.crowns) parts.push(`${l.crowns} Crowns from fights`);
    if (l.levelUps.length) parts.push(`levels: ${l.levelUps.map((u) => `${u.skill} ${u.level}`).join(", ")}`);
    if (l.stalls.length) parts.push(`STALLS: ${JSON.stringify(l.stalls)}`);
    if (l.boilerDryAt) parts.push(`Boiler ran dry at ${hhmm(l.boilerDryAt)}`);
    for (const t of outcome.trades) parts.push(`Exchange: ${t.kind} ${t.qty} ${t.item.split(".").pop()} at ${t.price}${t.tax ? `, tax ${t.tax}` : ""}`);
    for (const s of outcome.story) parts.push(`story: ${s.type} ${s.letter ?? s.needle ?? ""}${s.value !== undefined ? ` -> ${s.value}` : ""}`);
    return parts.join("; ") || "nothing";
  };

  // Plays the story the way the stated policy does, while Nerve lasts.
  async function playStory(id) {
    let view = (await ok("GET", `/tinkers/${id}/story`)).view;
    const before = view.nerve;
    for (;;) {
      const scene = view.letters[0] ? { ...view.letters[0], kind: "letter" } : view.storylets[0] ? { ...view.storylets[0], kind: "storylet" } : null;
      if (!scene || view.nerve < scene.nerve) break;
      let choice = scene.options.findIndex((o) => o.available && o.challenge && o.challenge.odds >= 0.5);
      if (choice < 0) choice = scene.options.findIndex((o) => o.available && !o.challenge);
      if (choice < 0) choice = 0;
      const opt = scene.options[choice];
      const r = await call("POST", `/tinkers/${id}/story`, { kind: scene.kind, scene: scene.id, option: choice });
      if (r.status !== 200) {
        note(`story refused ${scene.id} option ${choice}: ${r.body.error}`);
        break;
      }
      nerveSpent += scene.nerve;
      const p = r.body.played;
      scenesPlayed.push({ at: clock, scene: scene.id, option: choice, success: p.success, odds: p.odds });
      note(
        `played ${scene.id} option ${choice} "${opt.label.slice(0, 60)}"${p.odds !== null ? ` at ${Math.round(p.odds * 100)}%` : ""}: ${p.success ? "success" : "FAILED"}; Nerve ${r.body.view.nerve}; needles ${JSON.stringify(Object.fromEntries(Object.entries(r.body.view.needles).filter(([, v]) => v)))}`,
      );
      view = r.body.view;
    }
    const open = view.storylets.map((s) => s.id);
    nerveLog.push({ at: clock, before, after: view.nerve, open, letters: view.letters.length, qualities: view.qualities });
    return view;
  }

  async function sellToCollectors(id, keep = {}) {
    const market = await ok("GET", `/tinkers/${id}/market`);
    let tinker = (await ok("GET", `/tinkers/${id}`)).tinker;
    let earned = 0;
    for (const [item, left] of Object.entries(market.collectorLeft)) {
      const qty = Math.min(left, heldUnbound(tinker, item) - (keep[item] ?? 0));
      if (qty <= 0) continue;
      const r = await ok("POST", `/tinkers/${id}/collector`, { item, qty });
      earned += qty * economy[item].collectorPrice;
      tinker = r.tinker;
    }
    return { earned, tinker };
  }

  const best = (prefix, skillLevel) =>
    [...actions.values()].filter((a) => a.id.startsWith(prefix) && a.level_required <= skillLevel && a.inputs.length === 0).sort((a, b) => b.level_required - a.level_required)[0];

  // ---------- the first session ----------
  const main = (await ok("POST", "/tinkers", { login: "ada@example.com", name: "Ada" })).tinker.id;
  const bea = (await ok("POST", "/tinkers", { login: "bea@example.com", name: "Bea" })).tinker.id;
  await ok("PUT", `/tinkers/${bea}/queue`, { queue: [{ actionId: A("scavenge_bent_nails"), remaining: 10_000 }] });

  let out = await ok("POST", `/tinkers/${main}/check-in`);
  note(`signed in; Boiler steam until ${hhmm(Date.parse(out.tinker.steamUntil))}; held ${out.tinker.inventory.map((s) => `${s.qty} ${s.item.split(".").pop()}${s.bound ? " (bound)" : ""}`).join(", ")}; ${out.tinker.crowns} Crowns; Nerve ${out.tinker.story.nerve}; ${ledgerLine(out)}`);

  await ok("PUT", `/tinkers/${main}/queue`, { queue: [{ actionId: A("prospect_copper"), remaining: 1 }, { actionId: A("smelt_brass_ingot"), remaining: 1 }] });
  note("queued: prospect 1 copper, then smelt 1 Brass Ingot");
  clock += 2 * MIN;
  out = await ok("GET", `/tinkers/${main}`);
  note(`looked: ${ledgerLine(out)}; Brass Ingots ${held(out.tinker, I("brass_ingot"))}`);

  await ok("PUT", `/tinkers/${main}/queue`, { queue: [{ actionId: A("tinker_brass_spanner"), remaining: 5 }, { actionId: RUNT, remaining: 10 }] });
  note("queued: tinker 5 Brass Spanners, then fight 10 Rust Rat Runts");
  clock += 1 * MIN;
  out = await ok("GET", `/tinkers/${main}`);
  const eq = await call("PUT", `/tinkers/${main}/weapon`, { item: SPANNER });
  note(`first spanner landed (${held(out.tinker, SPANNER)} held); equip spanner -> ${eq.status}${eq.status !== 200 ? " " + eq.body.error : ""}`);

  // Pip's letter, then the rest of the session's story before the fight finishes.
  await playStory(main);

  clock += 14 * MIN;
  out = await ok("GET", `/tinkers/${main}`);
  note(`looked after the fight: ${ledgerLine(out)}; ${out.tinker.crowns} Crowns`);
  const firstGate = await call("POST", `/tinkers/${main}/orders`, { item: SCRAP, side: "sell", price: 3, qty: 1 }, gated);
  note(`Exchange under the GDD's gate: ${firstGate.status} "${firstGate.body.error}"`);
  const sold = await sellToCollectors(main, { [SPANNER]: 1 });
  note(`sold at the Counting-House window for ${sold.earned} Crowns; now ${sold.tinker.crowns}`);
  const rent = await call("POST", `/tinkers/${main}/rent`);
  note(`paid Pip's bill: ${rent.status === 200 ? `ok, ${rent.body.tinker.crowns} Crowns left, back rent ${rent.body.view.backRent}` : rent.body.error}`);
  await playStory(main);

  clock += 3 * MIN; // about 20 minutes in
  const scav = A("scavenge_bent_nails");
  await ok("PUT", `/tinkers/${main}/queue`, { queue: [{ actionId: scav, remaining: 67 }, { actionId: RUNT, remaining: 10_000 }] });
  const session1End = clock;
  note("queued for the night: 67 bent nails (about an hour, Brassbuckle's pointer), then Runts until the Boiler runs dry");

  // ---------- the check-ins ----------
  const rotation = ["scavenge", "prospect", "smelt", "cook", "tinker"];
  let rot = 0;
  let exchangeOrder = null;
  let lastGate = null;
  const offsets = SCHEDULES[perDay];
  for (const [k, h] of offsets.entries()) {
    clock = T0 + h * HOUR;
    out = await ok("POST", `/tinkers/${main}/check-in`);
    note(`CHECK-IN ${k + 1}: ${ledgerLine(out)}; ${out.tinker.crowns} Crowns; total level ${(await ok("GET", `/tinkers/${main}/market`, undefined, gated)).totalLevel}`);

    const g = await ok("GET", `/tinkers/${main}/market`, undefined, gated);
    if (g.refusal !== lastGate) note(`the GDD's gate now says: ${g.refusal ?? "trading open"}`);
    lastGate = g.refusal;
    const s = await sellToCollectors(main, { [SPANNER]: 1 });
    if (s.earned) note(`sold to the collectors for ${s.earned} Crowns`);
    const owed = (await ok("GET", `/tinkers/${main}`)).tinker.story.backRent;
    if (owed) {
      const r = await call("POST", `/tinkers/${main}/rent`);
      note(`back rent: ${r.status === 200 ? "paid" : r.body.error}`);
    }
    await playStory(main);

    // The Exchange, at the first check-in of the morning after.
    if (!exchangeOrder && h >= 13) {
      const surplus = heldUnbound((await ok("GET", `/tinkers/${main}`)).tinker, SCRAP);
      if (surplus > 0) {
        const qty = Math.min(surplus, 100);
        const placed = await ok("POST", `/tinkers/${main}/orders`, { item: SCRAP, side: "sell", price: 3, qty });
        exchangeOrder = (await ok("GET", `/tinkers/${main}/market`)).orders[0];
        note(`Exchange: listed ${qty} surplus rat scrap at 3 Crowns (collectors are capped); order ${exchangeOrder?.id}, ${placed.tinker.crowns} Crowns`);
        await ok("POST", `/tinkers/${bea}/check-in`);
        const beaSold = await sellToCollectors(bea);
        const buy = await call("POST", `/tinkers/${bea}/orders`, { item: SCRAP, side: "buy", price: 3, qty: 50 });
        note(`Bea (another account) sold nails for ${beaSold.earned} and bid 3 for 50 rat scrap -> ${buy.status}; filled ${buy.body.trades?.filter((t) => t.kind === "bought").reduce((n, t) => n + t.qty, 0) ?? 0}`);
        const book = await ok("GET", `/exchange/${SCRAP}`);
        note(`rat scrap book now: asks ${JSON.stringify(book.asks)}, bids ${JSON.stringify(book.bids)}`);
      }
    }

    if (k === offsets.length - 1) break; // the 48-hour mark: measure, do not requeue
    const interval = Math.min((offsets[k + 1] - h) * HOUR, 12 * HOUR);
    const half = interval / 2 / 1000;
    const looked = await ok("GET", `/tinkers/${main}`);
    for (const t of looked.trades) note(`the Workshop screen collects an Exchange fill: ${t.kind} ${t.qty} ${t.item.split(".").pop()} at ${t.price}, tax ${t.tax}`);
    let tinker = looked.tinker;
    let slot = null;
    for (let tries = 0; tries < rotation.length && !slot; tries++) {
      const kind = rotation[rot++ % rotation.length];
      if (kind === "scavenge") {
        const a = best("action.rustmoor.scavenge_", level(tinker, "scavenging"));
        slot = { actionId: a.id, remaining: Math.max(1, Math.floor(half / a.seconds)) };
      } else if (kind === "prospect") {
        slot = { actionId: A("prospect_copper"), remaining: Math.max(1, Math.floor(half / 54)) };
      } else if (kind === "smelt") {
        const copper = held(tinker, I("copper"));
        if (copper > 0) slot = { actionId: A("smelt_brass_ingot"), remaining: Math.min(copper, Math.floor(half / 54)) };
      } else if (kind === "cook") {
        const want = Math.min(Math.floor(half / 54), Math.floor(tinker.crowns / 2 / 2)); // spends at most half the purse
        if (want > 0) {
          tinker = (await ok("POST", `/tinkers/${main}/grocer`, { item: I("barley_meal"), qty: want })).tinker;
          note(`bought ${want} Barley Meal at the grocer for ${want * economy[I("barley_meal")].grocerPrice} Crowns`);
          slot = { actionId: A("cook_barley_rations"), remaining: want };
        }
      } else if (kind === "tinker") {
        const ingots = held(tinker, I("brass_ingot"));
        const id = level(tinker, "tinkering") >= 5 ? A("tinker_brass_key") : A("tinker_brass_spanner");
        const secs = actions.get(id).seconds;
        if (ingots > 0) slot = { actionId: id, remaining: Math.min(ingots, Math.max(1, Math.floor(half / secs))) };
      }
    }
    await ok("PUT", `/tinkers/${main}/queue`, { queue: [slot, { actionId: RUNT, remaining: 10_000 }] });
    note(`queued ${slot.remaining} x ${slot.actionId.split(".").pop()}, then Runts`);
  }

  // ---------- measurements ----------
  const end = (await ok("GET", `/tinkers/${main}`)).tinker;
  const gate = await ok("GET", `/tinkers/${main}/market`, undefined, gated);
  note(`48 hours: total level ${gate.totalLevel}; under the GDD's gate the Exchange says: ${gate.refusal ?? "open"}`);

  const ev = (await db.query("SELECT type, at, payload FROM events WHERE tinker_id = $1 ORDER BY seq", [main])).rows;
  const sum = (types, f) => ev.filter((e) => types.includes(e.type)).reduce((n, e) => n + f(e.payload), 0);
  const crowns = {
    kills: sum(["monster_killed", "boss_attempted"], (p) => p.crowns ?? 0),
    collectors: sum(["collector_sold"], (p) => p.crowns),
    rent: -sum(["back_rent_paid"], (p) => p.crowns),
    grocer: -sum(["grocer_bought"], (p) => p.crowns),
    exchangeTax: sum(["exchange_filled"], (p) => p.tax ?? 0) + 0,
    exchangeIn: sum(["exchange_collected"], (p) => p.crowns) + sum(["exchange_filled"], (p) => p.crowns ?? 0),
    escrowOut: -sum(["exchange_order_placed"], (p) => p.crowns ?? 0),
    end: end.crowns,
  };
  // Tax on a resting sell order is charged when the maker collects; read it from the fills table.
  crowns.exchangeTax = Number((await db.query("SELECT coalesce(sum(tax),0) AS t FROM exchange_fills WHERE seller_id = $1", [main])).rows[0].t);

  const scavUps = ev.filter((e) => e.type === "level_up" && e.payload.skill === "scavenging").map((e) => ({ level: e.payload.level, at: new Date(e.at).getTime() }));
  // Total level at each level-up, by the engine's own totalLevel over XP rebuilt from the log.
  let pass50 = null;
  {
    const xp = {};
    for (const e of ev) {
      const p = e.payload;
      if (e.type === "action_completed") xp[p.skill] = (xp[p.skill] ?? 0) + p.xp;
      if (e.type === "monster_killed" || e.type === "boss_attempted") for (const [k, v] of Object.entries(p.xp ?? {})) xp[k] = (xp[k] ?? 0) + v;
      if (e.type === "level_up" && !pass50 && totalLevel(xp, content.rules) >= 50) pass50 = { at: new Date(e.at).getTime() };
    }
  }


  // Nerve: how many hours it sat full between check-ins (refill that was lost).
  let fullHours = 0;
  for (let i = 0; i < nerveLog.length; i++) {
    const cur = nerveLog[i];
    const nextAt = i + 1 < nerveLog.length ? nerveLog[i + 1].at : T0 + 48 * HOUR;
    const toFull = (10 - cur.after) * 36 * MIN;
    fullHours += Math.max(0, nextAt - cur.at - toFull) / HOUR;
  }
  const lastScene = scenesPlayed.at(-1);
  const last = nerveLog.at(-1);

  await app.close();
  await gated.close();
  await db.end();
  return {
    perDay,
    checkIns: offsets.length + 1,
    notes,
    nerveSpent,
    scenes: scenesPlayed,
    lastSceneAt: lastScene ? offH(lastScene.at) : null,
    fullHours,
    nerveEnd: last.after,
    openAtEnd: last.open,
    qualitiesEnd: last.qualities,
    crowns,
    scavUps: scavUps.map((u) => ({ level: u.level, hoursAfterStart: offH(u.at), minutesAfterQueue: ((u.at - session1End) / MIN).toFixed(0) })),
    totalLevelEnd: gate.totalLevel,
    pass50At: pass50 ? offH(pass50.at) : null,
    gateEnd: gate.refusal,
    firstGate: firstGate.body.error,
    skillsEnd: Object.fromEntries(end.skills.map((s) => [s.skill, s.level])),
  };
}

const wanted = process.argv.slice(2).length ? process.argv.slice(2).map(Number) : [2, 3, 4];
const results = [];
for (const perDay of wanted) results.push(await runCadence(perDay));

for (const r of results) {
  console.log(`\n=============== ${r.perDay} check-ins a day (${r.checkIns} sittings incl. the first session) ===============`);
  for (const n of r.notes) console.log(n);
  console.log("\n-- story pace (measured)");
  console.log(`Nerve spent ${r.nerveSpent} on ${r.scenes.length} scenes; last scene at +${r.lastSceneAt}h; Nerve at 48h ${r.nerveEnd}/10; Nerve sat full ${r.fullHours.toFixed(1)} of 48 hours; open at 48h: ${JSON.stringify(r.openAtEnd)}`);
  console.log(`qualities at 48h: ${JSON.stringify(r.qualitiesEnd)}`);
  console.log("-- Crowns (measured)");
  const c = r.crowns;
  const faucets = c.kills + c.collectors;
  const sinks = c.rent + c.grocer + c.exchangeTax;
  console.log(`faucets: kills ${c.kills}, collectors ${c.collectors} = ${faucets}; sinks: rent ${c.rent}, grocer ${c.grocer}, Exchange tax ${c.exchangeTax} = ${sinks} (${((100 * sinks) / faucets).toFixed(1)}% of faucets); end purse ${c.end}`);
  console.log("-- Scavenging (measured)");
  console.log(JSON.stringify(r.scavUps));
  console.log(`-- total level at 48h ${r.totalLevelEnd}; passed 50 at ${r.pass50At ? `+${r.pass50At}h` : "never"}; GDD gate at 48h: ${r.gateEnd ?? "open"}; first-session gate: ${r.firstGate}`);
  console.log(`skills at 48h: ${JSON.stringify(r.skillsEnd)}`);
}

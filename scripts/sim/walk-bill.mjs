// The Assayer's bill walk (25 November 2026): Pip's bill under decision 39's
// bar that opens by play (docs/first-day-plan.md). Plays a new Tinker through
// the same HTTP routes the client calls, in-process with an injected clock and
// its own database, following the goal bar's NEXT line. It changes no engine
// code, content or tuning.
//
// Run from the repo root, after `cd engine && npm run build`:
//   createdb long_boil_sim_bill     # once
//   node scripts/sim/walk-bill.mjs  # the whole matrix
//   SIM_VERBOSE=1 node scripts/sim/walk-bill.mjs hour:nails:few:best   # one run, line by line
//
// The goal bar is engine/packages/client/src/Guide.tsx nextGoal, revealed and
// unseenPlaces at b646adb, copied below (the client imports react-native). The
// guide's first-sitting steps are copied from scripts/sim/walk-act1.mjs.
//
// Player policy, fixed and stated:
// - Sitting 1 follows the guide as walk-act1 does (5 spanners, who_you_are, the
//   first spanner, rats_in_the_workshop, equip, 10 Runts, the_first_haul at three
//   rats, Fill on Rust Rat Runt). "ten" leaves the moment Fill is pressed; "hour"
//   stays until 60 minutes after sign-in.
// - While present, the player looks every minute (the client looks every 5 s;
//   at 54 s a go a minute never holds more than 8 jobs) and acts once a minute on
//   the goal bar's line:
//   * pay a debt the line says is covered; read every letter and play every open
//     Prologue scene while Nerve lasts (a challenge at 50% or better, else the first
//     certain open option; Pip's bill takes option SIM_BILL: 0, or "best" = the
//     80-off repair when it is open);
//   * at the Exchange, for any reason, press Sell on every collector row at the
//     row's default count (min(held, the week's room left));
//   * the first-armour line: Start Silk Hand-Wraps x1 (the client's default for a
//     first piece), then wear them;
//   * a newly opened place: go there (marks it seen). Only the Exchange, Tailoring
//     and, on the nails route, Scavenging are acted on; at Scavenging the nails route
//     presses Start on Bent Nails at the default count (about an hour: 66);
//   * "Start a job you have not tried yet" (progress 40): nails route, Bent Nails x66;
//     otherwise Copper x66 (Start now, as the button the line leads to);
//   * "Start a fight": Start Rust Rat Runt at Fill;
//   * "Queue more" or an idle bench: Fill on Rust Rat Runt;
//   * low Rations (once per sitting): sell at the window, buy 66 Barley Meal (132
//     Crowns), Start Barley Rations x66;
//   * a line with no button (sale_done) or nothing to do: wait.
// - Later sittings last SIM_LATER_MIN minutes (default 15 for "hour", 10 for "ten").

import { buildApi } from "../../engine/packages/server/dist/api.js";
import { loadContent } from "../../engine/packages/server/dist/content-loader.js";
import { connect, migrate } from "../../engine/packages/server/dist/db.js";

const DB_NAME = process.env.SIM_DB ?? "long_boil_sim_bill";
if (["long_boil_dev", "long_boil_test"].includes(DB_NAME)) throw new Error(`refusing to use ${DB_NAME}`);
const VERBOSE = process.env.SIM_VERBOSE === "1";

const MIN = 60_000;
const HOUR = 60 * MIN;
// Tuesday 24 November 2026, UTC: the collectors' week (from Monday) does not turn inside these walks.
const DAY0 = Date.UTC(2026, 10, 24, 0, 0, 0);

const A = (s) => `action.rustmoor.${s}`;
const I = (s) => `item.rustmoor.${s}`;
const RUNT = "monster.rustmoor.rust_rat_runt";
const SCRAP = I("rat_scrap");
const NAILS = I("bent_nails");
const SILK = I("umbrella_silk");
const WRAPS = I("silk_hand_wraps");
const RATION = I("rustmoor_ration");
const FIGHT = "fight";

// ---- copied from Guide.tsx at b646adb ----
const BILL_ANSWERED = 10;
const PLATE_FROM = 70;
const LOW_RATIONS = 150;
const WRAPS_SILK = 10;
const GUIDE_OPENS = { "skill:tinkering": 1, stores: 1, story: 1, nerve: 1, loadout: 1, [`skill:${FIGHT}`]: 1, crowns: 1, guild: 1 };
const LATER_OPENS = { exchange: 10, "skill:tailoring": 10, "skill:prospecting": 40, "skill:smithing": 40, "skill:cooking": 40, "skill:scavenging": 40 };
const JOBS_OPEN = { exchange: 10, "skill:tailoring": 18, "skill:prospecting": 26, "skill:smithing": 34, "skill:cooking": 42, "skill:scavenging": 50 };
const OPENING_ORDER = ["story", `skill:${FIGHT}`, "guild", "exchange", "skill:tailoring", "skill:prospecting", "skill:smithing", "skill:cooking", "skill:scavenging", "chat", "shop"];
const OPENED_LINES = { exchange: "opened_exchange", "skill:prospecting": "opened_prospecting", "skill:smithing": "opened_smithing", "skill:cooking": "opened_cooking", "skill:scavenging": "opened_scavenging", guild: "opened_guild", shop: "cogs" };
const BETWEEN = { 40: "skill:scavenging", 50: `skill:${FIGHT}` };

const content = loadContent();
const R = content.rules;
const secsOf = (id) => R.actions.get(id)?.seconds ?? R.monsters.get(id)?.seconds_per_kill ?? 60;

const held = (t, item) => t.inventory.filter((s) => s.item === item).reduce((n, s) => n + s.qty, 0);
const heldUnbound = (t, item) => t.inventory.filter((s) => s.item === item && !s.bound).reduce((n, s) => n + s.qty, 0);
const progressOf = (t) => t.story.qualities["prologue.progress"] ?? 0;

function revealedAfterGuide(t) {
  const progress = progressOf(t);
  if ((t.story.qualities["record.visits_since_prologue"] ?? 0) >= 1) return () => true;
  return (f) => GUIDE_OPENS[f] !== undefined || (LATER_OPENS[f] !== undefined && progress >= LATER_OPENS[f]) || (JOBS_OPEN[f] !== undefined && t.jobsDone >= JOBS_OPEN[f]);
}

function queuedMs(t) {
  return t.queue.reduce((ms, e) => ms + e.remaining * secsOf(e.actionId) * 1000, 0);
}

// Returns { id, place } where id names the line (the sim acts on ids, not words).
function nextGoal(t, now, guide, saleLeft, unseen, cooking) {
  const steamLeft = new Date(t.steamUntil).getTime() - now;
  const debt = t.story.debts.find((d) => t.crowns >= d.crowns);
  if (debt) return { id: "pay", place: "exchange" };
  if (t.story.letters > 0) return { id: "letter", place: "story" };
  if (t.queue.length === 0) return { id: "idle", place: "skill:tinkering" };
  if (steamLeft <= 0) return { id: "dry", place: "skill:tinkering" };
  const progress = progressOf(t);
  const fightingAlready = progress === 50 && t.queue[0]?.actionId.startsWith("monster.");
  if (progress in BETWEEN && !fightingAlready && !guide.acked.includes(`acted:${progress}`)) return { id: `between:${progress}`, place: BETWEEN[progress] };
  if (t.story.openScenes > 0 && t.story.nerve > 0) return { id: "scenes", place: "story" };
  if (Object.keys(t.worn).length === 0 && held(t, WRAPS) > 0) return { id: "wear_wraps", place: "stores" };
  if (progress >= BILL_ANSWERED && Object.keys(t.worn).length === 0) return { id: "first_armour", place: held(t, SILK) >= WRAPS_SILK ? "skill:tailoring" : `skill:${FIGHT}` };
  if (queuedMs(t) + HOUR < steamLeft) return { id: "queue_more", place: null };
  if (cooking && held(t, RATION) < LOW_RATIONS) return { id: "rations", place: "exchange" };
  const unpaid = t.story.debts[0];
  if (unpaid && saleLeft !== 0) return { id: "pay_bill", place: "exchange" };
  const afterPrologue = (t.story.qualities["record.visits_since_prologue"] ?? 0) >= 1;
  const hasLine = (c) => (c === "skill:tailoring" ? Object.keys(t.worn).length === 0 : c in OPENED_LINES && (c !== "shop" || afterPrologue));
  const newest = [...unseen].reverse().find(hasLine);
  if (newest === "skill:tailoring") return { id: "first_armour", place: held(t, SILK) >= WRAPS_SILK ? "skill:tailoring" : `skill:${FIGHT}` };
  if (newest) return { id: `opened:${newest}`, place: newest };
  if (unpaid) return { id: saleLeft === 0 ? "sale_done" : "pay_bill", place: saleLeft === 0 ? null : "exchange" };
  return null;
}
// ---- end of the copy ----

function startFirst(queue, entry, slots = 2) {
  const queued = queue.find((job, i) => i > 0 && job.actionId === entry.actionId);
  const first = queued && queued.remaining > entry.remaining ? queued : entry;
  const rest = queue.filter((job) => job.actionId !== entry.actionId);
  const kept = [...rest].sort((a, b) => b.remaining * secsOf(b.actionId) - a.remaining * secsOf(a.actionId)).slice(0, slots - 1);
  return [first, ...rest.filter((job) => kept.includes(job))];
}

const SCHEDULES = {
  // Hours of day 0 (sitting 1 at the first), then later sittings; >24 is the next day.
  few: [9, 13, 17, 32, 36, 40],
  six: [9, 16, 22, 32, 38, 44],
  evening: [19, 31, 36, 43, 55, 60],
};

async function walk({ player, nails, sched, bill, stress = false, seed = 1 }) {
  const label = `${player}:${nails ? "nails" : "none"}:${sched}:${bill}${stress ? ":stress" : ""}#${seed}`;
  const db = connect(DB_NAME);
  await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(db);
  const hours = SCHEDULES[sched];
  const T0 = DAY0 + hours[0] * HOUR;
  let clock = T0;
  const app = buildApi({ db, content, now: () => clock });
  const call = async (method, url, payload) => {
    const r = await app.inject({ method, url, ...(payload ? { payload } : {}) });
    return { status: r.statusCode, body: r.json() };
  };
  const ok = async (method, url, payload) => {
    const r = await call(method, url, payload);
    if (r.status >= 300) throw new Error(`${label} ${method} ${url} ${JSON.stringify(payload)} -> ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };
  const economy = (await ok("GET", "/content")).economy;
  const hm = () => `S${sitting} +${((clock - T0) / HOUR).toFixed(2)}h`;
  const log = (s) => {
    trail.push(`[${hm()}] ${s}`);
    if (VERBOSE) console.log(trail.at(-1));
  };
  const trail = [];
  let sitting = 1;
  const out = { label, sittings: [], billPaid: null, letter: null, crownsIn: { kills: 0, scrap: 0, nails: 0, other: 0 }, grocer: 0, s1: {} };

  // Each Tinker id seeds its own luck (as walk-act1's SIM_TINKER_ID): seed n makes n-1 spare Tinkers first.
  for (let i = 1; i < seed; i++) await ok("POST", "/tinkers", { login: `spare${i}@example.com`, name: `Spare ${i}` });
  const id = (await ok("POST", "/tinkers", { login: "ada@example.com", name: "Ada" })).tinker.id;
  const get = async () => (await ok("GET", `/tinkers/${id}`)).tinker;
  const setQ = async (queue) => (await ok("PUT", `/tinkers/${id}/queue`, { queue })).tinker;
  const fillCount = async () => {
    const f = (await ok("GET", `/tinkers/${id}/fights`)).fights.find((x) => x.monsterId === RUNT);
    return Math.max(1, Math.floor((12 * 3600) / (f?.ready ? f.seconds : secsOf(RUNT))));
  };
  const guide = { acked: [], seen: ["skill:tinkering", "story", `skill:${FIGHT}`, "stores"], ratedThisSitting: false };

  async function playStory() {
    for (let guard = 0; guard < 20; guard++) {
      const view = (await ok("GET", `/tinkers/${id}/story`)).view;
      const letter = view.letters.find((l) => l.nerve <= view.nerve);
      const spine = view.storylets.find((s) => s.id.startsWith("prologue.") && s.nerve <= view.nerve);
      const scene = letter ? { ...letter, kind: "letter" } : spine ? { ...spine, kind: "storylet" } : null;
      if (!scene) return;
      let choice;
      if (scene.id === "prologue.sprocket_row.back_rent") {
        const t = await get();
        const repairOpen = scene.options[1]?.available === true;
        out.letter = { at: hm(), scrapHeld: held(t, SCRAP), repairOpen, crowns: t.crowns };
        choice = bill === "best" && repairOpen ? 1 : 0;
      } else {
        choice = scene.options.findIndex((o) => o.available && o.challenge && o.challenge.odds >= 0.5);
        if (choice < 0) choice = scene.options.findIndex((o) => o.available && !o.challenge);
        if (choice < 0) choice = scene.options.findIndex((o) => o.available);
      }
      const r = await call("POST", `/tinkers/${id}/story`, { kind: scene.kind, scene: scene.id, option: choice });
      if (r.status !== 200) {
        log(`story refused ${scene.id}: ${r.body.error}`);
        if (scene.kind === "letter") await ok("DELETE", `/tinkers/${id}/letters/${scene.id}`);
        return;
      }
      log(`played ${scene.id.split(".").pop()} #${choice}`);
    }
  }

  async function sellAll() {
    const market = await ok("GET", `/tinkers/${id}/market`);
    let t = await get();
    const sold = [];
    for (const [item, left] of Object.entries(market.collectorLeft)) {
      const qty = Math.min(left, heldUnbound(t, item));
      if (qty <= 0) continue;
      t = (await ok("POST", `/tinkers/${id}/collector`, { item, qty })).tinker;
      const crowns = qty * economy[item].collectorPrice;
      if (item === SCRAP) out.crownsIn.scrap += crowns;
      else if (item === NAILS) out.crownsIn.nails += crowns;
      else out.crownsIn.other += crowns;
      sold.push(`${qty} ${item.split(".").pop()}`);
    }
    if (sold.length) log(`sold ${sold.join(", ")}; ${t.crowns} Crowns`);
    return t;
  }

  const saleLeftOf = async (t) => (t.story.debts.length ? ((await ok("GET", `/tinkers/${id}/market`)).collectorLeft[SCRAP] ?? null) : null);

  // One minute of a present player acting on the goal bar.
  async function act() {
    let t = await get();
    const opened = revealedAfterGuide(t);
    const unseen = OPENING_ORDER.filter((c) => opened(c) && !guide.seen.includes(c));
    const goal = nextGoal(t, clock, guide, await saleLeftOf(t), unseen, opened("skill:cooking"));
    if (!goal) return "none";
    if (goal.place && !guide.seen.includes(goal.place)) guide.seen.push(goal.place);
    if (goal.id.startsWith("opened:skill:scavenging")) out.scavLine = { at: hm(), unpaid: t.story.debts.length > 0 };
    switch (true) {
      case goal.id === "pay": {
        const debt = t.story.debts.find((d) => t.crowns >= d.crowns);
        await ok("POST", `/tinkers/${id}/debts/${debt.id}`);
        if (debt.id === "back_rent") out.billPaid = { at: hm(), owed: debt.crowns };
        log(`paid ${debt.id} ${debt.crowns}`);
        return goal.id;
      }
      case goal.id === "letter" || goal.id === "scenes":
        await playStory();
        return goal.id;
      case goal.id === "idle" || goal.id === "queue_more" || goal.id === "dry": {
        await setQ(startFirst(t.queue, { actionId: RUNT, remaining: await fillCount() }));
        log(`${goal.id}: Fill on Runts`);
        return goal.id;
      }
      case goal.id.startsWith("between:"): {
        const p = Number(goal.id.split(":")[1]);
        const entry = p === 50 ? { actionId: RUNT, remaining: await fillCount() } : nails ? { actionId: A("scavenge_bent_nails"), remaining: 66 } : { actionId: A("prospect_copper"), remaining: 66 };
        await setQ(startFirst(t.queue, entry));
        guide.acked.push(`acted:${p}`);
        log(`between scenes at ${p}: Start ${entry.actionId.split(".").pop()} x${entry.remaining}`);
        return goal.id;
      }
      case goal.id === "wear_wraps":
        await ok("PUT", `/tinkers/${id}/gear`, { item: WRAPS });
        log("wore wraps");
        return goal.id;
      case goal.id === "first_armour": {
        if (held(t, SILK) >= WRAPS_SILK && !t.queue.some((e) => e.actionId === A("tailor_silk_hand_wraps"))) {
          await setQ(startFirst(t.queue, { actionId: A("tailor_silk_hand_wraps"), remaining: 1 }));
          log("Start wraps x1");
        }
        return goal.id;
      }
      case goal.id === "rations": {
        if (guide.ratedThisSitting) return "wait";
        guide.ratedThisSitting = true;
        t = await sellAll();
        const r = await ok("POST", `/tinkers/${id}/grocer`, { item: I("barley_meal"), qty: 66 });
        out.grocer += 132;
        await setQ(startFirst(r.tinker.queue, { actionId: A("cook_barley_rations"), remaining: 66 }));
        log(`low Rations: bought 66 Barley Meal, Start Rations x66; ${r.tinker.crowns} Crowns`);
        return goal.id;
      }
      case goal.id === "pay_bill" || goal.id === "opened:exchange":
        if (goal.id === "pay_bill" && guide.soldThisLook === t.crowns) return "wait";
        await sellAll();
        guide.soldThisLook = (await get()).crowns;
        return goal.id;
      case goal.id === "opened:skill:scavenging":
        if (nails) {
          await setQ(startFirst(t.queue, { actionId: A("scavenge_bent_nails"), remaining: 66 }));
          log("Scavenging opened: Start Bent Nails x66");
        } else log("Scavenging opened: looked");
        return goal.id;
      case goal.id.startsWith("opened:"):
        log(`${goal.id}: looked`);
        return goal.id;
      default:
        return goal.id === "sale_done" ? "wait" : goal.id;
    }
  }

  const arrive = async () => {
    guide.ratedThisSitting = false;
    const before = (await get()).crowns;
    const r = await ok("POST", `/tinkers/${id}/check-in`);
    const kills = (r.events ?? []).filter((e) => e.type === "monster_killed");
    log(`check-in: jobs ${r.tinker.jobsDone}, ${r.tinker.crowns} Crowns (${before} before), scrap ${held(r.tinker, SCRAP)}, nails ${held(r.tinker, NAILS)}, kills ${kills.length}, Rations ${held(r.tinker, RATION)}`);
    return r.tinker;
  };
  const stay = async (until) => {
    while (clock < until) {
      clock += MIN;
      await act();
    }
  };
  const snapshot = async (tag) => {
    const t = await get();
    const s = { tag, at: hm(), crowns: t.crowns, jobs: t.jobsDone, scrap: held(t, SCRAP), nails: held(t, NAILS), progress: progressOf(t), debts: t.story.debts.map((d) => d.crowns), seen: [...guide.seen] };
    out.sittings.push(s);
    log(`${tag}: ${s.crowns} Crowns, jobs ${s.jobs}, scrap ${s.scrap}, nails ${s.nails}, progress ${s.progress}, owed ${JSON.stringify(s.debts)}`);
  };

  // ---- sitting 1: the guide, as walk-act1 ----
  await ok("POST", `/tinkers/${id}/check-in`);
  await setQ([{ actionId: A("tinker_brass_spanner"), remaining: 5 }]);
  await playStory(); // who_you_are
  let t = await get();
  for (let i = 0; i < 10 && held(t, I("brass_spanner")) === 0; i++) {
    clock += MIN;
    t = await get();
  }
  await playStory(); // rats_in_the_workshop
  await ok("PUT", `/tinkers/${id}/weapon`, { item: I("brass_spanner") });
  t = await get();
  await setQ([...t.queue.map((e) => ({ actionId: e.actionId, remaining: e.remaining })), { actionId: RUNT, remaining: 10 }]);
  for (let i = 0; i < 30 && held(t, SILK) < 3; i++) {
    clock += MIN;
    t = await get();
  }
  await playStory(); // the_first_haul
  t = await get();
  await setQ(startFirst(t.queue, { actionId: RUNT, remaining: await fillCount() }));
  out.s1.comeBack = ((clock - T0) / MIN).toFixed(0);
  log(`come_back pressed at +${out.s1.comeBack} min, jobs ${(await get()).jobsDone}`);
  await stay(T0 + (player === "hour" ? HOUR : player === "half" ? 30 * MIN : 10 * MIN));
  if (stress) {
    // Off-policy: sell to the cap at the end of sitting 1, then leave Bent Nails on Fill for the night (no rats).
    await sellAll();
    t = await get();
    await setQ([{ actionId: A("scavenge_bent_nails"), remaining: 800 }]);
    log("stress: sold to the cap and left 800 Bent Nails for the night");
  }
  await snapshot("S1 leaves");

  const later = Number(process.env.SIM_LATER_MIN ?? (player === "ten" ? 10 : 15));
  for (let k = 1; k < hours.length && !out.billPaid; k++) {
    sitting = k + 1;
    clock = DAY0 + hours[k] * HOUR;
    await arrive();
    await stay(clock + later * MIN);
    await snapshot(`S${sitting} leaves`);
  }
  // Crowns from kills: everything not from the window, net of the grocer and the debt.
  const end = await get();
  out.crownsIn.kills = end.crowns + (out.billPaid?.owed ?? 0) + out.grocer - out.crownsIn.scrap - out.crownsIn.nails - out.crownsIn.other;
  out.trail = trail;
  await db.end?.();
  return out;
}

const runs = [];
const one = process.argv[2];
if (one) {
  const [player, route, sched, bill, stress] = one.split(":");
  runs.push({ player, nails: route === "nails", sched, bill, stress: stress === "stress", seed: Number(process.env.SIM_SEED ?? 1) });
} else {
  const seeds = Number(process.env.SIM_SEEDS ?? 1);
  for (let seed = 1; seed <= seeds; seed++) {
    for (const sched of ["few", "six", "evening"]) for (const player of ["hour", "half", "ten"]) for (const nails of [false, true]) for (const bill of ["0", "best"]) runs.push({ player, nails, sched, bill, seed });
    runs.push({ player: "hour", nails: true, sched: "few", bill: "best", stress: true, seed });
  }
}
for (const r of runs) {
  const o = await walk(r);
  const s = o.sittings.map((x) => `${x.tag.split(" ")[0]} ${x.crowns}c j${x.jobs} scrap${x.scrap} nails${x.nails} p${x.progress} owed${x.debts.join("/") || "-"}`).join(" | ");
  console.log(`${o.label}: paid ${o.billPaid ? `${o.billPaid.owed} at ${o.billPaid.at}` : "NOT within the schedule"}; letter ${o.letter ? `${o.letter.at} scrap ${o.letter.scrapHeld} repair ${o.letter.repairOpen ? "open" : "GREYED"} ${o.letter.crowns}c` : "not read"}; in: kills ${o.crownsIn.kills}, scrap ${o.crownsIn.scrap}, nails ${o.crownsIn.nails}, other ${o.crownsIn.other}; grocer -${o.grocer}; come_back +${o.s1.comeBack} min; Scavenging line ${o.scavLine ? `${o.scavLine.at}${o.scavLine.unpaid ? " (bill unpaid)" : ""}` : "never"}`);
  console.log(`   ${s}`);
}
process.exit(0);

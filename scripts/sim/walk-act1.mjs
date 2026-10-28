// The Assayer's Act I walk (work order 018): plays a new Tinker for up to 14
// days, or until the Foundry Pass is played, at 2, 3 and 4 check-ins a day,
// through the same HTTP routes the client calls, with an injected clock and
// its own database. It changes no engine code, content or tuning.
//
// Work order 024 extension (the assayer, 27 October 2026): the walk now runs past
// the Foundry Pass to the Ambition choice and that Ambition's opener, and records
// the first-session guide, every letter dealt, and every Ledger Page held.
//   SIM_PAGE=n     forces the option taken at what_you_do_with_it (2 = Gaugehill, for the Board road)
//   SIM_ROAD=n     forces the Foundry Pass option (0 smithing token, 1 Stokers' Favour, 2 Board card, 3 Tallow)
//   SIM_AMBITION=n forces the night_before option (0 gauge, 1 lantern, 2 ember, 3 fathom)
//   SIM_TINKER_ID=n walks Tinker id n (each id seeds its own luck; default 1)
//   SIM_FIRST_NIGHT=runts queues only Runts for the first night (default: an hour of bent nails, then Runts)
//   SIM_FIRST_PAY=spare keeps the old first-session rule (pay only with 100 Crowns to spare);
//     the default now pays Pip's bill in the first session as soon as the purse covers it,
//     as the policy below and the guide's pay_bill step say.
// A forced option that is locked leaves the scene unplayed that sitting, and the walk says so.
// Scenes that move an ambition.* quality are played as spine beats (first certain open option).
//
// Run from the repo root, after `cd engine && npm run build`:
//   createdb long_boil_sim              # once
//   node scripts/sim/walk-act1.mjs      # all three cadences
//   node scripts/sim/walk-act1.mjs 3    # one cadence
//   SIM_DAYS=21 node scripts/sim/walk-act1.mjs   # a longer horizon
//   SIM_BOSS_MIN=0.4 node scripts/sim/walk-act1.mjs   # the boss threshold (default 0.4)
//   SIM_VERBOSE=1 node scripts/sim/walk-act1.mjs 3   # every sitting, line by line
//
// The database (SIM_DB, default long_boil_sim) is dropped and rebuilt from the
// migrations before each cadence. It refuses long_boil_dev and long_boil_test.
//
// Player policy, fixed and stated (not tuned to any result). The player is
// assumed to know every Act I gate (the client does not show locked
// storylets), and to know Scrapjaw's win chance before queuing it (the
// client does not show it; the sim reads it from the engine's own planBoss).
// - First session (Thursday 18:00): prospect 1 copper and smelt it, tinker 5
//   Brass Spanners, fight 10 Runts, equip the spanner, play every open scene,
//   sell to the collectors, pay Pip's bill, then queue an hour of bent nails
//   and Runts for the night.
// - Every sitting: collect, sell everything the collectors buy (keeping one
//   of each weapon and every crafting input), pay any debt the purse covers
//   with 100 Crowns to spare, equip the best melee weapon usable, then play
//   every letter and every open storylet while Nerve lasts. Take a challenge
//   when its shown odds are 0.5 or better, otherwise the first option that is
//   certain and open. Letters are answered; one the engine refuses (its
//   requirements lapsed while it sat in hand) is discarded.
// - Order at a sitting: letters, then spine beats (scenes that move
//   act1.progress or prologue.progress), then district scenes with the Nerve
//   left over (work order 019). The player reads an option's effect from its
//   label; the sim reads it from the content file.
// - District rule: score an outcome +1 per Favour point gained, -1 per Favour
//   point spent, +1 per Needle point actually lowered (not below 0), -1 per
//   Needle point raised. An item cost is allowed only if it leaves the
//   reserve: 100 Rations, 1 Brass Spanner; ingots, coal and rat scrap have
//   none. Take a challenge at shown odds 0.5 or better whose success scores
//   above 0; else the certain option with the best score above 0; else skip
//   the scene. Play the best-scoring open scene, re-score, repeat while Nerve
//   lasts. A scene that never scores above 0 is reported as never worth it.
//   SIM_DISTRICT=all: spends all spare Nerve, taking the best affordable option
//   even at a score of 0 or below (an upper bound on story pace).
// - Scrapjaw's win chance is read from the engine's /tinkers/:id/fights route,
//   the odds the queue picker shows.
// - Queue: slot 1 is one production task sized to half the time until the
//   next sitting (GDD section 6's balanced player; capped at the 12-hour
//   Boiler); slot 2 fights for the rest. Slot 1, first that applies:
//     1. Scrapjaw, 3 attempts, when its win chance with the Rations held
//        (at most 3) is SIM_BOSS_MIN or better, until beaten.
//     2. Cook, when Rations held are below what the next interval's fighting
//        eats plus 3 for a boss attempt and 20 spare.
//     3. Alternating sitting by sitting between (a) the first unmet Act I
//        skill gate (scavenging 3, tinkering 6, scavenging 9, cooking 5) and
//        (b) the next melee weapon (crowbar, riveting hammer, steel blade)
//        once melee is within 3 levels of it, working its chain backwards
//        (forge, smelt, prospect, or train the skill that gates the step).
//     4. Otherwise rotate scavenging, prospecting, smithing, cooking, tinkering.
// - Fighting: melee only (Scrapjaw is weak to melee and the first-session
//   spanner is melee); the ordinary monster with the best melee XP an hour by
//   the engine's own planKill with the Rations held.

import { buildApi } from "../../engine/packages/server/dist/api.js";
import { loadContent } from "../../engine/packages/server/dist/content-loader.js";
import { connect, migrate } from "../../engine/packages/server/dist/db.js";
import { fighterFor, levelFor, planBoss, planKill } from "../../engine/packages/rules/dist/index.js";

const DB_NAME = process.env.SIM_DB ?? "long_boil_sim";
if (["long_boil_dev", "long_boil_test"].includes(DB_NAME)) throw new Error(`refusing to use ${DB_NAME}`);
const VERBOSE = process.env.SIM_VERBOSE === "1";
const DAYS = Number(process.env.SIM_DAYS ?? 14);
const BOSS_MIN = Number(process.env.SIM_BOSS_MIN ?? 0.4);
// "balanced" (default): slot 2 always fights. "focused": once melee has reached the next weapon's level, the
// weapon chain takes both slots (prospect then smelt, or smelt then prospect) and fighting waits for the forge.
const POLICY = process.env.SIM_POLICY ?? "balanced";
// "wanted" (default): district scenes only when an option scores above 0. "all": spend every spare Nerve on
// district scenes, taking the best-scoring affordable option even at 0 or below (a challenge still needs 0.5).
const DISTRICT_MODE = process.env.SIM_DISTRICT ?? "wanted";
// The Cog Shop (build plan milestone 12: "the assayer models them before launch"). SIM_SHOP is a comma list of
// slot, boiler, lamp, boost, or "all"; empty (default) buys nothing. Crates come from the dev grant, unlocked, and
// are bought at the first sitting at or after SIM_SHOP_DAY (default 0, the first session; 3 models a crate bought
// on day 0 that waits out the 72-hour lock). The Boiler is bought to its most; the Boost is bought once a day for
// every day left, so it never lapses. Under the Boost the player sizes the production slot by the boosted time, so
// the balanced 50/50 split of time is unchanged.
const SHOP = [...new Set((process.env.SIM_SHOP ?? "").split(",").filter(Boolean).flatMap((s) => (s === "all" ? ["slot", "boiler", "lamp", "boost"] : [s])))];
const SHOP_DAY = Number(process.env.SIM_SHOP_DAY ?? 0);
// SIM_HOURS overrides the hours of the day for the later sittings, e.g. "8,22" for a long-shift two-a-day player.
const HOURS = process.env.SIM_HOURS ? process.env.SIM_HOURS.split(",").map(Number) : null;
const FORCE = {
  "act1.sprocket_row.what_you_do_with_it": process.env.SIM_PAGE,
  "act1.brass_exchange.foundry_pass": process.env.SIM_ROAD,
  "act1.sprocket_row.the_night_before": process.env.SIM_AMBITION,
};
for (const k of Object.keys(FORCE)) if (FORCE[k] === undefined || FORCE[k] === "") delete FORCE[k]; else FORCE[k] = Number(FORCE[k]);
const FIRST_PAY = process.env.SIM_FIRST_PAY ?? "now";
const AMBITIONS = ["ambition.gauge", "ambition.lantern", "ambition.ember", "ambition.fathom"];
const PROLOGUE = ["prologue.sprocket_row.back_rent", "prologue.sprocket_row.the_neighbours", "prologue.polytechnic.the_register", "prologue.sprocket_row.the_missing_tins", "prologue.rustmoor.the_tip_book", "prologue.rustmoor.the_first_nest", "prologue.sprocket_row.the_receipt", "prologue.polytechnic.the_lift_lecture", "prologue.sprocket_row.the_morning_gazette", "prologue.sprocket_row.brass_plate"];
// The first-session guide's step rules, copied from engine/packages/client/src/Guide.tsx (the client imports
// react-native, so the sim cannot import it). "boiler" and "come_back" are taken as pressed when the player does them.
const GUIDE = [
  ["boiler", (t, ack) => ack],
  ["queue_spanners", (t) => t.queue.some((e) => e.actionId === "action.rustmoor.tinker_brass_spanner") || t.inventory.some((x) => x.item === "item.rustmoor.brass_spanner" && x.qty > 0) || t.weapon !== null],
  ["first_spanner", (t) => t.inventory.some((x) => x.item === "item.rustmoor.brass_spanner" && x.qty > 0) || t.weapon !== null],
  ["pips_bill", (t) => (t.story.qualities["prologue.progress"] ?? 0) >= 10],
  ["equip", (t) => t.weapon !== null],
  ["rats", (t) => t.crowns > 0 || ((t.story.qualities["prologue.progress"] ?? 0) >= 10 && t.story.backRent === 0)],
  ["pay_bill", (t) => (t.story.qualities["prologue.progress"] ?? 0) >= 10 && t.story.backRent === 0],
  ["brass_plate", (t) => (t.story.qualities["prologue.progress"] ?? 0) >= 100],
  ["come_back", (t, ack) => ack && t.queue.length > 0],
];
const guideStep = (t, acked) => GUIDE.find(([id, done]) => !done(t, acked.includes(id)))?.[0] ?? "(done)";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
// Thursday 22 October 2026, 18:00 UTC: an evening first session.
const T0 = Date.UTC(2026, 9, 22, 18, 0, 0);
const MIDNIGHT0 = Date.UTC(2026, 9, 22, 0, 0, 0);

// Hours of the day for the later sittings, from Friday on.
const DAILY = { 2: [7, 19], 3: [7, 13, 21], 4: [7, 12, 17, 22] };

const A = (s) => `action.rustmoor.${s}`;
const I = (s) => `item.rustmoor.${s}`;
const M = (s) => `monster.rustmoor.${s}`;
const SPANNER = I("brass_spanner");
const RATION = I("rustmoor_ration");
const SCRAPJAW = M("scrapjaw");
const PAGE = I("ledger_page_1");

const content = loadContent();
const R = content.rules;

const BEATS = [
  ["act1.sprocket_row.altitude_review", "record.check_ins >= 2"],
  ["act1.lowvents.the_list", "record.check_ins >= 3"],
  ["act1.polytechnic.sealed_lab", "record.check_ins >= 4"],
  ["act1.rustmoor.rat_nests", "record.check_ins >= 5"],
  ["act1.lowvents.bottom_rim", "record.check_ins >= 6"],
  ["act1.brass_exchange.rooks_question", "tinkering >= 6"],
  ["act1.rustmoor.rook_at_the_tip", "scavenging >= 9"],
  ["act1.rustmoor.scrapjaws_den", "cooking >= 5"],
  ["act1.sprocket_row.two_columns", "ledger_page_1 (Scrapjaw's first kill)"],
  ["act1.sprocket_row.what_you_do_with_it", "2 Nerve"],
  ["act1.brass_exchange.foundry_pass", ""],
];
// The skill gates in beat order, each with the act1.progress below which it still matters.
const GATES = [
  { skill: "scavenging", level: 3, before: 20 },
  { skill: "tinkering", level: 6, before: 35 },
  { skill: "scavenging", level: 9, before: 40 },
  { skill: "cooking", level: 5, before: 50 },
];
const WEAPONS = [I("iron_crowbar"), I("riveting_hammer"), I("steel_blade")]; // melee, in order
const GROCER = { [I("barley_meal")]: 2, [I("salt_pork")]: 4 };

// Spine scenes move a progress quality; every other storylet is a repeatable district scene.
const SPINE = new Set(
  [...R.storylets.values()].filter((s) => s.options.some((o) => [o.success, o.failure].some((x) => x && Object.keys(x.changes).some((k) => k === "act1.progress" || k === "prologue.progress" || k.startsWith("ambition."))))).map((s) => s.id),
);
const DISTRICT = [...R.storylets.values()].filter((s) => !SPINE.has(s.id)).map((s) => s.id);
const RESERVE = { [I("rustmoor_ration")]: 100, [I("brass_spanner")]: 1 };

const hhmm = (t) => new Date(t).toISOString().slice(5, 16).replace("T", " ");
const dayOf = (t) => ((t - T0) / DAY).toFixed(2);

function schedule(perDay) {
  const out = [];
  for (let d = 1; d <= DAYS; d++) for (const h of HOURS ?? DAILY[perDay]) out.push(MIDNIGHT0 + d * DAY + h * HOUR);
  return out.filter((t) => t <= T0 + DAYS * DAY);
}

async function runCadence(perDay) {
  const db = connect(DB_NAME);
  await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(db);
  let clock = T0;
  // With SIM_SHOP, a stub dev clock opens the /dev routes for the crate grant; the sim's own clock stays the API's now.
  const devClock = SHOP.length ? { offset: () => 0, skip: async () => 0 } : undefined;
  const app = buildApi({ db, content, now: () => clock, devClock });
  const call = async (method, url, payload) => {
    const r = await app.inject({ method, url, ...(payload ? { payload } : {}) });
    return { status: r.statusCode, body: r.json() };
  };
  const ok = async (method, url, payload) => {
    const r = await call(method, url, payload);
    if (r.status >= 300) throw new Error(`${method} ${url} ${JSON.stringify(payload)} -> ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };
  const economy = (await ok("GET", "/content")).economy;

  const notes = [];
  const note = (s) => {
    notes.push(`[${hhmm(clock)} d${dayOf(clock)}] ${s}`);
    if (VERBOSE) console.log(notes.at(-1));
  };
  const scenes = []; // { at, id, kind, option, success, odds, nerve }
  const seenOpen = {}; // storylet id -> first sitting it showed as open
  const bossChecks = []; // { at, win, rations, weapon, melee }
  const sittings = []; // { at, nerveBefore, nerveAfter }
  const stalls = [];
  const refusals = [];
  const districtSeen = {}; // id -> { open: sittings seen open, worth: sittings it scored above 0, played, options }
  const forcedLocked = [];
  const guideTrail = []; // { at, after, step }
  const pagesHeld = {}; // item -> first sitting it was held
  let ledgerEnd = null;
  let firstSession = null;

  const held = (t, item) => t.inventory.filter((s) => s.item === item).reduce((n, s) => n + s.qty, 0);
  const heldUnbound = (t, item) => t.inventory.filter((s) => s.item === item && !s.bound).reduce((n, s) => n + s.qty, 0);
  const xpOf = (t) => Object.fromEntries(t.skills.map((s) => [s.skill, s.xp]));
  const lvl = (t, skill) => levelFor(xpOf(t)[skill] ?? 0, R);
  const inv = (t) => {
    const o = {};
    for (const s of t.inventory) o[s.item] = (o[s.item] ?? 0) + s.qty;
    return o;
  };

  // Scores an outcome's changes for the district rule; null when an item cost breaks a reserve.
  function score(changes, view, t) {
    let v = 0;
    for (const [name, change] of Object.entries(changes)) {
      const d = typeof change === "number" ? null : Number(change);
      if (name.startsWith("item.")) {
        if (d < 0 && held(t, name) + d < (RESERVE[name] ?? 0)) return null;
        continue;
      }
      const cur = view.qualities[name] ?? 0;
      if (name.startsWith("needle.")) v += d < 0 ? Math.min(-d, cur) : -d;
      else if (name.startsWith("favour.")) v += d;
    }
    return v;
  }

  function bestDistrict(view, t) {
    let best = null;
    for (const s of view.storylets) {
      if (SPINE.has(s.id) || s.nerve > view.nerve) continue;
      const src = R.storylets.get(s.id);
      let pick = null;
      s.options.forEach((o, i) => {
        if (!o.available) return;
        const sc = score(src.options[i].success.changes, view, t);
        if (sc === null || (sc <= 0 && DISTRICT_MODE !== "all")) return;
        if (o.challenge && o.challenge.odds < 0.5) return;
        if (o.challenge) {
          if ((!pick || (pick.challenge === false && sc > 0) || sc > pick.score)) pick = { option: i, score: sc, challenge: true };
        } else if (!pick || (!pick.challenge && sc > pick.score)) pick = { option: i, score: sc, challenge: false };
      });
      districtSeen[s.id] ??= { open: 0, worth: 0, played: 0, options: {} };
      if (pick && (!best || pick.score > best.score)) best = { scene: s, ...pick };
      if (pick && DISTRICT_MODE === "all" && best && pick.score === best.score && (districtSeen[s.id]?.played ?? 0) < (districtSeen[best.scene.id]?.played ?? 0)) best = { scene: s, ...pick };
    }
    return best;
  }

  async function playStory(id) {
    let tinkerNow = (await ok("GET", `/tinkers/${id}`)).tinker;
    let view = (await ok("GET", `/tinkers/${id}/story`)).view;
    for (const s of view.storylets) if (!SPINE.has(s.id)) {
      districtSeen[s.id] ??= { open: 0, worth: 0, played: 0, options: {} };
      districtSeen[s.id].open += 1;
      if (bestDistrict({ ...view, storylets: [s], nerve: Math.max(view.nerve, 1) }, tinkerNow)) districtSeen[s.id].worth += 1;
    }
    const before = view.nerve;
    for (const s of view.storylets) seenOpen[s.id] ??= clock;
    const refused = new Set(); // scenes the engine refused this sitting, such as a letter whose requirements lapsed in hand
    for (;;) {
      const letter = view.letters.find((l) => l.nerve <= view.nerve && !refused.has(l.id));
      const storylet = view.storylets.find((s) => SPINE.has(s.id) && s.nerve <= view.nerve && !refused.has(s.id));
      let scene = letter ? { ...letter, kind: "letter" } : storylet ? { ...storylet, kind: "storylet" } : null;
      let choice = -1;
      if (scene && scene.id in FORCE) {
        const f = FORCE[scene.id];
        if (!scene.options[f]?.available) {
          note(`forced option ${f} of ${scene.id} is locked (${JSON.stringify(scene.options[f]?.locked)}); scene left unplayed`);
          forcedLocked.push({ at: clock, id: scene.id, option: f, locked: scene.options[f]?.locked });
          refused.add(scene.id);
          continue;
        }
        choice = f;
      } else if (scene) {
        choice = scene.options.findIndex((o) => o.available && o.challenge && o.challenge.odds >= 0.5);
        if (choice < 0) choice = scene.options.findIndex((o) => o.available && !o.challenge);
        if (choice < 0) choice = scene.options.findIndex((o) => o.available);
      } else {
        const pick = bestDistrict(view, tinkerNow);
        if (pick) {
          scene = { ...pick.scene, kind: "storylet", district: true };
          choice = pick.option;
        }
      }
      if (!scene || view.nerve < scene.nerve) break;
      const r = await call("POST", `/tinkers/${id}/story`, { kind: scene.kind, scene: scene.id, option: choice });
      if (r.status !== 200) {
        note(`story refused ${scene.id} option ${choice}: ${r.body.error}`);
        refusals.push({ at: clock, id: scene.id, error: r.body.error });
        refused.add(scene.id);
        if (scene.kind === "letter") {
          await ok("DELETE", `/tinkers/${id}/letters/${scene.id}`);
          note(`discarded ${scene.id}, which can no longer be answered`);
        }
        continue;
      }
      const p = r.body.played;
      const qBefore = view.qualities;
      scenes.push({ qBefore, qAfter: r.body.view.qualities, at: clock, id: scene.id, kind: scene.district ? "district" : scene.kind, option: choice, success: p.success, odds: p.odds, nerve: scene.nerve, changes: r.body.events?.find?.((e) => e.type === "scene_played") ?? null });
      if (scene.district) {
        const d = districtSeen[scene.id];
        d.played += 1;
        d.options[choice] = (d.options[choice] ?? 0) + 1;
      }
      tinkerNow = r.body.tinker;
      note(`played ${scene.kind} ${scene.id} option ${choice} "${scene.options[choice].label.slice(0, 50)}"${p.odds !== null ? ` at ${Math.round(p.odds * 100)}%` : ""}: ${p.success ? "success" : "FAILED"}; Nerve ${r.body.view.nerve}`);
      view = r.body.view;
      for (const s of view.storylets) seenOpen[s.id] ??= clock;
    }
    sittings.push({ at: clock, nerveBefore: before, nerveAfter: view.nerve, qualities: view.qualities });
    return view;
  }

  async function sellAndPay(id, spare = 100) {
    const market = await ok("GET", `/tinkers/${id}/market`);
    let t = (await ok("GET", `/tinkers/${id}`)).tinker;
    let earned = 0;
    const keepOne = new Set([SPANNER, ...WEAPONS]);
    for (const [item, left] of Object.entries(market.collectorLeft)) {
      const qty = Math.min(left, heldUnbound(t, item) - (keepOne.has(item) ? 1 : 0));
      if (qty <= 0) continue;
      t = (await ok("POST", `/tinkers/${id}/collector`, { item, qty })).tinker;
      earned += qty * economy[item].collectorPrice;
    }
    for (const debt of t.story.debts) {
      if (t.crowns >= debt.crowns + spare) {
        await ok("POST", `/tinkers/${id}/debts/${debt.id}`);
        note(`paid ${debt.label}: ${debt.crowns} Crowns`);
        t = (await ok("GET", `/tinkers/${id}`)).tinker;
      }
    }
    return { earned, t };
  }

  async function equipBest(id, t) {
    const melee = lvl(t, "melee");
    const usable = [...R.weapons.values()].filter((w) => w.style === "melee" && w.level_required <= melee && held(t, w.item) > 0).sort((a, b) => b.power - a.power)[0];
    if (usable && usable.item !== t.weapon) {
      t = (await ok("PUT", `/tinkers/${id}/weapon`, { item: usable.item })).tinker;
      note(`equipped ${usable.item.split(".").pop()} (melee ${melee})`);
    }
    return t;
  }

  // The ordinary monster with the best melee XP an hour, by the engine's own kill plan.
  function bestFight(t) {
    const w = R.weapons.get(t.weapon);
    const f = fighterFor(xpOf(t), w, R);
    const rations = held(t, RATION) > 0;
    let best = null;
    for (const m of R.monsters.values()) {
      if (m.boss) continue;
      const plan = planKill(R.combat, f, m, R.ration.heal, rations);
      if (!plan) continue;
      const rate = (m.xp * R.combat.MAIN_COMBAT_SKILL_SHARE) / plan.seconds;
      if (!best || rate > best.rate) best = { m, plan, rate };
    }
    return best;
  }

  async function bossShown(id) {
    const f = (await ok("GET", `/tinkers/${id}/fights`)).fights.find((x) => x.monsterId === SCRAPJAW);
    return f && f.ready ? { win: f.winChance, rations: f.rations } : { win: 0, rations: 0 };
  }

  function bossChance(t) {
    const w = R.weapons.get(t.weapon);
    const f = fighterFor(xpOf(t), w, R);
    const rations = Math.min(R.combat.BOSS_RATION_CAP_PER_ATTEMPT, held(t, RATION));
    return { ...planBoss(R.combat, f, R.monsters.get(SCRAPJAW), R.ration.heal, rations), rations };
  }

  const actionsBySkill = (skill) => [...R.actions.values()].filter((a) => a.skill === skill);
  const producer = (item) => [...R.actions.values()].find((a) => a.outputs.some((o) => o.item === item));

  async function buy(id, item, qty) {
    if (qty <= 0) return;
    await ok("POST", `/tinkers/${id}/grocer`, { item, qty });
  }

  // Slot-1 builders. Each returns { actionId, remaining, why } or null.
  async function cook(id, t, secs, why) {
    const level = lvl(t, "cooking");
    const recipes = actionsBySkill("cooking").filter((a) => a.level_required <= level).sort((a, b) => b.level_required - a.level_required);
    for (const a of recipes) {
      const per = a.inputs.reduce((n, i) => n + i.qty * GROCER[i.item], 0);
      const want = Math.min(Math.floor(secs / a.seconds), Math.floor((t.crowns - 50) / per));
      if (want < 1) continue;
      for (const i of a.inputs) await buy(id, i.item, i.qty * want - held(t, i.item));
      return { actionId: a.id, remaining: want, why: `${why}; bought ingredients for ${want * per} Crowns` };
    }
    return null;
  }

  function gather(skill, t, secs, why) {
    const level = lvl(t, skill);
    const a = actionsBySkill(skill).filter((x) => x.level_required <= level && x.inputs.length === 0).sort((x, y) => y.level_required - x.level_required)[0];
    return a ? { actionId: a.id, remaining: Math.max(1, Math.floor(secs / a.seconds)), why } : null;
  }

  // Obtains `qty` of an item by working its chain backwards, one step per sitting.
  async function obtain(id, t, item, qty, secs, why, depth = 0) {
    const a = producer(item);
    if (!a || depth > 4) return null;
    if (lvl(t, a.skill) < a.level_required) return train(id, t, a.skill, secs, `${why}: ${a.skill} ${a.level_required} for ${a.id.split(".").pop()}`, depth + 1);
    for (const input of a.inputs) {
      if (held(t, input.item) < input.qty * qty) return obtain(id, t, input.item, input.qty * qty - held(t, input.item), secs, why, depth + 1);
    }
    const n = a.inputs.length ? qty : Math.max(qty, Math.floor(secs / a.seconds));
    return { actionId: a.id, remaining: Math.max(1, Math.min(n, Math.floor(secs / a.seconds) || 1)), why: `${why}: ${a.id.split(".").pop()}` };
  }

  async function train(id, t, skill, secs, why, depth = 0) {
    if (skill === "scavenging" || skill === "prospecting") return gather(skill, t, secs, why);
    if (skill === "cooking") return cook(id, t, secs, why);
    const level = lvl(t, skill);
    // Smithing: the best smelt whose inputs are held, else prospect for the best smelt reachable.
    // Tinkering: the best brass or iron good whose inputs are held, else make brass ingots.
    const pool = skill === "smithing"
      ? actionsBySkill("smithing").filter((a) => a.id.includes("smelt"))
      : actionsBySkill("tinkering").filter((a) => a.inputs.length === 1 && [I("brass_ingot"), I("copper")].includes(a.inputs[0].item));
    const cands = pool.filter((a) => a.level_required <= level).sort((a, b) => b.level_required - a.level_required);
    for (const a of cands) {
      const can = Math.min(...a.inputs.map((i) => Math.floor(held(t, i.item) / i.qty)));
      if (can >= 1) return { actionId: a.id, remaining: Math.max(1, Math.min(can, Math.floor(secs / a.seconds))), why: `${why}: ${a.id.split(".").pop()}` };
    }
    if (depth > 3) return null;
    for (const a of cands) {
      const missing = a.inputs.find((i) => held(t, i.item) < i.qty);
      const p = producer(missing.item);
      if (p && lvl(t, p.skill) >= p.level_required && p.inputs.every((i) => held(t, i.item) >= i.qty)) {
        return obtain(id, t, missing.item, Math.floor(secs / p.seconds), secs, `${why} (inputs)`, depth + 1);
      }
    }
    return gather("prospecting", t, secs, `${why} (copper)`);
  }

  // ---------- the Cog Shop ----------
  let boilerHours = 12;
  let boosted = false;
  const shopBought = { at: null, cogs: 0, crates: 0, buys: {} };
  async function shopUp(id) {
    const s = R.shop;
    const daysLeft = Math.ceil((T0 + DAYS * DAY - clock) / DAY);
    const want = {
      slot: [s.queueSlot.slots - 2, s.queueSlot.cogs],
      boiler: [(s.boilerUpgrade.maxHours - 12) / s.boilerUpgrade.hours, s.boilerUpgrade.cogs],
      lamp: [1, s.nightLamp.cogs],
      boost: [daysLeft, s.boost.cogs],
    };
    const cogs = SHOP.reduce((n, k) => n + want[k][0] * want[k][1], 0);
    const crates = Math.ceil(cogs / s.crate.cogs);
    await ok("POST", `/dev/tinkers/${id}/crates`, { qty: crates });
    await ok("GET", `/tinkers/${id}`);
    await ok("POST", `/tinkers/${id}/shop/open`, { qty: crates });
    const purchase = { slot: "queue_slot", boiler: "boiler_upgrade", lamp: "night_lamp", boost: "boiler_boost" };
    for (const k of SHOP) for (let i = 0; i < want[k][0]; i++) await ok("POST", `/tinkers/${id}/shop/buy`, { purchase: purchase[k] });
    const { shop } = await ok("GET", `/tinkers/${id}/shop`);
    boilerHours = shop.upgrades.boilerHours;
    boosted = SHOP.includes("boost");
    Object.assign(shopBought, { at: clock, cogs, crates, buys: Object.fromEntries(SHOP.map((k) => [k, want[k][0]])), upgrades: shop.upgrades });
    note(`Cog Shop: ${crates} crates, ${cogs} Cogs: ${JSON.stringify(shopBought.buys)}; upgrades ${JSON.stringify(shop.upgrades)}`);
  }

  // ---------- the first session ----------
  // SIM_TINKER_ID=n: n-1 throwaway Tinkers are made first, so the walked Tinker gets id n and that id's seed.
  for (let i = 1; i < Number(process.env.SIM_TINKER_ID ?? 1); i++) await ok("POST", "/tinkers", { login: `spare${i}@example.com`, name: `Spare ${i}` });
  const main = (await ok("POST", "/tinkers", { login: "ada@example.com", name: "Ada" })).tinker.id;
  const acked = [];
  const g = async (after) => {
    const t = (await ok("GET", `/tinkers/${main}`)).tinker;
    guideTrail.push({ at: clock, after, step: guideStep(t, acked) });
    if (VERBOSE) console.log(`  guide after ${after}: ${guideTrail.at(-1).step}`);
  };
  await g("sign-up");
  acked.push("boiler");
  await ok("POST", `/tinkers/${main}/check-in`);
  await g("boiler pressed, check-in");
  if (SHOP.length && SHOP_DAY === 0) await shopUp(main);
  await ok("PUT", `/tinkers/${main}/queue`, { queue: [{ actionId: A("prospect_copper"), remaining: 1 }, { actionId: A("smelt_brass_ingot"), remaining: 1 }] });
  clock += 2 * MIN;
  await ok("GET", `/tinkers/${main}`);
  await ok("PUT", `/tinkers/${main}/queue`, { queue: [{ actionId: A("tinker_brass_spanner"), remaining: 5 }, { actionId: M("rust_rat_runt"), remaining: 10 }] });
  await g("queued 5 spanners then 10 Runts");
  clock += 1 * MIN;
  await ok("GET", `/tinkers/${main}`);
  await g("a minute later");
  await ok("PUT", `/tinkers/${main}/weapon`, { item: SPANNER });
  await g("equipped spanner");
  await playStory(main);
  await g("first story pass");
  clock += 14 * MIN;
  await sellAndPay(main, FIRST_PAY === "spare" ? 100 : 0);
  await g("sold and paid");
  await playStory(main);
  await g("second story pass");
  clock += 3 * MIN;
  // SIM_FIRST_NIGHT=runts: the night is all Runts, as a player who follows the guide's "fill twelve hours" might queue it.
  await ok("PUT", `/tinkers/${main}/queue`, { queue: process.env.SIM_FIRST_NIGHT === "runts" ? [{ actionId: M("rust_rat_runt"), remaining: 10_000 }] : [{ actionId: A("scavenge_bent_nails"), remaining: 67 }, { actionId: M("rust_rat_runt"), remaining: 10_000 }] });
  acked.push("come_back");
  await g("queued the night, Leave it running");
  {
    const v = (await ok("GET", `/tinkers/${main}/story`)).view;
    firstSession = { end: clock, prologue: v.qualities["prologue.progress"] ?? 0, nerve: v.nerve, played: scenes.map((x) => x.id), nails: held((await ok("GET", `/tinkers/${main}`)).tinker, I("bent_nails")) };
  }
  note("first session done: Prologue played, an hour of nails then Runts queued");

  // ---------- the sittings ----------
  const times = schedule(perDay);
  let alt = 0;
  let rot = 0;
  let foundryAt = null;
  for (const [k, at] of times.entries()) {
    clock = at;
    const out = await ok("POST", `/tinkers/${main}/check-in`);
    for (const s of out.ledger.stalls ?? []) stalls.push({ at: clock, ...s });
    if (SHOP.length && shopBought.at === null && clock >= T0 + SHOP_DAY * DAY) await shopUp(main);
    const won = out.events.filter((e) => e.type === "boss_attempted");
    if (won.length) note(`Scrapjaw: ${won.map((e) => `${e.won ? "WON" : "lost"} at ${Math.round(e.winChance * 100)}%`).join(", ")}${won.some((e) => e.produced?.[PAGE]) ? "; Ledger Page dropped" : ""}`);
    let { t } = await sellAndPay(main);
    t = await equipBest(main, t);
    const view = await playStory(main);
    {
      const tt = (await ok("GET", `/tinkers/${main}`)).tinker;
      for (const st of tt.inventory) if (st.item.includes("ledger_page") && st.qty > 0) pagesHeld[st.item] ??= clock;
    }
    if (!foundryAt && scenes.some((s) => s.id === "act1.brass_exchange.foundry_pass")) {
      foundryAt = clock;
      note("Foundry Pass played");
    }
    if (AMBITIONS.some((a) => (view.qualities[a] ?? 0) >= 5)) {
      note("Ambition opener played: walk ends");
      break;
    }
    if (k === times.length - 1) break;

    t = (await ok("GET", `/tinkers/${main}`)).tinker;
    const interval = Math.min(times[k + 1] - at, boilerHours * HOUR);
    const half = (interval / 2 / 1000) * (boosted ? 1 + R.shop.boost.percent / 100 : 1);
    const progress = view.qualities["act1.progress"] ?? 0;

    let slot = null;
    const boss = await bossShown(main);
    if (!t.bossesBeaten.includes(SCRAPJAW)) bossChecks.push({ at: clock, win: boss.win, rations: boss.rations, weapon: t.weapon, melee: lvl(t, "melee") });
    const fight = bestFight(t);
    if (!t.bossesBeaten.includes(SCRAPJAW) && boss.win >= BOSS_MIN && boss.rations === 3 && held(t, RATION) >= 9) {
      slot = { actionId: SCRAPJAW, remaining: 3, why: `Scrapjaw at ${Math.round(boss.win * 100)}% with ${t.weapon.split(".").pop()}, melee ${lvl(t, "melee")}` };
    }
    if (!slot) {
      const eat = fight ? (fight.plan.rations * (interval / 1000)) / fight.plan.seconds : 0;
      if (held(t, RATION) < eat + 23) slot = await cook(main, t, half, `Rations low (${held(t, RATION)} held, next interval eats about ${Math.round(eat)})`);
    }
    if (!slot) {
      const gate = GATES.find((g) => progress < g.before && lvl(t, g.skill) < g.level);
      const melee = lvl(t, "melee");
      const nextWeapon = WEAPONS.find((w) => held(t, w) === 0 && R.weapons.get(w).level_required <= melee + 3 && R.weapons.get(w).power > (R.weapons.get(t.weapon)?.power ?? 0));
      const wants = [];
      if (gate) wants.push(() => train(main, t, gate.skill, half, `gate ${gate.skill} ${gate.level}`));
      if (nextWeapon) wants.push(() => obtain(main, t, nextWeapon, 1, half, `weapon ${nextWeapon.split(".").pop()}`));
      if (wants.length) {
        const order = alt++ % 2 === 0 ? wants : [...wants].reverse();
        for (const w of order) if ((slot = await w())) break;
      }
    }
    if (!slot) {
      const skills = ["scavenging", "prospecting", "smithing", "cooking", "tinkering"];
      for (let i = 0; i < skills.length && !slot; i++) slot = await train(main, t, skills[rot++ % skills.length], half, "rotation");
    }
    t = (await ok("GET", `/tinkers/${main}`)).tinker;
    const f2 = bestFight(t);
    let second = { actionId: f2.m.id, remaining: 10_000 };
    let secondWhy = `${f2.m.id.split(".").pop()} at ${f2.plan.seconds.toFixed(0)} s a kill`;
    if (POLICY === "focused" && slot.why.startsWith("weapon")) {
      const target = WEAPONS.find((w) => slot.why.includes(w.split(".").pop()));
      const a = R.actions.get(slot.actionId);
      if (target && lvl(t, "melee") >= R.weapons.get(target).level_required && a && a.skill !== "smithing" || (a?.skill === "smithing" && !a.id.includes("forge") && lvl(t, "melee") >= R.weapons.get(target).level_required)) {
        const secs = interval / 1000 - slot.remaining * a.seconds;
        let b = null;
        if (a.skill === "prospecting") b = [...R.actions.values()].find((x) => x.id.includes("smelt") && x.inputs.length === 1 && x.inputs[0].item === a.outputs[0].item && x.level_required <= lvl(t, "smithing"));
        if (a.skill === "smithing") b = producer(a.inputs.find((i) => producer(i.item)?.skill === "prospecting")?.item ?? "");
        if (b && lvl(t, b.skill) >= b.level_required && secs > b.seconds) {
          second = { actionId: b.id, remaining: b.skill === "smithing" ? Math.max(1, Math.min(slot.remaining, Math.floor(secs / b.seconds))) : Math.max(1, Math.floor(secs / b.seconds)) };
          secondWhy = `${b.id.split(".").pop()} (focused on the weapon chain, no fighting)`;
        }
      }
    }
    const queue = [{ actionId: slot.actionId, remaining: slot.remaining }, second];
    await ok("PUT", `/tinkers/${main}/queue`, { queue });
    note(`queued ${slot.remaining} x ${slot.actionId.split(".").pop()} (${slot.why}), then ${second.remaining === 10_000 ? "" : `${second.remaining} x `}${secondWhy}; ${t.crowns} Crowns, ${held(t, RATION)} Rations`);
  }

  // ---------- measurements ----------
  const end = (await ok("GET", `/tinkers/${main}`)).tinker;
  const ev = (await db.query("SELECT type, at, payload FROM events WHERE tinker_id = $1 ORDER BY seq", [main])).rows;
  const gateMet = {};
  for (const e of ev) if (e.type === "level_up") gateMet[`${e.payload.skill} >= ${e.payload.level}`] ??= new Date(e.at).getTime();
  const checkIns = ev.filter((e) => e.type === "check_in_counted");
  for (let n = 2; n <= 6; n++) gateMet[`record.check_ins >= ${n}`] = checkIns[n - 1] ? new Date(checkIns[n - 1].at).getTime() : null;
  // Needles and Favour after each sitting, from the story view.
  const needleTrack = sittings.map((s) => ({ at: s.at, q: Object.fromEntries(Object.entries(s.qualities).filter(([k]) => k.startsWith("needle.") || k.startsWith("favour."))) }));
  const bossEv = ev.filter((e) => e.type === "boss_attempted");
  const firstWin = bossEv.find((e) => e.payload.won);
  gateMet["ledger_page_1 (Scrapjaw's first kill)"] = firstWin ? new Date(firstWin.at).getTime() : null;
  const kills = ev.filter((e) => e.type === "monster_killed").length;
  const horizon = foundryAt ?? clock;
  // Pacing and Crowns, for the Cog Shop model: the day melee reached each level, every skill's XP, and Crowns in and out.
  const meleeAt = {};
  for (const e of ev) if (e.type === "level_up" && e.payload.skill === "melee") meleeAt[e.payload.level] ??= new Date(e.at).getTime();
  const totalXp = end.skills.reduce((n, s) => n + s.xp, 0);
  const crownFlow = {};
  for (const e of ev) {
    const c = Number(e.payload?.crowns ?? 0);
    if (c) crownFlow[e.type] = (crownFlow[e.type] ?? 0) + c;
  }

  ledgerEnd = await ok("GET", `/tinkers/${main}/pages`);
  const lettersArrived = ev.filter((e) => e.type === "letter_arrived").map((e) => ({ at: new Date(e.at).getTime(), id: e.payload.letter }));
  const pageDrops = [];
  for (const e of ev) for (const [item, q] of Object.entries(e.payload?.produced ?? {})) if (item.includes("ledger_page")) pageDrops.push({ at: new Date(e.at).getTime(), item, type: e.type, q });
  const killsBefore = (t) => ev.filter((e) => e.type === "monster_killed" && new Date(e.at).getTime() <= t).length;
  await app.close();
  await db.end();
  return { killsBefore, firstSession, guideTrail, forcedLocked, pagesHeld, ledgerEnd, lettersArrived, pageDrops, perDay, meleeAt, totalXp, crownFlow, shopBought, notes, refusals, districtSeen, needleTrack, scenes, seenOpen, gateMet, bossChecks, bossEv, sittings, horizon, foundryAt, end, kills, stalls };
}

const wanted = process.argv.slice(2).length ? process.argv.slice(2).map(Number) : [2, 3, 4];
const results = [];
for (const perDay of wanted) results.push(await runCadence(perDay));

const lvlOf = (end, skill) => end.skills.find((s) => s.skill === skill)?.level ?? 1;
for (const r of results) {
  console.log(`\n=============== ${r.perDay} check-ins a day, ${DAYS}-day horizon, boss threshold ${BOSS_MIN}, policy ${POLICY}, district ${DISTRICT_MODE} ===============`);
  if (VERBOSE) for (const n of r.notes) console.log(n);
  console.log("-- Act I beats (measured; day = days since the first session, Thursday 18:00)");
  for (const [id, gate] of BEATS) {
    const played = r.scenes.find((s) => s.id === id);
    const met = gate && gate in r.gateMet ? r.gateMet[gate] : undefined;
    console.log(
      `${id.split(".").pop().padEnd(20)} gate ${(gate || "-").padEnd(38)} met ${met === undefined ? "  -  " : met ? dayOf(met).padStart(5) : "never"}  first seen open ${r.seenOpen[id] ? dayOf(r.seenOpen[id]).padStart(5) : "never"}  played ${played ? `${dayOf(played.at).padStart(5)} option ${played.option}${played.odds !== null ? ` ${played.success ? "won" : "lost"} at ${Math.round(played.odds * 100)}%` : ""}` : "never"}`,
    );
  }
  const days = (r.horizon - T0) / DAY;
  const byKind = (k) => r.scenes.filter((s) => s.kind === k).length;
  const nerve = r.scenes.reduce((n, s) => n + s.nerve, 0);
  console.log(`-- story pace (measured): ${r.scenes.length} story actions (${byKind("storylet")} spine, ${byKind("district")} district, ${byKind("letter")} letters), ${nerve} Nerve, over ${days.toFixed(2)} days = ${(r.scenes.length / days).toFixed(2)} a day`);
  const sitN = r.sittings.length;
  const left = r.sittings.reduce((n, s) => n + s.nerveAfter, 0);
  console.log(`   Nerve left unspent after sittings: ${(left / sitN).toFixed(1)} on average over ${sitN} sittings`);
  console.log("-- district scenes (measured): sittings open / sittings it scored above 0 at the start / times played {option: count}");
  for (const id of DISTRICT) {
    const d = r.districtSeen[id];
    console.log(`   ${id.split(".").slice(1).join(".").padEnd(36)} ${d ? `${String(d.open).padStart(3)} / ${String(d.worth).padStart(3)} / ${String(d.played).padStart(3)} ${JSON.stringify(d.options)}` : "never open"}`);
  }
  const last = r.needleTrack.at(-1);
  const peakQ = {};
  for (const s of r.needleTrack) for (const [k, v] of Object.entries(s.q)) peakQ[k] = Math.max(peakQ[k] ?? 0, v);
  console.log(`   Needles and Favour at the end ${JSON.stringify(last?.q)}; peaks ${JSON.stringify(peakQ)}`);
  const perDayCount = {};
  for (const s of r.scenes.filter((x) => x.at > T0 + HOUR)) perDayCount[Math.floor((s.at - T0) / DAY)] = (perDayCount[Math.floor((s.at - T0) / DAY)] ?? 0) + 1;
  console.log(`   actions by day: ${JSON.stringify(perDayCount)}`);
  console.log(`   letters played: ${r.scenes.filter((s) => s.kind === "letter").map((s) => `${s.id.split(".").pop()}@d${dayOf(s.at)}`).join(", ")}`);
  console.log(`-- Scrapjaw (measured): ${r.bossEv.length} attempts; ${r.bossEv.map((e) => `d${dayOf(new Date(e.at).getTime())} ${e.payload.won ? "WON" : "lost"} ${Math.round(e.payload.winChance * 100)}%`).join(", ") || "none"}`);
  const bc = r.bossChecks;
  const peak = bc.reduce((b, c) => (c.win > (b?.win ?? -1) ? c : b), null);
  console.log(`   win chance by day: ${bc.filter((_, i) => i % 2 === 0).map((c) => `d${dayOf(c.at)} ${(c.win * 100).toFixed(1)}% (${c.weapon.split(".").pop()}, melee ${c.melee})`).join("; ")}`);
  if (peak) console.log(`   best pre-win chance ${(peak.win * 100).toFixed(1)}% at d${dayOf(peak.at)}`);
  console.log(`-- end (d${days.toFixed(2)}): skills ${JSON.stringify(Object.fromEntries(r.end.skills.map((s) => [s.skill, s.level])))}; weapon ${r.end.weapon}; ${r.end.crowns} Crowns; ${r.kills} ordinary kills; debts ${JSON.stringify(r.end.story.debts)}`);
  console.log(`   story refusals: ${JSON.stringify(r.refusals.map((x) => `${x.id.split(".").pop()}@d${dayOf(x.at)}`))}`);
  console.log(`-- Cog Shop: ${SHOP.length ? `bought d${dayOf(r.shopBought.at)}: ${r.shopBought.crates} crates, ${r.shopBought.cogs} Cogs, ${JSON.stringify(r.shopBought.buys)}` : "nothing bought"}${HOURS ? `; sittings at ${HOURS.join(",")}h` : ""}`);
  console.log(`-- pacing (measured): melee level reached by day ${JSON.stringify(Object.fromEntries([5, 10, 15, 18, 20, 21, 22].filter((l) => r.meleeAt[l]).map((l) => [l, Number(dayOf(r.meleeAt[l]))])))}; all skills ${Math.round(r.totalXp)} XP at d${days.toFixed(2)}`);
  console.log(`-- Crowns (measured, by event type, + in / - out): ${JSON.stringify(Object.fromEntries(Object.entries(r.crownFlow).map(([k, v]) => [k, Math.round(v)])))}`);
  console.log(`   Foundry Pass ${r.foundryAt ? `played d${dayOf(r.foundryAt)}` : "not reached"}; stalls ${JSON.stringify(r.stalls.map((s) => ({ d: dayOf(s.at), ...s, at: undefined })))}`);
  console.log(`-- 024: forced ${JSON.stringify(FORCE)}, first-session pay ${FIRST_PAY}`);
  const fs1 = r.firstSession;
  console.log(`   first session (ends d${dayOf(fs1.end)}): prologue.progress ${fs1.prologue}, Nerve left ${fs1.nerve}, bent nails held ${fs1.nails}, scenes ${fs1.played.map((x) => x.split(".").pop()).join(" > ")}`);
  console.log(`   guide: ${r.guideTrail.map((x) => `${x.after} -> ${x.step}`).join(" | ")}`);
  const order = PROLOGUE.map((id) => r.scenes.find((s) => s.id === id));
  const inOrder = order.every((s, i) => s && r.scenes.indexOf(s) > (i ? r.scenes.indexOf(order[i - 1]) : -1));
  console.log(`   Prologue: ${PROLOGUE.map((id, i) => `${id.split(".").pop()}@${order[i] ? `d${dayOf(order[i].at)}` : "never"}`).join(", ")}; in order ${inOrder}`);
  console.log(`   letters dealt: ${r.lettersArrived.map((l) => `${l.id.split(".").pop()}@d${dayOf(l.at)}`).join(", ")}`);
  const spine = ["act1.sprocket_row.altitude_review", "act1.sprocket_row.what_you_do_with_it", "act1.brass_exchange.foundry_pass", "act1.sprocket_row.the_night_before"];
  for (const id of [...spine, "act1.brass_exchange.gauntletts_question", "act1.rustmoor.where_she_went", "act1.lowvents.who_feeds_it", "act1.polytechnic.how_deep"]) {
    const s = r.scenes.find((x) => x.id === id);
    if (!s) { console.log(`   ${id.split(".").pop().padEnd(22)} never played`); continue; }
    const diff = Object.fromEntries(Object.entries(s.qAfter).filter(([k, v]) => (s.qBefore[k] ?? 0) !== v && (k.startsWith("ambition.") || k.endsWith(".progress") || k.startsWith("favour.board") || k.startsWith("favour.stokers") || k.startsWith("flag."))));
    console.log(`   ${id.split(".").pop().padEnd(22)} d${dayOf(s.at)} option ${s.option}${s.odds !== null ? ` at ${Math.round(s.odds * 100)}% ${s.success ? "won" : "lost"}` : ""}: ${JSON.stringify(diff)}`);
  }
  console.log(`   ambitions at end: ${JSON.stringify(Object.fromEntries(AMBITIONS.map((a) => [a, r.end.story.qualities[a] ?? 0])))}, act1.progress ${r.end.story.qualities["act1.progress"]}`);
  console.log(`   forced options locked: ${JSON.stringify(r.forcedLocked.map((x) => `${x.id.split(".").pop()}#${x.option}@d${dayOf(x.at)}`))}`);
  console.log(`   page drops: ${r.pageDrops.map((p) => `${p.item.split(".").pop()} d${dayOf(p.at)} (${p.type}, ${r.killsBefore(p.at)} ordinary kills by then)`).join("; ") || "none"}`);
  console.log(`   ledger view at end: ${r.ledgerEnd.pages.map((p) => `${p.item.split(".").pop()} held=${p.held} title=${JSON.stringify(p.title)} text=${p.text ? `${p.text.length} chars` : "null"}`).join("; ")}`);
  void lvlOf;
}

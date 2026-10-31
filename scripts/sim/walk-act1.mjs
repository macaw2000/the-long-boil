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
//   SIM_GIVE_BLADE=1 hands the player one item.rustmoor.steel_blade at the first sitting where melee is 15 or
//     more (work order 025, part 1: the gear-path test). The grocer does not stock it and the walk has no other
//     players to buy from, so the sim writes the stack straight into its own database's inventory projection,
//     with no event and no Crowns paid; engine code and content are untouched. Default off.
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
//   SIM_CONTENT=/abs/dir node scripts/sim/walk-act1.mjs   # walk a content directory other than content/
//   SIM_BOSS_WEAPON=riveting_hammer   # queue Scrapjaw only while this melee weapon or a stronger one is
//     wielded. Default: combat.json boss.reference_weapon for Scrapjaw (the Riveting Hammer), so the walk forges
//     the weapon the fight is tuned to before attacking. SIM_BOSS_WEAPON=any attacks with whatever it wields.
//   SIM_GEAR_PLACE=production|fight   # where gear goes with two queue slots (default production; see below)
//   SIM_GEAR_SHARE=0.25   # the share of each interval given to gear and tools (default 0.25; 0 makes none)
//
// Work order 031 part 1 (the assayer, 30 October 2026): the walk now makes and wears gear.
// - Gear share (superseded by "Gear placement" below for two slots): a queue entry sized to SIM_GEAR_SHARE of the interval
//   (default 0.25, work order 030's held-hour model) works toward it, taken out of the production half, so
//   production gets 0.25, gear 0.25 and fighting 0.5. With nothing to make, production keeps the whole half.
// - What to make: in each of the six combat-level slots and each skill's tool slot, the best piece the walk
//   could wear now (combat level for a piece, the skill's level for a tool) whose whole chain its skills can
//   make now, when it beats what is worn. Of those, the one with the least labour (queue seconds over the
//   whole chain) first. The target is kept until made. Its materials are reserved: training does not eat
//   them and the collectors are not sold them.
// - "Make it" (30 October 2026): gear and weapons are queued as the finished item and the engine runs the
//   chain inside that entry; the walk no longer works a gear chain step by step.
// - Gear placement, two slots (the assayer, 30 October 2026; SIM_GEAR_PLACE=balanced, the default): a reachable
//   piece goes first in slot 1, as one whole-chain go, and whichever of production and fighting is behind on planned
//   time so far follows it and fills the interval (low Rations always follow). The Boiler never idles behind a piece,
//   and the two halves stay level, as the GDD's balanced player splits the queue. Scrapjaw and a whole-chain go (a
//   weapon in reach) keep slot 1 and the piece waits a sitting. Gear's chain time, net of stores, is capped at
//   SIM_GEAR_SHARE of queue time so far (a cap; at 0.25 it never binds, since the chains take 1 to 3%).
//   Why: with two slots, a piece's sitting costs the half-interval of whichever entry it displaces, not its chain
//   time. The two placements below each charge that to one side, and the walk shows each fails item 1 or 2:
// - SIM_GEAR_PLACE=production: the piece takes slot 1 and the fight follows, each turn charged a production half
//   against a SIM_GEAR_SHARE bank; Scrapjaw, low Rations and the weapon's turn keep slot 1. Starves the gates
//   (tinkering 6 never met at 2 a day) and melee races to 24-29 before the hammer, so Scrapjaw is won at 76-97%.
//   A first try that let gear take the weapon's turn as well never forged the hammer in 21 days.
// - SIM_GEAR_PLACE=fight (the orchestrator, 30 October 2026; a policy, not a settled rule): gear never takes a
//   gate's or the weapon's turn. A reachable piece goes first ahead of the fight, replacing a rotation entry; after a
//   gate, the weapon, Rations or Scrapjaw it takes the fight's slot unless replacing a gate loses less. Gear's
//   chain time is capped at SIM_GEAR_SHARE of queue time so far (a cap, not a target). With nothing queued after
//   the piece, the Boiler idled 20% of the walk at 3 a day (62 to 110 hours at 4 and 2), and melee 20 slipped to d17.
// - Wearing: every sitting, the best held piece per slot and the best held tool per skill, through
//   PUT /tinkers/:id/gear.
// - Training: a skill is trained on the action with the least labour per XP of that skill over its whole
//   chain (was: the highest-level action whose inputs were held, which picked the 23-ingot Plumb Bob).
// - cook() makes Rations only from recipes whose every input the grocer sells (was NaN on the ladles).
// - The walk's own fight choice (bestFight) now counts worn pieces and armour, as the engine does.
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
//   Needle point raised, +1 for any item gained (Jeremy, 28 October 2026, work
//   order 023: a player with spare Nerve plays a scene for coal or Rations;
//   repeatable scenes give no item a collector buys). An item cost is allowed only if it leaves the
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

import { readFileSync } from "node:fs";
import { buildApi } from "../../engine/packages/server/dist/api.js";
import { loadContent } from "../../engine/packages/server/dist/content-loader.js";
import { connect, migrate } from "../../engine/packages/server/dist/db.js";
import { fighterFor, levelFor, planKill } from "../../engine/packages/rules/dist/index.js";

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
const GIVE_BLADE = process.env.SIM_GIVE_BLADE === "1";
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

const content = loadContent(process.env.SIM_CONTENT || undefined);
const GEAR_SHARE = Number(process.env.SIM_GEAR_SHARE ?? 0.25);
// Where gear goes with two queue slots: "production" (default) or "fight" (the orchestrator's earlier placement).
const GEAR_PLACE = process.env.SIM_GEAR_PLACE ?? "balanced";
if (!["balanced", "production", "fight"].includes(GEAR_PLACE)) throw new Error(`SIM_GEAR_PLACE must be balanced, production or fight, not ${GEAR_PLACE}`);
// Scrapjaw waits for its reference weapon (combat.json boss.reference_weapon, work order 025) or a stronger
// melee weapon: the walk forges the Riveting Hammer for the fight (work order 031 part 1, item 2). SIM_BOSS_WEAPON=any
// lifts the wait (the walk then fights with whatever it wields once the win chance reaches SIM_BOSS_MIN).
const COMBAT_FILE = JSON.parse(readFileSync(new URL(`${process.env.SIM_CONTENT ? `file://${process.env.SIM_CONTENT}/` : "../../content/"}tuning/combat.json`, import.meta.url), "utf8"));
const BOSS_WEAPON = process.env.SIM_BOSS_WEAPON === "any" ? null : process.env.SIM_BOSS_WEAPON ? `item.rustmoor.${process.env.SIM_BOSS_WEAPON}` : COMBAT_FILE.boss.reference_weapon["monster.rustmoor.scrapjaw"].item;
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
const GROCER_ITEMS = GROCER;

// Spine scenes move a progress quality; every other storylet is a repeatable district scene.
const PIECES = [...R.pieces.values()];
const TOOLS = [...R.tools.values()];
const GEAR_ITEMS = new Set([...PIECES.map((p) => p.item), ...TOOLS.map((x) => x.item)]);
const statOf = (item) => {
  const p = R.pieces.get(item);
  if (p) return p.armour + p.accuracy;
  return R.tools.get(item)?.speed ?? 0;
};
const producerOf = (item) => [...R.actions.values()].find((a) => a.outputs.some((o) => o.item === item));
// Labour: queue seconds over an action's whole chain, per go (grocer inputs cost Crowns, not time).
const labourMemo = new Map();
function labour(a) {
  if (labourMemo.has(a.id)) return labourMemo.get(a.id);
  labourMemo.set(a.id, Infinity);
  let s = a.seconds;
  for (const i of a.inputs) {
    if (i.item in GROCER_ITEMS) continue;
    const p = producerOf(i.item);
    const per = p ? labour(p) / p.outputs.find((o) => o.item === i.item).qty : Infinity;
    s += i.qty * per;
  }
  labourMemo.set(a.id, s);
  return s;
}

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
  const boilerUse = {}; // slot-1 planned seconds by kind, and the queue's total
  const bossQueued = []; // { at, win, melee, combat, loadout } each sitting Scrapjaw was queued
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
        if (d > 0) v += 1;
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
    const keepOne = new Set([SPANNER, ...WEAPONS, ...Object.values(t.worn ?? {}), ...Object.values(t.tools ?? {})]);
    for (const [item, left] of Object.entries(market.collectorLeft)) {
      const qty = Math.min(left, heldUnbound(t, item) - (keepOne.has(item) ? 1 : 0) - (reserved[item] ?? 0));
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

  // ---------- gear and tools (work order 031) ----------
  let reserved = {}; // item -> qty held back for the gear target
  let gearTarget = null; // item id
  let gearBank = 0; // seconds of queue time gear may still use
  const gearPlaced = {}; // where the piece went: "replaced rotation", "fight slot", "nothing"
  const gearLog = []; // { at, item, slot }
  const gearMade = []; // { at, item } first sitting it was held
  const combatLvl = (t) => Math.max(lvl(t, "melee"), lvl(t, "marksmanship"), lvl(t, "aetherics"));
  const slotOf = (item) => R.pieces.get(item)?.slot ?? `tool:${R.tools.get(item)?.skill}`;
  const wornIn = (t, slot) => (slot.startsWith("tool:") ? t.tools?.[slot.slice(5)] : t.worn?.[slot]) ?? null;
  const canWear = (t, item) => {
    const p = R.pieces.get(item);
    if (p) return combatLvl(t) >= p.level_required;
    const x = R.tools.get(item);
    return !!x && lvl(t, x.skill) >= x.level_required;
  };
  // `qty` of an item can be had now: from stores first (as the engine's chain does), and the rest by a chain
  // whose every step is within the walk's levels (grocer items count as reachable).
  function reachable(t, item, qty = 1, depth = 0) {
    if (item in GROCER) return true;
    const short = qty - held(t, item);
    if (short <= 0) return true;
    if (depth > 6) return false;
    const a = producerOf(item);
    if (!a || lvl(t, a.skill) < a.level_required) return false;
    const runs = Math.ceil(short / a.outputs.find((o) => o.item === item).qty);
    return a.inputs.every((i) => reachable(t, i.item, runs * i.qty, depth + 1));
  }
  // What a held-back target still needs, down its chain, net of what is held.
  function reserveFor(t, item, need, out = {}, depth = 0) {
    out[item] = (out[item] ?? 0) + need;
    const short = Math.max(0, need - held(t, item));
    const a = producerOf(item);
    if (!a || short === 0 || depth > 6) return out;
    const per = a.outputs.find((o) => o.item === item).qty;
    for (const i of a.inputs) reserveFor(t, i.item, Math.ceil(short / per) * i.qty, out, depth + 1);
    return out;
  }
  function pickGear(t) {
    const slots = [...new Set([...PIECES.map((p) => p.slot), ...TOOLS.map((x) => `tool:${x.skill}`)])];
    const cands = [];
    for (const slot of slots) {
      const items = [...PIECES, ...TOOLS].filter((g) => slotOf(g.item) === slot && canWear(t, g.item) && reachable(t, g.item));
      const best = items.sort((a, b) => statOf(b.item) - statOf(a.item))[0];
      if (!best || held(t, best.item) > 0) continue;
      const cur = wornIn(t, slot);
      if (cur && statOf(cur) >= statOf(best.item)) continue;
      cands.push({ item: best.item, labour: labour(producerOf(best.item)) });
    }
    return cands.sort((a, b) => a.labour - b.labour)[0]?.item ?? null;
  }
  async function wearBest(id, t) {
    const slots = new Set([...PIECES.map((p) => p.slot), ...TOOLS.map((x) => `tool:${x.skill}`)]);
    for (const slot of slots) {
      const best = [...GEAR_ITEMS].filter((g) => slotOf(g) === slot && held(t, g) > 0 && canWear(t, g)).sort((a, b) => statOf(b) - statOf(a))[0];
      if (!best || best === wornIn(t, slot)) continue;
      t = (await ok("PUT", `/tinkers/${id}/gear`, { item: best })).tinker;
      gearLog.push({ at: clock, item: best, slot });
      note(`wore ${best.split(".").pop()} in ${slot} (combat ${combatLvl(t)})`);
    }
    return t;
  }
  const loadout = (t) => ({
    weapon: t.weapon,
    ...Object.fromEntries(["off_hand", "head", "body", "hands", "feet", "charm"].map((s) => [s, t.worn?.[s] ?? null])),
    tools: { ...(t.tools ?? {}) },
  });

  // The ordinary monster with the best melee XP an hour, by the engine's own kill plan, with what is worn.
  function bestFight(t) {
    const w = R.weapons.get(t.weapon);
    const f = fighterFor(xpOf(t), w, R, t.armour ? R.armours.get(t.armour) : undefined, Object.values(t.worn ?? {}).map((x) => R.pieces.get(x)).filter(Boolean));
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

  const actionsBySkill = (skill) => [...R.actions.values()].filter((a) => a.skill === skill);
  const producer = (item) => [...R.actions.values()].find((a) => a.outputs.some((o) => o.item === item));

  async function buy(id, item, qty) {
    if (qty <= 0) return;
    await ok("POST", `/tinkers/${id}/grocer`, { item, qty });
  }

  // Slot-1 builders. Each returns { actionId, remaining, why } or null.
  async function cook(id, t, secs, why) {
    const level = lvl(t, "cooking");
    // Rations only: a recipe whose every input the grocer sells (the ladles' ingots made per NaN, work order 030 question 8).
    const recipes = actionsBySkill("cooking").filter((a) => a.level_required <= level && a.inputs.length > 0 && a.inputs.every((i) => i.item in GROCER) && a.outputs.some((o) => o.item === RATION)).sort((a, b) => b.level_required - a.level_required);
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
  // "Make it" runs the whole chain (Jeremy, 30 October 2026; engine boiler.ts supplyAction): an action that makes
  // gear (a weapon, piece, tool or armour) makes its missing inputs inside the same queue entry, from stores
  // first. So gear and weapons are queued as the finished item, one go, once every step is within the walk's
  // levels; only a skill gate is still worked separately (obtain trains it).
  // Queue seconds to make `qty` of an item now, net of stores (base seconds, before tool speed).
  function netLabour(t, item, qty = 1, depth = 0) {
    if (item in GROCER || depth > 6) return 0;
    const short = qty - held(t, item);
    if (short <= 0) return 0;
    const a = producerOf(item);
    if (!a) return Infinity;
    const runs = Math.ceil(short / a.outputs.find((o) => o.item === item).qty);
    return runs * a.seconds + a.inputs.reduce((n, i) => n + netLabour(t, i.item, runs * i.qty, depth + 1), 0);
  }
  function makeIt(t, item, why) {
    if (!reachable(t, item)) return null;
    const a = producerOf(item);
    return { actionId: a.id, remaining: 1, why: `${why}: ${a.id.split(".").pop()} (whole chain)` };
  }

  // free: count only stock above what the gear target holds back (every chain but the gear target's own).
  // batch: an intermediate step (a smelt) fills the time it is given, not just the quantity asked (gear chains).
  async function obtain(id, t, item, qty, secs, why, depth = 0, free = true, batch = false) {
    const a = producer(item);
    if (!a || depth > 4) return null;
    const have = (x) => held(t, x) - (free ? reserved[x] ?? 0 : 0);
    if (lvl(t, a.skill) < a.level_required) return train(id, t, a.skill, secs, `${why}: ${a.skill} ${a.level_required} for ${a.id.split(".").pop()}`, depth + 1);
    for (const input of a.inputs) {
      if (have(input.item) < input.qty * qty) return obtain(id, t, input.item, input.qty * qty - have(input.item), secs, why, depth + 1, free, batch);
    }
    const canMake = a.inputs.length ? Math.min(...a.inputs.map((i) => Math.floor(have(i.item) / i.qty))) : Infinity;
    const n = a.inputs.length ? (batch && depth > 0 ? Math.max(qty, Math.min(canMake, Math.floor(secs / a.seconds))) : qty) : Math.max(qty, Math.floor(secs / a.seconds));
    return { actionId: a.id, remaining: Math.max(1, Math.min(n, Math.floor(secs / a.seconds) || 1)), why: `${why}: ${a.id.split(".").pop()}` };
  }

  // Trains a skill on the action with the least labour per XP over its whole chain, among those its levels
  // reach; uses held inputs above what the gear target holds back, else works the chain one step.
  async function train(id, t, skill, secs, why, depth = 0) {
    if (skill === "scavenging" || skill === "prospecting") return gather(skill, t, secs, why);
    if (skill === "cooking") return cook(id, t, secs, why);
    const level = lvl(t, skill);
    const free = (item) => held(t, item) - (reserved[item] ?? 0);
    // Labour per XP for the gos that fit, counting free held inputs as already paid for (their labour is spent).
    const perXp = (a) => {
      const n = Math.max(1, Math.floor(secs / a.seconds));
      let s = n * a.seconds;
      for (const i of a.inputs) {
        if (i.item in GROCER) continue;
        const p = producerOf(i.item);
        const short = Math.max(0, n * i.qty - Math.max(0, free(i.item)));
        s += short * (p ? labour(p) / p.outputs.find((o) => o.item === i.item).qty : Infinity);
      }
      return s / (n * a.xp);
    };
    const cands = actionsBySkill(skill)
      .filter((a) => a.level_required <= level && a.inputs.length > 0 && a.inputs.every((i) => reachable(t, i.item)))
      .map((a) => ({ a, lpx: perXp(a) }))
      .sort((x, y) => x.lpx - y.lpx);
    const a = cands[0]?.a;
    if (!a) return null;
    const fit = Math.max(1, Math.floor(secs / a.seconds));
    const can = Math.min(...a.inputs.map((i) => Math.floor(free(i.item) / i.qty)));
    const lpx = cands[0].lpx.toFixed(1);
    if (can >= 1) return { actionId: a.id, remaining: Math.min(can, fit), why: `${why}: ${a.id.split(".").pop()} (${lpx} s/XP)` };
    if (depth > 3) return null;
    const missing = a.inputs.find((i) => free(i.item) < i.qty);
    return obtain(id, t, missing.item, fit * missing.qty, secs, `${why} (${a.id.split(".").pop()} at ${lpx} s/XP, inputs)`, depth + 1);
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
  let bladeGiven = null;
  for (const [k, at] of times.entries()) {
    clock = at;
    const out = await ok("POST", `/tinkers/${main}/check-in`);
    for (const s of out.ledger.stalls ?? []) stalls.push({ at: clock, ...s });
    if (SHOP.length && shopBought.at === null && clock >= T0 + SHOP_DAY * DAY) await shopUp(main);
    const won = out.events.filter((e) => e.type === "boss_attempted");
    if (won.length) note(`Scrapjaw: ${won.map((e) => `${e.won ? "WON" : "lost"} at ${Math.round(e.winChance * 100)}%`).join(", ")}${won.some((e) => e.produced?.[PAGE]) ? "; Ledger Page dropped" : ""}`);
    let { t } = await sellAndPay(main);
    if (GIVE_BLADE && !bladeGiven && lvl(t, "melee") >= 15) {
      await db.query(
        `INSERT INTO inventory (tinker_id, item, bound, qty) VALUES ($1, $2, false, 1)
         ON CONFLICT (tinker_id, item, bound) DO UPDATE SET qty = inventory.qty + 1`,
        [main, I("steel_blade")],
      );
      bladeGiven = clock;
      note(`SIM_GIVE_BLADE: handed one steel_blade (melee ${lvl(t, "melee")})`);
      t = (await ok("GET", `/tinkers/${main}`)).tinker;
    }
    t = await equipBest(main, t);
    t = await wearBest(main, t);
    for (const g of [...GEAR_ITEMS, ...WEAPONS]) if (held(t, g) > 0 && !gearMade.some((x) => x.item === g)) gearMade.push({ at: clock, item: g });
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
    const half0 = (interval / 2 / 1000) * (boosted ? 1 + R.shop.boost.percent / 100 : 1);
    // Gear: keep the target until it is held, then pick the next; reserve what it still needs.
    if (gearTarget && held(t, gearTarget) > 0) gearTarget = null;
    if (gearTarget && !reachable(t, gearTarget)) gearTarget = null;
    gearTarget ??= GEAR_SHARE > 0 ? pickGear(t) : null;
    reserved = gearTarget ? reserveFor(t, gearTarget, 1) : {};
    // Gear's cap (the orchestrator, 30 October 2026, after the gate stall): gear's chain time, summed over the walk,
    // never passes GEAR_SHARE of the queue time so far. A bank of GEAR_SHARE x interval accrues every sitting and a
    // piece is queued only when its chain time (net of stores) fits in it. With a third slot bought, gear gets its
    // own entry sized to GEAR_SHARE of the interval, out of the production half.
    const threeSlots = SHOP.includes("slot");
    gearBank += (GEAR_SHARE * interval) / 1000;
    const gearSecs = gearTarget ? (threeSlots ? (interval / 1000) * GEAR_SHARE * (boosted ? 1 + R.shop.boost.percent / 100 : 1) : half0) : 0;
    const half = threeSlots ? Math.max(60, half0 - gearSecs) : half0;
    const progress = view.qualities["act1.progress"] ?? 0;

    let slot = null;
    const boss = await bossShown(main);
    if (!t.bossesBeaten.includes(SCRAPJAW)) bossChecks.push({ at: clock, win: boss.win, rations: boss.rations, weapon: t.weapon, melee: lvl(t, "melee") });
    const fight = bestFight(t);
    const bossArmed = !BOSS_WEAPON || (R.weapons.get(t.weapon)?.power ?? 0) >= R.weapons.get(BOSS_WEAPON).power;
    if (!t.bossesBeaten.includes(SCRAPJAW) && bossArmed && boss.win >= BOSS_MIN && boss.rations === 3 && held(t, RATION) >= 9) {
      slot = { actionId: SCRAPJAW, remaining: 3, why: `Scrapjaw at ${Math.round(boss.win * 100)}% with ${t.weapon.split(".").pop()}, melee ${lvl(t, "melee")}` };
      bossQueued.push({ at: clock, win: boss.win, melee: lvl(t, "melee"), combat: combatLvl(t), loadout: loadout(t) });
    }
    // Slot 1's production entry (everything but Scrapjaw), sized to `half` seconds of work.
    const buildProd = async (t, half) => {
      let slot = null;
      if (!slot) {
        const eat = fight ? (fight.plan.rations * (interval / 1000)) / fight.plan.seconds : 0;
        if (held(t, RATION) < eat + 23) slot = await cook(main, t, half, `Rations low (${held(t, RATION)} held, next interval eats about ${Math.round(eat)})`);
      }
      // The next melee weapon comes before gear: once its whole chain is in reach, it takes slot 1 and any stock.
      const meleeNow = lvl(t, "melee");
      const weaponNext = WEAPONS.find((w) => held(t, w) === 0 && R.weapons.get(w).level_required <= meleeNow + 3 && R.weapons.get(w).power > (R.weapons.get(t.weapon)?.power ?? 0));
      if (!slot && weaponNext && reachable(t, weaponNext)) slot = makeIt(t, weaponNext, `weapon ${weaponNext.split(".").pop()} (in reach, before gear)`);
      if (!slot) {
        const gate = GATES.find((g) => progress < g.before && lvl(t, g.skill) < g.level);
        const melee = lvl(t, "melee");
        const nextWeapon = WEAPONS.find((w) => held(t, w) === 0 && R.weapons.get(w).level_required <= melee + 3 && R.weapons.get(w).power > (R.weapons.get(t.weapon)?.power ?? 0));
        const wants = [];
        // Gate and weapon alternate as before; gear never takes either's turn.
        if (gate) wants.push(() => train(main, t, gate.skill, half, `gate ${gate.skill} ${gate.level}`));
        if (nextWeapon) wants.push(async () => makeIt(t, nextWeapon, `weapon ${nextWeapon.split(".").pop()}`) ?? obtain(main, t, nextWeapon, 1, half, `weapon ${nextWeapon.split(".").pop()}`, 0, false));
        if (wants.length) {
          const order = alt++ % 2 === 0 ? wants : [...wants].reverse();
          for (const w of order) if ((slot = await w())) break;
        }
      }
      if (!slot) {
        const skills = ["scavenging", "prospecting", "smithing", "cooking", "tinkering"];
        for (let i = 0; i < skills.length && !slot; i++) slot = await train(main, t, skills[rot++ % skills.length], half, "rotation");
      }
      return slot;
    };
    const altAt = alt;
    const rotAt = rot;
    if (!slot) slot = await buildProd(t, half);
    let gearEntry = null;
    let followProd = null;
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
    if (threeSlots && gearTarget) gearEntry = makeIt(t, gearTarget, `gear ${gearTarget.split(".").pop()}`);
    const kindOf = (e) => (e.actionId === SCRAPJAW ? "scrapjaw" : e.why.startsWith("gear") ? "gear" : e.why.startsWith("weapon") ? "weapon" : e.why.startsWith("gate") ? "gate" : e.why.startsWith("Rations") ? "rations" : "rotation");
    // Planned seconds of an entry: a whole-chain entry at its chain time net of stores; Scrapjaw at 3 x 270 s.
    const plannedSecs = (e) => {
      const a = R.actions.get(e.actionId);
      if (e.actionId === SCRAPJAW) return e.remaining * R.monsters.get(SCRAPJAW).seconds_per_kill;
      if (!a) return 0;
      return Math.min(interval / 1000, e.why.includes("(whole chain)") ? netLabour(t, a.outputs[0].item) : e.remaining * a.seconds);
    };
    // Two queue slots: a reachable piece goes first ahead of the fight. It replaces a rotation entry outright
    // (the fight then starts once the piece is made). Over a gate, the weapon, Rations or Scrapjaw it never takes
    // that entry's place; it takes the fight's (the entry, then the piece, then the queue idles), unless replacing
    // a gate would lose less: fight's loss = interval - entry - chain, the gate's loss = the gate entry's time.
    if (!threeSlots && gearTarget && GEAR_PLACE === "balanced") {
      // Default (the assayer, 30 October 2026): the piece goes first in slot 1, and whichever of production and
      // fighting is behind on planned time so far follows it and fills the interval, so the Boiler never idles and
      // the two halves stay level. Gear's chain time is capped at SIM_GEAR_SHARE of queue time so far.
      // Scrapjaw and a whole-chain go (a weapon in reach) keep slot 1 and the piece waits; low Rations always follow.
      const g = makeIt(t, gearTarget, `gear ${gearTarget.split(".").pop()}`);
      const chain = netLabour(t, gearTarget);
      const k1 = kindOf(slot);
      if (!g) gearPlaced["not reachable"] = (gearPlaced["not reachable"] ?? 0) + 1;
      else if (k1 === "scrapjaw" || slot.why.includes("(whole chain)")) gearPlaced[`waited for ${k1}`] = (gearPlaced[`waited for ${k1}`] ?? 0) + 1;
      else if (chain > gearBank) gearPlaced["over the cap"] = (gearPlaced["over the cap"] ?? 0) + 1;
      else {
        const prodBehind = k1 === "rations" || (boilerUse.production ?? 0) < (boilerUse.fight ?? 0);
        gearBank -= chain;
        gearEntry = g;
        if (prodBehind) {
          // Production follows: rebuilt to fill the interval after the piece, the fight waits a sitting.
          alt = altAt;
          rot = rotAt;
          const fill = Math.max(60, interval / 1000 - chain) * (boosted ? 1 + R.shop.boost.percent / 100 : 1);
          const tt = (await ok("GET", `/tinkers/${main}`)).tinker;
          const p = (await buildProd(tt, fill)) ?? slot;
          gearPlaced[`then ${kindOf(p)}, no fight`] = (gearPlaced[`then ${kindOf(p)}, no fight`] ?? 0) + 1;
          second = { actionId: p.actionId, remaining: p.remaining };
          secondWhy = `${p.remaining} x ${p.actionId.split(".").pop()} (${p.why}; after the piece, no fight this interval)`;
          slot = g;
          followProd = p;
        } else {
          gearPlaced[`then fight, ${k1} waits`] = (gearPlaced[`then fight, ${k1} waits`] ?? 0) + 1;
          slot = g;
        }
      }
    }
    if (!threeSlots && gearTarget && GEAR_PLACE === "production") {
      // Default (the assayer, 30 October 2026): gear comes out of the production half, never the fight's. The piece
      // takes slot 1 and the fight follows it, so the Boiler never idles. A turn costs the production half it
      // displaces, counted against the bank, so gear holds at most SIM_GEAR_SHARE of queue time in slot-1 turns.
      // Scrapjaw, low Rations and the weapon's turn keep slot 1: gear takes a gate's or the rotation's turn.
      const g = makeIt(t, gearTarget, `gear ${gearTarget.split(".").pop()}`);
      const k1 = kindOf(slot);
      const keeps = k1 === "scrapjaw" || k1 === "rations" || k1 === "weapon";
      if (!g) gearPlaced["not reachable"] = (gearPlaced["not reachable"] ?? 0) + 1;
      else if (keeps) gearPlaced[`waited for ${k1}`] = (gearPlaced[`waited for ${k1}`] ?? 0) + 1;
      else if (half > gearBank) gearPlaced["over the share"] = (gearPlaced["over the share"] ?? 0) + 1;
      else {
        gearPlaced[`replaced ${k1}`] = (gearPlaced[`replaced ${k1}`] ?? 0) + 1;
        boilerUse["production half given to gear"] = (boilerUse["production half given to gear"] ?? 0) + half;
        slot = g;
        gearBank -= half;
      }
    }
    if (!threeSlots && gearTarget && GEAR_PLACE === "fight") {
      const g = makeIt(t, gearTarget, `gear ${gearTarget.split(".").pop()}`);
      const chain = netLabour(t, gearTarget);
      if (!g) gearPlaced["not reachable"] = (gearPlaced["not reachable"] ?? 0) + 1;
      else if (chain > gearBank) gearPlaced["over the cap"] = (gearPlaced["over the cap"] ?? 0) + 1;
      else {
        const k1 = kindOf(slot);
        const s1 = plannedSecs(slot);
        const fightLoss = Math.max(0, interval / 1000 - s1 - chain);
        if (k1 === "rotation" || (k1 === "gate" && s1 < fightLoss)) {
          gearPlaced[`replaced ${k1}`] = (gearPlaced[`replaced ${k1}`] ?? 0) + 1;
          slot = g;
        } else {
          gearPlaced[`fight slot after ${k1}`] = (gearPlaced[`fight slot after ${k1}`] ?? 0) + 1;
          second = { actionId: g.actionId, remaining: 1 };
          secondWhy = `${g.actionId.split(".").pop()} (${g.why}; no fight this interval, about ${Math.round(fightLoss / 60)} min lost)`;
          gearEntry = g;
        }
        gearBank -= chain;
      }
    }
    const extra = threeSlots && gearEntry ? [{ actionId: gearEntry.actionId, remaining: gearEntry.remaining }] : [];
    {
      const kind = kindOf(slot);
      const secs1 = plannedSecs(slot);
      boilerUse[kind] = (boilerUse[kind] ?? 0) + secs1;
      const total = interval / 1000;
      let gearS = kind === "gear" ? secs1 : 0;
      if (!threeSlots && gearEntry && second.actionId === gearEntry.actionId) {
        gearS = Math.min(total - secs1, netLabour(t, gearTarget));
        boilerUse.gear = (boilerUse.gear ?? 0) + gearS;
      }
      let prodS = kind === "gear" || kind === "scrapjaw" ? 0 : secs1;
      let fightS = total - secs1 - (kind === "gear" ? 0 : gearS);
      if (kind === "scrapjaw") fightS += secs1; // Scrapjaw is fighting
      if (followProd) {
        const ps = Math.min(total - secs1, plannedSecs(followProd));
        boilerUse[kindOf(followProd)] = (boilerUse[kindOf(followProd)] ?? 0) + ps;
        prodS += ps;
        fightS = 0;
      } else if (!threeSlots && gearEntry && second.actionId === gearEntry.actionId) fightS = 0;
      const idleS = Math.max(0, total - prodS - gearS - fightS - (kind === "scrapjaw" ? 0 : 0));
      boilerUse.production = (boilerUse.production ?? 0) + prodS;
      boilerUse.fight = (boilerUse.fight ?? 0) + Math.max(0, fightS);
      boilerUse.idle = (boilerUse.idle ?? 0) + idleS;
      boilerUse.total = (boilerUse.total ?? 0) + total;
    }
    const queue = [{ actionId: slot.actionId, remaining: slot.remaining }, ...extra, second];
    await ok("PUT", `/tinkers/${main}/queue`, { queue });
    note(`queued ${slot.remaining} x ${slot.actionId.split(".").pop()} (${slot.why}), ${extra.length ? `${gearEntry.remaining} x ${gearEntry.actionId.split(".").pop()} (${gearEntry.why}), ` : ""}then ${second.remaining === 10_000 ? "" : `${second.remaining} x `}${secondWhy}; ${t.crowns} Crowns, ${held(t, RATION)} Rations`);
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
  return { gearPlaced, boilerUse, bossQueued, gearLog, gearMade, endLoadout: loadout(end), killsBefore, firstSession, guideTrail, forcedLocked, pagesHeld, ledgerEnd, lettersArrived, pageDrops, perDay, meleeAt, totalXp, crownFlow, shopBought, notes, refusals, districtSeen, needleTrack, scenes, seenOpen, gateMet, bossChecks, bossEv, sittings, horizon, foundryAt, end, kills, stalls };
}

const wanted = process.argv.slice(2).length ? process.argv.slice(2).map(Number) : [2, 3, 4];
const results = [];
for (const perDay of wanted) results.push(await runCadence(perDay));

const lvlOf = (end, skill) => end.skills.find((s) => s.skill === skill)?.level ?? 1;
for (const r of results) {
  console.log(`\n=============== ${r.perDay} check-ins a day, ${DAYS}-day horizon, boss threshold ${BOSS_MIN}, policy ${POLICY}, district ${DISTRICT_MODE}, gear share ${GEAR_SHARE} placed ${GEAR_PLACE}${BOSS_WEAPON ? `, Scrapjaw only with ${BOSS_WEAPON.split(".").pop()} or better` : ""} ===============`);
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
  {
    const bq = r.bossQueued[0];
    const short = (x) => (x ? x.split(".").pop() : "empty");
    if (bq) {
      const L = bq.loadout;
      console.log(`-- gear at the first Scrapjaw attempt (measured; queued d${dayOf(bq.at)}, shown ${(bq.win * 100).toFixed(1)}%, melee ${bq.melee}, combat level ${bq.combat}):`);
      console.log(`   weapon ${short(L.weapon)}; off_hand ${short(L.off_hand)}, head ${short(L.head)}, body ${short(L.body)}, hands ${short(L.hands)}, feet ${short(L.feet)}, charm ${short(L.charm)}`);
      console.log(`   tools ${["prospecting", "scavenging", "smithing", "tinkering", "cooking"].map((k) => `${k} ${short(L.tools[k])}`).join(", ")}`);
    } else console.log("-- gear at the first Scrapjaw attempt: Scrapjaw never queued");
    const fw = r.bossEv.find((e) => e.payload.won);
    console.log(`   first win: ${fw ? `d${dayOf(new Date(fw.at).getTime())} at ${(fw.payload.winChance * 100).toFixed(1)}%` : "none in the horizon"}; per attempt: ${r.bossEv.map((e) => `${(e.payload.winChance * 100).toFixed(1)}% ${e.payload.won ? "won" : "lost"}`).join(", ") || "none"}`);
    const bu = r.boilerUse;
    const SPLIT = ["production", "fight", "idle", "total"];
    console.log(`   planned share of all Boiler time (estimated: queued counts x base seconds, whole-chain entries at chain labour net of stores, before tool speed): production ${((100 * (bu.production ?? 0)) / bu.total).toFixed(1)}%, gear ${((100 * (bu.gear ?? 0)) / bu.total).toFixed(1)}%, fighting ${((100 * (bu.fight ?? 0)) / bu.total).toFixed(1)}%, idle ${((100 * (bu.idle ?? 0)) / bu.total).toFixed(1)}%`);
    console.log(`   production and gear by kind: ${Object.entries(bu).filter(([k]) => !SPLIT.includes(k)).map(([k, v]) => `${k} ${((100 * v) / bu.total).toFixed(1)}%`).join(", ")}`);
    console.log(`   gear placement by sitting (measured): ${JSON.stringify(r.gearPlaced)}`);
    console.log(`   melee weapons first held: ${WEAPONS.map((w) => `${short(w)} ${r.gearMade.find((x) => x.item === w) ? `d${dayOf(r.gearMade.find((x) => x.item === w).at)}` : "never"}`).join(", ")}`);
    console.log(`   gear worn (measured, day put on): ${r.gearLog.map((g) => `${short(g.item)}@d${dayOf(g.at)}`).join(", ") || "none"}`);
    const EL = r.endLoadout;
    console.log(`   at the end: off_hand ${short(EL.off_hand)}, head ${short(EL.head)}, body ${short(EL.body)}, hands ${short(EL.hands)}, feet ${short(EL.feet)}, charm ${short(EL.charm)}; tools ${JSON.stringify(Object.fromEntries(Object.entries(EL.tools).map(([k, v]) => [k, short(v)])))}`);
  }
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

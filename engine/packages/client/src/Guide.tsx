// Brassbuckle's first-session guide (work order 021; GDD section 7, the
// first session), what the screen shows while it runs, and the goal line that
// follows it. The step order and each step's rule for being done live here;
// Brassbuckle's words are content. A step is done when the game's own state
// says so, so the guide can never get stuck behind something the player has
// already done.
//
// Playtesters were lost with the whole screen open and three things glowing
// at once, so the guide now points at exactly one control at a time and
// splits each step into the presses it takes ("Open Tinkering", "Pick Brass
// Spanner", "Press Start"), in plain words under her line. The screen opens a
// piece at a time as the steps reach each place; skipping or finishing the
// guide opens the rest.

import { Image, Pressable, Text, View } from "react-native";
import type { Content, GuideProgress, RoadView, Tinker } from "./api";
import { FIGHT } from "./jobs";
import type { Place } from "./SideNav";
import { colors, fonts, ui } from "./theme";
import { titleCase } from "./format";

/**
 * What the guide can point at: a place in the nav, a job's tile, the job's
 * Start button, a control on the bar, a part of the Story or Exchange, or the
 * guide card's own button.
 */
export type Pointer =
  | `place:${Place}`
  | `job:${string}`
  | "start"
  | "boiler"
  | "bench"
  | "letters"
  | "scenes"
  | "pay"
  | "card";

/** The parts of the screen the nudges can light after the guide. */
export type Target = "boiler" | "queue" | "story" | "loadout" | "exchange";

const BRASSBUCKLE = require("../assets/art/brassbuckle_portrait.png");

const SPANNER = "item.rustmoor.brass_spanner";
const SPANNER_ACTION = "action.rustmoor.tinker_brass_spanner";
const RUNT = "monster.rustmoor.rust_rat_runt";
// The first armour (work order 032), Silk Hand-Wraps from ten Runts' silk, is a
// goal line in the second sitting. The quantity is the action's input in content/actions/rustmoor.json.
const SILK = "item.rustmoor.umbrella_silk";
const WRAPS_SILK = 10;
const WRAPS = "item.rustmoor.silk_hand_wraps";

export function held(tinker: Tinker, item: string): number {
  return tinker.inventory.filter((stack) => stack.item === item).reduce((sum, stack) => sum + stack.qty, 0);
}

function prologue(tinker: Tinker): number {
  return tinker.story.qualities["prologue.progress"] ?? 0;
}

// The first sitting's three scenes take prologue.progress to these (content/storylets/prologue.sprocket_row.*).
const FIRST_SCENE_DONE = 4;
const RATS_SCENE_DONE = 8;
const HAUL_SCENE_DONE = 9;
/** Umbrella Silk the third scene, the_first_haul, asks for: one falls with every rat, so it counts the rats beaten. */
export const HAUL_RATS = 5;
/** prologue.progress when the brass plate, the third sitting's last scene, is next. */
const PLATE_FROM = 70;

export interface Step {
  id: string;
  /** Words to fall back on until the scrivener's lines are in. */
  fallback: string;
  /** `all` is every step pressed through, so a step added later stays done for a Tinker past the guide. */
  done: (tinker: Tinker, acknowledged: boolean, all: readonly string[]) => boolean;
}

// The first sitting only (docs/first-day-plan.md): the Boiler, a job, the first
// two scenes, a fight, a first haul with a scene to close it, and coming back.
// The bill, selling, armour and the rest of the Prologue come in later
// sittings as goal lines (nextGoal), not steps.
const STEPS: Step[] = [
  {
    id: "boiler",
    fallback: "The Boiler is lit: twelve hours of steam. Your workshop works that long without you.",
    done: (_, acknowledged) => acknowledged,
  },
  {
    id: "queue_spanners",
    fallback: "Fifty Brass Ingots on the bench. Make them into Brass Spanners.",
    done: (tinker) => tinker.queue.some((entry) => entry.actionId === SPANNER_ACTION) || held(tinker, SPANNER) > 0 || tinker.weapon !== null,
  },
  {
    id: "who_you_are",
    fallback: "While the spanners turn, open Story: the first scene is about you.",
    done: (tinker) => prologue(tinker) >= FIRST_SCENE_DONE,
  },
  {
    id: "first_spanner",
    fallback: "Watch the bench: the first spanner lands in under a minute.",
    done: (tinker) => held(tinker, SPANNER) > 0 || tinker.weapon !== null,
  },
  {
    id: "rats_in_the_workshop",
    fallback: "Something is scratching under the floor. Play the next scene.",
    done: (tinker) => prologue(tinker) >= RATS_SCENE_DONE,
  },
  {
    id: "equip",
    fallback: "The Rust Rats will not wait. Take up a Brass Spanner.",
    done: (tinker) => tinker.weapon !== null,
  },
  {
    id: "rats",
    fallback: "Each Rust Rat you beat drops scrap, a Crown or two, and Umbrella Silk.",
    done: (tinker) => tinker.crowns > 0 || prologue(tinker) >= 10,
  },
  {
    // The sitting ended at the first kill, about four minutes in, with nothing won (work order 041): a goal
    // to fight for and a scene to close on. A Tinker who left before this step existed is past it.
    id: "first_haul",
    fallback: "One rat proves nothing. Beat five, and bring up what they drop.",
    done: (tinker, _, all) => prologue(tinker) >= HAUL_SCENE_DONE || all.includes("come_back"),
  },
  {
    id: "come_back",
    fallback: "Queue twelve hours of work, then go. The Boiler keeps the bench busy.",
    done: (_, acknowledged) => acknowledged,
  },
];

const stepIndex = (id: string) => STEPS.findIndex((step) => step.id === id);

/**
 * Steps the player has pressed through, whether they skipped, the places the
 * guide has shown them (so a new one can say so), and whether the whole
 * screen is open: once the guide is finished or skipped, replaying it hides
 * nothing.
 */
export type GuideState = GuideProgress;

/** The step the guide is on, or null once it is done or skipped. */
export function currentStep(tinker: Tinker, state: GuideState): Step | null {
  if (state.skipped) return null;
  return STEPS.find((step) => !step.done(tinker, state.acknowledged.includes(step.id), state.acknowledged)) ?? null;
}

/** Parts of the screen that open as the guide reaches them. */
export type Feature = Place | "nerve" | "crowns" | "cogs" | `needle.${string}` | "loadout";

/** What the first sitting's guide opens, and the step that opens each. */
const GUIDE_OPENS: Partial<Record<string, string>> = {
  "skill:tinkering": "boiler",
  stores: "boiler",
  story: "who_you_are",
  nerve: "who_you_are",
  loadout: "equip",
  [`skill:${FIGHT}`]: "equip",
  crowns: "rats",
};

/**
 * After the first sitting, the rest of the screen opens as the first day
 * needs it (docs/first-day-plan.md): the Exchange and Tailoring with Pip's
 * bill, everything else once the Prologue is over. A playtester left with
 * nine new places at once at the end of the first sitting "felt dropped".
 */
const BILL_ANSWERED = 10;
/** prologue.progress once the register is played, whose goal line asks for a job not tried yet. */
export const THIRD_SITTING = 40;
const LATER_OPENS: Partial<Record<string, number>> = {
  exchange: BILL_ANSWERED,
  "skill:tailoring": BILL_ANSWERED,
  "skill:prospecting": THIRD_SITTING,
  "skill:smithing": THIRD_SITTING,
  "skill:cooking": THIRD_SITTING,
  "skill:scavenging": THIRD_SITTING,
};

/**
 * What the screen shows: while the guide runs, only what it has reached;
 * after it, the first day's places as they come; everything once the guide
 * is skipped or the Prologue is over.
 */
export function revealed(step: Step | null, state: GuideState, prologueProgress: number, visitsSincePrologue = 0): (feature: Feature) => boolean {
  // Everything opens at the visit after the plate: opening Guild and the Cog Shop the moment the Prologue ended felt like the story stopping.
  if (state.skipped || visitsSincePrologue >= 1 || (prologueProgress >= 100 && state.acknowledged.length === 0)) return () => true;
  if (step === null || state.opened) {
    return (feature) => {
      const later = LATER_OPENS[feature];
      return GUIDE_OPENS[feature] !== undefined || (later !== undefined && prologueProgress >= later);
    };
  }
  const at = stepIndex(step.id);
  return (feature) => {
    const opens = GUIDE_OPENS[feature];
    return opens !== undefined && at >= stepIndex(opens);
  };
}

/** Where a fresh workshop opens while the guide runs: the bench Brassbuckle points at. */
export const GUIDE_START: Place = "skill:tinkering";

/** A guide card's own button: press on through the step, or equip the weapon it names. */
export type GuideAction =
  | { label: string; kind: "acknowledge" }
  | { label: string; kind: "equip"; item: string }
  | { label: string; kind: "wear"; item: string };

export interface Coaching {
  /** What to press, in plain words. */
  hint: string;
  /** The one thing that glows. */
  at: Pointer;
  /** A button on the card itself, for steps the card can do. */
  action?: GuideAction;
  /** A goal and how far along it is, such as Crowns toward Pip's bill; the unit is Crowns unless named. */
  goal?: { label: string; have: number; need: number; unit?: string };
}

/** How long the queue keeps the bench busy: the head's own go time, the rest at each job's listed time. */
export function queuedMs(tinker: Tinker, content: Content): number {
  const each = (id: string) =>
    1000 * (content.actions.find((action) => action.id === id)?.seconds ?? content.monsters.find((monster) => monster.id === id)?.seconds_per_kill ?? 60);
  const total = tinker.queue.reduce((sum, entry, index) => sum + (index === 0 && tinker.headMs ? tinker.headMs : each(entry.actionId)) * entry.remaining, 0);
  return Math.max(0, total - tinker.progressMs);
}

/** Below this many Rations a night of Rust Rats may run the Tinker out (the first night ate about 150). */
export const LOW_RATIONS = 150;

/** Leaving the first sitting asks for the bench to be busy nearly all twelve hours. */
const NIGHT_MS = 11 * 3_600_000;

export interface GuideContext {
  place: Place;
  /** The job tile picked on the current skill page. */
  chosen: string | null;
  /** Milliseconds until the job at the bench lands one. */
  nextInMs: number;
  wide: boolean;
  /** The step's button label, from content. */
  button?: string;
  /** How long the queue keeps the bench busy (queuedMs). */
  queuedMs: number;
  /** The job at work, if any. */
  queueHead: string | null;
}

/** Open a place, pick a job's tile, press Start: the three presses every job takes. */
function toJob(context: GuideContext, place: Place, placeName: string, job: string, jobName: string): Pick<Coaching, "hint" | "at"> {
  if (context.place !== place) {
    // A phone reaches the skills through Work on the bottom bar, then the strip of skill icons.
    const where = context.wide ? " in the menu on the left" : context.place.startsWith("skill:") ? " in the row of icons" : ": press Work at the bottom";
    return { hint: `Open ${placeName}${where}.`, at: `place:${place}` };
  }
  if (context.chosen !== job) return { hint: `Pick ${jobName}.`, at: `job:${job}` };
  // Start now keeps the job at work behind the new one; playtesters asked "did I just stop my crafting?", so say so.
  if (context.queueHead && context.queueHead !== job) return { hint: "Press Start now. The bench does one job at a time: this one goes first, and the job at work waits behind it.", at: "start" };
  return { hint: "Press Start.", at: "start" };
}

/** Open Story, then play the scene: the two presses every scene takes. */
function toScene(context: GuideContext, open = "Open Story."): Pick<Coaching, "hint" | "at"> {
  return context.place === "story" ? { hint: "Play the scene under Open to you, and pick an answer.", at: "scenes" } : { hint: open, at: "place:story" };
}

/** What the player should press now, worked out from the step and where they are. */
export function coach(step: Step, tinker: Tinker, context: GuideContext): Coaching {
  const fighting = tinker.queue.some((entry) => entry.actionId === RUNT);
  switch (step.id) {
    case "boiler":
      return { hint: "Press Open the valve to light the Boiler.", at: "boiler", action: { label: context.button ?? "Open the valve", kind: "acknowledge" } };
    case "queue_spanners":
      return toJob(context, "skill:tinkering", "Tinkering", SPANNER_ACTION, "Brass Spanner");
    case "first_spanner": {
      const left = Math.max(1, Math.ceil(context.nextInMs / 1000));
      return { hint: `Your first Brass Spanner lands in ${left}s. Watch the bench at the top.`, at: "bench" };
    }
    case "who_you_are":
    case "rats_in_the_workshop":
      return toScene(context);
    case "equip":
      return { hint: "Equip your Brass Spanner.", at: "card", action: { label: "Equip Brass Spanner", kind: "equip", item: SPANNER } };
    case "rats":
      if (fighting) {
        const left = Math.max(1, Math.ceil(context.nextInMs / 1000));
        return { hint: `You are fighting a Rust Rat. The first win lands in about ${left}s.`, at: "bench" };
      }
      return toJob(context, `skill:${FIGHT}`, "Fight", RUNT, "Rust Rat Runt");
    case "first_haul": {
      const beaten = Math.min(HAUL_RATS, held(tinker, SILK));
      const goal = { label: "Rust Rats beaten", have: beaten, need: HAUL_RATS, unit: "" };
      if (beaten >= HAUL_RATS) return { ...toScene(context, "Five rats down. Open Story: something has come of it."), goal };
      if (!fighting) return { ...toJob(context, `skill:${FIGHT}`, "Fight", RUNT, "Rust Rat Runt"), goal };
      const left = Math.max(1, Math.ceil(context.nextInMs / 1000));
      return { hint: `Beat ${HAUL_RATS} Rust Rats. The next one falls in about ${left}s.`, at: "bench", goal };
    }
    case "come_back": {
      if (context.queuedMs >= NIGHT_MS) return { hint: "All set. Press Leave it running.", at: "card", action: { label: context.button ?? "Leave it running", kind: "acknowledge" } };
      // A playtester queued an hour and came back puzzled by "twelve hours": fill the night with fights, which need nothing.
      const hours = Math.floor(context.queuedMs / 3_600_000);
      const job = toJob(context, `skill:${FIGHT}`, "Fight", RUNT, "Rust Rat Runt");
      const press = job.at === "start" ? "Press Fill, then Start now." : job.hint;
      return { ...job, hint: `Your queue has work for ${hours ? `${hours}h` : "under an hour"} of the Boiler's twelve. ${press}` };
    }
    default:
      return { hint: step.fallback, at: "card" };
  }
}

/**
 * After the guide: what is worth doing now. Several may glow at once; each is
 * a plain fact about the Tinker, not a chore list.
 */
export function nudges(tinker: Tinker, content: Content, now: number): Set<Target> {
  const targets = new Set<Target>();
  if (tinker.queue.length === 0) targets.add("queue");
  const steamLeft = new Date(tinker.steamUntil).getTime() - now;
  if (steamLeft < 2 * 3_600_000) targets.add("boiler");
  if (tinker.story.letters > 0 || (tinker.story.openScenes > 0 && tinker.story.nerve >= tinker.story.nerveCap)) targets.add("story");
  if (tinker.story.debts.some((debt) => tinker.crowns >= debt.crowns)) targets.add("exchange");
  if (betterWeapon(tinker, content)) targets.add("loadout");
  return targets;
}

function betterWeapon(tinker: Tinker, content: Content): string | null {
  const level = (skill: string) => tinker.skills.find((entry) => entry.skill === skill)?.level ?? 1;
  const power = (item: string | null) => content.weapons.find((weapon) => weapon.item === item)?.power ?? 0;
  return (
    content.weapons.find(
      (weapon) => held(tinker, weapon.item) > 0 && level(weapon.style) >= weapon.level_required && weapon.power > power(tinker.weapon),
    )?.item ?? null
  );
}

/** After the guide, the one thing most worth doing next, as a line on the goal bar. */
/** The two actions asked for between third-sitting scenes (decision 22), keyed by prologue.progress after it. */
const BETWEEN_SCENES: Record<number, { text: string; place: Place }> = {
  40: { text: "Start a job you have not tried yet.", place: "skill:prospecting" },
  50: { text: "Start a fight in Rustmoor.", place: `skill:${FIGHT}` },
};

/** The guide-state mark that the player has acted since the third-sitting scene that left progress here. */
export const actedMark = (progress: number) => `acted:${progress}`;
export const awaitsAction = (progress: number) => progress in BETWEEN_SCENES;

export interface Goal {
  text: string;
  /** Where Go leads; null when there is nothing to do yet, so the line stands without a button. */
  place: Place | null;
  /** Who says it, when the line is one of Brassbuckle's from the guide file. */
  speaker?: string;
}

export function nextGoal(tinker: Tinker, content: Content, now: number, name: (id: string) => string, guide: GuideState, saleLeft: number | null = null): Goal | null {
  const steamLeft = new Date(tinker.steamUntil).getTime() - now;
  // The later sittings speak in Brassbuckle's words from the guide file, falling back to plain ones.
  const said = (id: string, plain: string, place: Place | null): Goal => {
    const entry = content.guide.find((candidate) => candidate.id === id);
    return entry ? { text: entry.line, place, speaker: entry.speaker } : { text: plain, place };
  };
  const debt = tinker.story.debts.find((candidate) => tinker.crowns >= candidate.crowns);
  if (debt) return { text: `Pay ${debt.label}: you have the ${debt.crowns.toLocaleString()} Crowns.`, place: "exchange" };
  if (tinker.story.letters > 0) return prologue(tinker) < BILL_ANSWERED ? said("pips_bill", "A letter is waiting in Story.", "story") : { text: "A letter is waiting in Story.", place: "story" };
  if (tinker.queue.length === 0) return { text: "The bench is idle. Pick a job and press Start.", place: "skill:tinkering" };
  if (steamLeft <= 0) return { text: "The Boiler is dry. Checking in raises steam.", place: "skill:tinkering" };
  const better = betterWeapon(tinker, content);
  if (better) return { text: `Equip your ${name(better)} in the Loadout: it hits harder.`, place: "stores" };
  // In the third sitting, one action between each pair of scenes, so story and work alternate.
  const progress = prologue(tinker);
  const fightingAlready = progress === 50 && tinker.queue[0]?.actionId.startsWith("monster.");
  if (awaitsAction(progress) && !fightingAlready && !guide.acknowledged.includes(actedMark(progress))) return BETWEEN_SCENES[progress]!;
  if (tinker.story.openScenes > 0 && tinker.story.nerve > 0) {
    return progress >= PLATE_FROM && progress < 100 ? said("brass_plate", "Scenes are open in Story.", "story") : { text: "Scenes are open in Story, and you have Nerve to play them.", place: "story" };
  }
  // The first armour comes after the sitting's scenes (playtesters met it with a night of fights queued): Silk Hand-Wraps, from the rats' silk.
  if (progress >= BILL_ANSWERED && Object.keys(tinker.worn).length === 0) {
    if (held(tinker, WRAPS) > 0) return { text: `Wear your ${name(WRAPS)} in the Loadout.`, place: "stores" };
    return said("first_armour", "Make something to wear.", held(tinker, SILK) >= WRAPS_SILK ? "skill:tailoring" : `skill:${FIGHT}`);
  }
  // The bench will stop before the Boiler does: say so before anything that can wait, rather than "All in hand".
  const queued = queuedMs(tinker, content);
  if (queued + 3_600_000 < steamLeft) {
    const head = tinker.queue[0]!;
    const skill = content.actions.find((action) => action.id === head.actionId)?.skill ?? FIGHT;
    return { text: `The bench has work for ${Math.round(queued / 360_000) / 10}h, the Boiler steam for ${Math.round(steamLeft / 360_000) / 10}h. Queue more so nothing sits idle.`, place: `skill:${skill}` };
  }
  // Fewer Rations than a night of fights eats: say where more come from.
  if (held(tinker, content.ration.item) < LOW_RATIONS) return { text: "Rations are running low: cook more at Cooking, with what the grocer's counter in the Exchange sells.", place: "exchange" };
  // An unpaid bill comes after everything that can be done now: once the week's sale is used, it is only fighting.
  const unpaid = tinker.story.debts[0];
  if (unpaid) {
    // Once the week's sale is used the window can do nothing more, so the line points at the fights.
    const line = saleLeft === 0 ? said("sale_done", "The rats' Crowns will make up the rest.", null) : said("pay_bill", "Sell rat scrap at the Counting-House window.", "exchange");
    return { ...line, text: `${line.text} (${tinker.crowns.toLocaleString()} of ${unpaid.crowns.toLocaleString()} Crowns.)` };
  }
  // Nothing else told a player to train, and a skill gate could hold the story back for weeks (decision 17).
  const gate = tinker.story.nextGate;
  if (gate && (tinker.story.qualities["record.visits_since_prologue"] ?? 0) >= 1) {
    const bench = content.actions.some((action) => action.skill === gate.skill);
    return { text: `Train ${titleCase(gate.skill)} to ${gate.level}: a scene waits on it.`, place: bench ? `skill:${gate.skill}` : `skill:${FIGHT}` };
  }
  return null;
}

export function GuideCard({
  step,
  content,
  coaching,
  onAction,
  onSkip,
}: {
  step: Step;
  content: Content;
  coaching: Coaching;
  onAction: (action: GuideAction) => void;
  onSkip: () => void;
}) {
  const words = content.guide.find((entry) => entry.id === step.id);
  const position = STEPS.indexOf(step);
  return (
    <View style={[ui.panel, { borderColor: GOLD, borderWidth: 2, flexDirection: "row", gap: 12, alignItems: "flex-start", padding: 12 }]}>
      <Image
        source={BRASSBUCKLE}
        style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: colors.brass, backgroundColor: colors.soot }}
        accessibilityLabel="Professor Brassbuckle"
      />
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <Text style={[ui.muted, { color: colors.brass, fontSize: 12 }]}>{words?.speaker ?? "Professor Brassbuckle"}</Text>
          <View style={{ flexDirection: "row", gap: 4 }} accessibilityLabel={`Step ${position + 1} of ${STEPS.length}`}>
            {STEPS.map((entry, index) => (
              <View
                key={entry.id}
                style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: index < position ? colors.brass : index === position ? GOLD : colors.panelEdge }}
              />
            ))}
          </View>
        </View>
        <Text style={[ui.muted, { fontStyle: "italic", lineHeight: 19 }]}>{words?.line ?? step.fallback}</Text>
        <Text style={{ color: GOLD, fontFamily: fonts.serif, fontSize: 17, fontWeight: "700", lineHeight: 23 }}>▶ {coaching.hint}</Text>
        {coaching.goal && <GoalMeter {...coaching.goal} />}
        <View style={{ flexDirection: "row", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          {coaching.action && (
            <Pressable
              style={[ui.button, { alignSelf: "flex-start", backgroundColor: GOLD, paddingHorizontal: 16 }]}
              onPress={() => onAction(coaching.action!)}
              accessibilityRole="button"
            >
              <Text style={[ui.buttonText, { color: colors.soot }]}>{coaching.action.label}</Text>
            </Pressable>
          )}
          <Pressable onPress={onSkip} accessibilityRole="button">
            <Text style={[ui.muted, { fontSize: 12 }]}>Skip the guide</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function GoalMeter({ label, have, need, unit = "Crowns" }: { label: string; have: number; need: number; unit?: string }) {
  return (
    <View style={{ gap: 3 }}>
      <Text style={[ui.muted, { fontSize: 12 }]}>
        {label}: <Text style={[ui.number, { color: have >= need ? colors.verdigris : colors.brass }]}>{have}</Text> / {need} {unit}
      </Text>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.soot, overflow: "hidden" }}>
        <View style={{ width: `${Math.min(1, have / need) * 100}%`, height: "100%", backgroundColor: have >= need ? colors.verdigris : colors.brass }} />
      </View>
    </View>
  );
}

/** The road in small, on the NEXT bar: the section's stops, leading to Story. */
export function RoadDots({ road, onPress }: { road: RoadView; onPress: () => void }) {
  const reached = road.stops.filter((stop) => stop.reached).length;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Story: ${reached} of ${road.stops.length} stops reached`} style={{ flexDirection: "row", gap: 3 }}>
      {road.stops.map((stop, index) => (
        <View key={index} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: stop.reached ? colors.brass : colors.panelEdge }} />
      ))}
    </Pressable>
  );
}

/** After the guide, one line saying what to do next, and a way back into the guide. */
export function GoalBar({
  goal,
  road,
  quiet = "All in hand. The workshop runs while you are away.",
  onGo,
  onReplay,
}: {
  goal: Goal | null;
  road: RoadView | null;
  /** The line when nothing wants doing: until when the workshop runs, and when the story goes on (restLine). */
  quiet?: string;
  onGo: (place: Place) => void;
  onReplay: () => void;
}) {
  return (
    <View style={[ui.panel, { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 12 }]}>
      {road && <RoadDots road={road} onPress={() => onGo("story")} />}
      <Text style={[ui.muted, { fontSize: 11, letterSpacing: 1, color: colors.brass }]}>NEXT</Text>
      <Text style={[ui.text, { flex: 1 }]}>
        {goal?.speaker && <Text style={{ color: colors.brass }}>{goal.speaker}: </Text>}
        {goal ? goal.text : quiet}
      </Text>
      {goal?.place && (
        <Pressable onPress={() => onGo(goal.place!)} accessibilityRole="button" style={[ui.button, { paddingHorizontal: 12, paddingVertical: 4 }]}>
          <Text style={ui.buttonText}>Go</Text>
        </Pressable>
      )}
      <Pressable onPress={onReplay} accessibilityRole="button" accessibilityLabel="Replay the guide">
        <Text style={[ui.muted, { fontSize: 12 }]}>Guide</Text>
      </Pressable>
    </View>
  );
}

/** The guide's own glow colour: brighter than the brass the rest of the screen is drawn in. */
export const GOLD = "#f2c14e";

const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** What a Tinker leaving now comes back to: how long the queue and the Boiler run, and when the story goes on. */
export interface Rest {
  /** When the bench stops: the queue's end or the Boiler's, whichever is first. */
  workUntil: number;
  /** The queue outlasts the Boiler's steam. */
  boilerFirst: boolean;
  /** When a visit next counts for the story, if scenes wait on one. */
  storyAt: number | null;
  /** The job at work, by name, and how many goes are queued. */
  job: string | null;
  goes: number;
}

export function rest(tinker: Tinker, content: Content, now: number, name: (id: string) => string, nextVisitAt: string | null): Rest {
  const steamUntil = new Date(tinker.steamUntil).getTime();
  const queueEnds = now + queuedMs(tinker, content);
  const head = tinker.queue[0];
  const visit = nextVisitAt ? new Date(nextVisitAt).getTime() : null;
  // Only a scene that waits on a visit makes the time worth saying.
  const waitsOnVisit = tinker.story.road?.next?.state === "waiting" && tinker.story.road.next.needs.some(([need]) => need.startsWith("record."));
  return {
    workUntil: Math.min(steamUntil, queueEnds),
    boilerFirst: steamUntil <= queueEnds,
    storyAt: waitsOnVisit ? visit : null,
    job: head ? (content.monsters.find((monster) => monster.id === head.actionId)?.name ?? name(content.actions.find((action) => action.id === head.actionId)?.outputs[0]?.item ?? head.actionId)) : null,
    goes: head?.remaining ?? 0,
  };
}

/** The goal bar's line when nothing wants doing: a calm status and when it changes, never bare "All in hand". */
export function restLine(at: Rest, now: number): string {
  const work = at.workUntil > now ? `All in hand. The bench has work until ${clock(at.workUntil)}.` : "All in hand.";
  const story = at.storyAt === null ? "" : at.storyAt > now ? ` The story goes on when you are next back, after ${clock(at.storyAt)}.` : " The story goes on when you are next back.";
  return work + story;
}

/**
 * The end of the first sitting. "All in hand" read flat to every cold reader
 * and left nothing to come back for: the card says what the workshop will do
 * while the player is gone, when the story goes on, and that the tab can close.
 */
export function SendOff({ at, now, onClose }: { at: Rest; now: number; onClose: () => void }) {
  const waiting = [
    at.job && at.goes > 0 ? `${at.goes.toLocaleString()} × ${at.job} on the bench, working until ${clock(at.workUntil)}${at.boilerFirst ? ", when the Boiler runs down" : ""}.` : null,
    "Everything it makes will be in your Stores, with a tally of the lot.",
    at.storyAt !== null && at.storyAt > now ? `Whatever is in the tube. The story goes on after ${clock(at.storyAt)}.` : "Whatever is in the tube.",
  ].filter((line): line is string => line !== null);
  return (
    <View style={[ui.panel, { borderColor: GOLD, borderWidth: 2, flexDirection: "row", gap: 12, alignItems: "flex-start", padding: 12 }]}>
      <Image
        source={BRASSBUCKLE}
        style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: colors.brass, backgroundColor: colors.soot }}
        accessibilityLabel="Professor Brassbuckle"
      />
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={{ color: GOLD, fontFamily: fonts.serif, fontSize: 17, fontWeight: "700", lineHeight: 23 }}>No. 9 is running. You can go.</Text>
        <Text style={ui.muted}>Waiting for you when you come back:</Text>
        {waiting.map((line) => (
          <Text key={line} style={[ui.text, { lineHeight: 20 }]}>
            • {line}
          </Text>
        ))}
        <Text style={[ui.muted, { fontSize: 12 }]}>Close the tab whenever you like: the workshop does not need you watching. Stay, and the rats keep falling.</Text>
        <Pressable onPress={onClose} accessibilityRole="button" style={[ui.button, { alignSelf: "flex-start", paddingHorizontal: 16 }]}>
          <Text style={ui.buttonText}>Right</Text>
        </Pressable>
      </View>
    </View>
  );
}

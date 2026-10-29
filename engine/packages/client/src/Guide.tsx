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

import { Pressable, Text, View } from "react-native";
import type { Content, GuideProgress, Tinker } from "./api";
import { FIGHT, SKILL_ORDER } from "./jobs";
import type { Place } from "./SideNav";
import { colors, fonts, ui } from "./theme";

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

const SPANNER = "item.rustmoor.brass_spanner";
const SPANNER_ACTION = "action.rustmoor.tinker_brass_spanner";
const RUNT = "monster.rustmoor.rust_rat_runt";

function held(tinker: Tinker, item: string): number {
  return tinker.inventory.filter((stack) => stack.item === item).reduce((sum, stack) => sum + stack.qty, 0);
}

function prologue(tinker: Tinker): number {
  return tinker.story.qualities["prologue.progress"] ?? 0;
}

const billPaid = (tinker: Tinker) => prologue(tinker) >= 10 && tinker.story.backRent === 0;

export interface Step {
  id: string;
  /** Words to fall back on until the scrivener's lines are in. */
  fallback: string;
  done: (tinker: Tinker, acknowledged: boolean) => boolean;
}

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
    id: "first_spanner",
    fallback: "Watch the bench: the first spanner lands in under a minute.",
    done: (tinker) => held(tinker, SPANNER) > 0 || tinker.weapon !== null,
  },
  {
    id: "pips_bill",
    fallback: "A letter has come down the tube.",
    done: (tinker) => prologue(tinker) >= 10,
  },
  {
    id: "equip",
    fallback: "The Rust Rats will not wait. Take up a Brass Spanner.",
    done: (tinker) => tinker.weapon !== null,
  },
  {
    id: "rats",
    fallback: "Each Rust Rat you beat pays Crowns and rat scrap.",
    done: (tinker) => tinker.crowns > 0 || billPaid(tinker),
  },
  {
    id: "pay_bill",
    fallback: "Pip would like the back rent.",
    done: billPaid,
  },
  {
    id: "brass_plate",
    fallback: "The Row has more to say before the day is out, and there is something in the workbench.",
    done: (tinker) => prologue(tinker) >= 100,
  },
  {
    id: "come_back",
    fallback: "Queue twelve hours of work, then go. The Boiler keeps the bench busy.",
    done: (tinker, acknowledged) => acknowledged && tinker.queue.length > 0,
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
  return STEPS.find((step) => !step.done(tinker, state.acknowledged.includes(step.id))) ?? null;
}

/** Parts of the screen that open as the guide reaches them. */
export type Feature = Place | "nerve" | "crowns" | "cogs" | `needle.${string}` | "loadout";

/**
 * What the screen shows: everything once the guide is over, and before then
 * only what the guide has reached.
 */
export function revealed(step: Step | null, state: GuideState): (feature: Feature) => boolean {
  if (step === null || state.opened) return () => true;
  const at = stepIndex(step.id);
  const from: Partial<Record<string, string>> = {
    "skill:tinkering": "boiler",
    stores: "boiler",
    loadout: "first_spanner",
    story: "pips_bill",
    nerve: "pips_bill",
    "needle.arrears": "pips_bill",
    [`skill:${FIGHT}`]: "equip",
    crowns: "rats",
    exchange: "pay_bill",
  };
  // The last step asks for twelve hours of work, so every skill opens for it.
  for (const skill of SKILL_ORDER) from[`skill:${skill}`] ??= "come_back";
  return (feature) => {
    const opens = from[feature];
    return opens !== undefined && at >= stepIndex(opens);
  };
}

/** Where a fresh workshop opens while the guide runs: the bench Brassbuckle points at. */
export const GUIDE_START: Place = "skill:tinkering";

/** A guide card's own button: press on through the step, or equip the weapon it names. */
export type GuideAction = { label: string; kind: "acknowledge" } | { label: string; kind: "equip"; item: string };

export interface Coaching {
  /** What to press, in plain words. */
  hint: string;
  /** The one thing that glows. */
  at: Pointer;
  /** A button on the card itself, for steps the card can do. */
  action?: GuideAction;
  /** A goal and how far along it is, such as Crowns toward Pip's bill. */
  goal?: { label: string; have: number; need: number };
}

export interface GuideContext {
  place: Place;
  /** The job tile picked on the current skill page. */
  chosen: string | null;
  /** Milliseconds until the job at the bench lands one. */
  nextInMs: number;
  wide: boolean;
  /** The step's button label, from content. */
  button?: string;
}

/** Open a place, pick a job's tile, press Start: the three presses every job takes. */
function toJob(context: GuideContext, place: Place, placeName: string, job: string, jobName: string): Pick<Coaching, "hint" | "at"> {
  if (context.place !== place) {
    // A phone reaches the skills through Work on the bottom bar, then the strip of skill icons.
    const where = context.wide ? " in the menu on the left" : context.place.startsWith("skill:") ? " in the row of icons" : ": press Work at the bottom";
    return { hint: `Open ${placeName}${where}.`, at: `place:${place}` };
  }
  if (context.chosen !== job) return { hint: `Pick ${jobName}.`, at: `job:${job}` };
  return { hint: "Press Start.", at: "start" };
}

/** What the player should press now, worked out from the step and where they are. */
export function coach(step: Step, tinker: Tinker, context: GuideContext): Coaching {
  const debt = tinker.story.debts[0];
  const rentGoal = debt ? { label: "Pip's back rent", have: Math.min(tinker.crowns, debt.crowns), need: debt.crowns } : undefined;
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
    case "pips_bill":
      return context.place === "story"
        ? { hint: "Read Pip's letter, then press one of its answers.", at: "letters" }
        : { hint: "A letter has come. Open Story.", at: "place:story" };
    case "equip":
      return { hint: "Equip your Brass Spanner.", at: "card", action: { label: "Equip Brass Spanner", kind: "equip", item: SPANNER } };
    case "rats":
      if (fighting) {
        const left = Math.max(1, Math.ceil(context.nextInMs / 1000));
        return { hint: `Your Tinker is fighting a Rust Rat. The first win pays Crowns in about ${left}s.`, at: "bench", goal: rentGoal };
      }
      return { ...toJob(context, `skill:${FIGHT}`, "Fight", RUNT, "Rust Rat Runt"), goal: rentGoal };
    case "pay_bill":
      if (debt && tinker.crowns < debt.crowns) {
        return fighting
          ? { hint: "Your Tinker is fighting rats. Each win pays Crowns; wait for enough to pay Pip.", at: "bench", goal: rentGoal }
          : { ...toJob(context, `skill:${FIGHT}`, "Fight", RUNT, "Rust Rat Runt"), goal: rentGoal };
      }
      return context.place === "exchange"
        ? { hint: "Press Pay under Bills.", at: "pay", goal: rentGoal }
        : { hint: "You have the Crowns. Open the Exchange.", at: "place:exchange", goal: rentGoal };
    case "brass_plate":
      if (context.place !== "story") return { hint: "Open Story: the Row has more to tell you.", at: "place:story" };
      if (tinker.story.letters > 0) return { hint: "Answer the letter waiting here.", at: "letters" };
      if (tinker.story.nerve === 0) return { hint: "You are out of Nerve. It refills with time; keep the bench busy until then.", at: "scenes" };
      return { hint: "Play a scene under Open to you. Each costs Nerve.", at: "scenes" };
    case "come_back":
      return tinker.queue.length === 0
        ? { hint: "Pick any job and press Start, with enough for twelve hours.", at: context.place.startsWith("skill:") ? "card" : "place:skill:tinkering" }
        : { hint: "All set. Press Leave it running.", at: "card", action: { label: context.button ?? "Leave it running", kind: "acknowledge" } };
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
export function nextGoal(tinker: Tinker, content: Content, now: number, name: (id: string) => string): { text: string; place: Place } | null {
  const steamLeft = new Date(tinker.steamUntil).getTime() - now;
  const debt = tinker.story.debts.find((candidate) => tinker.crowns >= candidate.crowns);
  if (debt) return { text: `Pay ${debt.label}: you have the ${debt.crowns} Crowns.`, place: "exchange" };
  if (tinker.story.letters > 0) return { text: "A letter is waiting in Story.", place: "story" };
  if (tinker.queue.length === 0) return { text: "The bench is idle. Pick a job and press Start.", place: "skill:tinkering" };
  if (steamLeft <= 0) return { text: "The Boiler is dry. Checking in raises steam.", place: "skill:tinkering" };
  const better = betterWeapon(tinker, content);
  if (better) return { text: `Equip your ${name(better)} in the Loadout: it hits harder.`, place: "stores" };
  if (tinker.story.openScenes > 0 && tinker.story.nerve > 0) return { text: "Scenes are open in Story, and you have Nerve to play them.", place: "story" };
  const unpaid = tinker.story.debts[0];
  if (unpaid) return { text: `${unpaid.label}: ${tinker.crowns} of ${unpaid.crowns} Crowns.`, place: "exchange" };
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
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brassDim, alignItems: "center", justifyContent: "center" }}>
        <Text style={[ui.heading, { color: colors.soot }]}>B</Text>
      </View>
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

function GoalMeter({ label, have, need }: { label: string; have: number; need: number }) {
  return (
    <View style={{ gap: 3 }}>
      <Text style={[ui.muted, { fontSize: 12 }]}>
        {label}: <Text style={[ui.number, { color: have >= need ? colors.verdigris : colors.brass }]}>{have}</Text> / {need} Crowns
      </Text>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.soot, overflow: "hidden" }}>
        <View style={{ width: `${Math.min(1, have / need) * 100}%`, height: "100%", backgroundColor: have >= need ? colors.verdigris : colors.brass }} />
      </View>
    </View>
  );
}

/** After the guide, one line saying what to do next, and a way back into the guide. */
export function GoalBar({ goal, onGo, onReplay }: { goal: { text: string; place: Place } | null; onGo: (place: Place) => void; onReplay: () => void }) {
  return (
    <View style={[ui.panel, { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 12 }]}>
      <Text style={[ui.muted, { fontSize: 11, letterSpacing: 1, color: colors.brass }]}>NEXT</Text>
      <Text style={[ui.text, { flex: 1 }]}>{goal ? goal.text : "All in hand. The workshop runs while you are away."}</Text>
      {goal && (
        <Pressable onPress={() => onGo(goal.place)} accessibilityRole="button" style={[ui.button, { paddingHorizontal: 12, paddingVertical: 4 }]}>
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

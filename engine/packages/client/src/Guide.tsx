// Brassbuckle's first-session guide (work order 021; GDD section 7, the
// first session) and the "ready now" nudges that follow it. The step order
// and each step's rule for being done live here; the words are content.
// A step is done when the game's own state says so, so the guide can never
// get stuck behind something the player has already done.

import { Pressable, Text, View } from "react-native";
import type { Content, Tinker } from "./api";
import { colors, ui } from "./theme";

/** The parts of the screen the guide and the nudges can point at. */
export type Target = "boiler" | "queue" | "bench" | "story" | "loadout" | "exchange";

const SPANNER = "item.rustmoor.brass_spanner";
const SPANNER_ACTION = "action.rustmoor.tinker_brass_spanner";

function held(tinker: Tinker, item: string): number {
  return tinker.inventory.filter((stack) => stack.item === item).reduce((sum, stack) => sum + stack.qty, 0);
}

function prologue(tinker: Tinker): number {
  return tinker.story.qualities["prologue.progress"] ?? 0;
}

interface Step {
  id: string;
  target: Target;
  /** Words to fall back on until the scrivener's lines are in. */
  fallback: string;
  done: (tinker: Tinker, acknowledged: boolean) => boolean;
}

const STEPS: Step[] = [
  {
    id: "boiler",
    target: "boiler",
    fallback: "The Boiler is lit: twelve hours of steam. Your workshop works that long without you.",
    done: (_, acknowledged) => acknowledged,
  },
  {
    id: "queue_spanners",
    target: "queue",
    fallback: "Press Queue work and tinker Brass Spanners from the 50 Brass Ingots on the bench.",
    done: (tinker) => tinker.queue.some((entry) => entry.actionId === SPANNER_ACTION) || held(tinker, SPANNER) > 0 || tinker.weapon !== null,
  },
  {
    id: "first_spanner",
    target: "bench",
    fallback: "Watch the bench: the first spanner lands in under a minute.",
    done: (tinker) => held(tinker, SPANNER) > 0 || tinker.weapon !== null,
  },
  {
    id: "pips_bill",
    target: "story",
    fallback: "A letter has come down the tube. Open the Story tab and answer it.",
    done: (tinker) => prologue(tinker) >= 10,
  },
  {
    id: "equip",
    target: "loadout",
    fallback: "In the Loadout, press Equip beside a Brass Spanner. The Rust Rats will not wait.",
    done: (tinker) => tinker.weapon !== null,
  },
  {
    id: "rats",
    target: "queue",
    fallback: "Queue a fight with the Rust Rat Runt. Each kill pays Crowns and rat scrap.",
    done: (tinker) => tinker.crowns > 0 || (prologue(tinker) >= 10 && tinker.story.backRent === 0),
  },
  {
    id: "pay_bill",
    target: "exchange",
    fallback: "On the Exchange tab, press Pay on Pip's bill. Short of Crowns? Sell rat scrap at the window first.",
    done: (tinker) => prologue(tinker) >= 10 && tinker.story.backRent === 0,
  },
  {
    id: "brass_plate",
    target: "story",
    fallback: "The Row has more to say before the day is out, and there is something in the workbench. The Story tab.",
    done: (tinker) => prologue(tinker) >= 100,
  },
  {
    id: "come_back",
    target: "queue",
    fallback: "Queue twelve hours of work, then go. The Boiler keeps the bench busy, and the city will have written by the time you are back.",
    done: (tinker, acknowledged) => acknowledged && tinker.queue.length > 0,
  },
];

export interface GuideState {
  /** Steps the player has pressed through. */
  acknowledged: string[];
  skipped: boolean;
}

/** The step the guide is on, or null once it is done or skipped. */
export function currentStep(tinker: Tinker, state: GuideState): Step | null {
  if (state.skipped) return null;
  return STEPS.find((step) => !step.done(tinker, state.acknowledged.includes(step.id))) ?? null;
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
  const level = (skill: string) => tinker.skills.find((entry) => entry.skill === skill)?.level ?? 1;
  const power = (item: string | null) => content.weapons.find((weapon) => weapon.item === item)?.power ?? 0;
  const better = content.weapons.some(
    (weapon) => held(tinker, weapon.item) > 0 && level(weapon.style) >= weapon.level_required && weapon.power > power(tinker.weapon),
  );
  if (better) targets.add("loadout");
  return targets;
}

export function GuideCard({
  step,
  content,
  onAcknowledge,
  onSkip,
}: {
  step: Step;
  content: Content;
  onAcknowledge: () => void;
  onSkip: () => void;
}) {
  const words = content.guide.find((entry) => entry.id === step.id);
  const position = STEPS.indexOf(step) + 1;
  const button = words?.button ?? (step.id === "boiler" ? "Go on, then" : step.id === "come_back" ? "Until later" : undefined);
  const needsButton = step.id === "boiler" || step.id === "come_back";
  return (
    <View style={[ui.panel, { borderColor: colors.brass, flexDirection: "row", gap: 12, alignItems: "flex-start" }]}>
      <View
        style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brassDim, alignItems: "center", justifyContent: "center" }}
      >
        <Text style={[ui.heading, { color: colors.soot }]}>B</Text>
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={[ui.muted, { color: colors.brass }]}>{words?.speaker ?? "Professor Brassbuckle"}</Text>
          <Text style={ui.muted}>
            {position} of {STEPS.length}
          </Text>
        </View>
        <Text style={[ui.text, { lineHeight: 21 }]}>{words?.line ?? step.fallback}</Text>
        <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
          {needsButton && (
            <Pressable style={[ui.button, { alignSelf: "flex-start" }]} onPress={onAcknowledge} accessibilityRole="button">
              <Text style={ui.buttonText}>{button}</Text>
            </Pressable>
          )}
          <Pressable onPress={onSkip} accessibilityRole="button">
            <Text style={ui.muted}>Skip the guide</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// Planning one job for the queue: how long each repetition takes, how many
// fit in a span of steam or in the materials held, and why a job could not
// start. The skill view's tiles and the action bar both use it, so a count
// means the same thing everywhere. A count starts at about an hour of work;
// quick spans offer 1, 3 and 6 hours or a full Boiler.

import { useEffect, useMemo, useState } from "react";
import { api, type Content, type FightOutlook, type Tinker } from "./api";
import { titleCase } from "./format";

export const BOILER_SECONDS = 12 * 3600;
export const DEFAULT_SECONDS = 3600;
export const SPANS: { label: string; seconds: number }[] = [
  { label: "1h", seconds: 3600 },
  { label: "3h", seconds: 3 * 3600 },
  { label: "6h", seconds: 6 * 3600 },
  { label: "Fill", seconds: BOILER_SECONDS },
];

/** The skills that have jobs, in the order a new Tinker meets them, then the fights. */
export const SKILL_ORDER = ["prospecting", "smithing", "tinkering", "cooking", "scavenging"];
export const FIGHT = "fight";

const NOT_READY: Record<string, string> = {
  no_weapon: "equip a weapon first",
  level: "your weapon needs a higher level",
  cannot_win: "you cannot hurt it yet",
};

export function notReadyText(reason: string): string {
  return NOT_READY[reason] ?? reason;
}

export interface Planner {
  levels: Map<string, number>;
  held: Map<string, number>;
  fights: Map<string, FightOutlook>;
  secondsEach(id: string): number;
  countFor(id: string, span: number): number;
  startWarning(id: string): string | null;
  isBoss(id: string): boolean;
}

export function usePlanner(content: Content, tinker: Tinker, name: (id: string) => string): Planner {
  const [fights, setFights] = useState<Map<string, FightOutlook>>(new Map());

  // Each fight's outlook for this Tinker, so a boss's win chance shows before it is queued.
  useEffect(() => {
    api
      .fights(tinker.id)
      .then((result) => setFights(new Map(result.fights.map((fight) => [fight.monsterId, fight]))))
      .catch(() => setFights(new Map()));
  }, [tinker.id, tinker.weapon]);

  const levels = useMemo(() => new Map(tinker.skills.map((skill) => [skill.skill, skill.level])), [tinker.skills]);
  const held = useMemo(() => {
    const totals = new Map<string, number>();
    for (const stack of tinker.inventory) totals.set(stack.item, (totals.get(stack.item) ?? 0) + stack.qty);
    return totals;
  }, [tinker.inventory]);

  const isBoss = (id: string) => Boolean(content.monsters.find((monster) => monster.id === id)?.boss);

  /** Seconds one repetition takes: the action's time, or this Tinker's expected time per kill. */
  const secondsEach = (id: string): number => {
    const action = content.actions.find((candidate) => candidate.id === id);
    if (action) return action.seconds;
    const outlook = fights.get(id);
    if (outlook?.ready) return outlook.seconds;
    return content.monsters.find((candidate) => candidate.id === id)?.seconds_per_kill ?? 60;
  };

  /** How many fit in a span of steam, and in the materials held. A boss is one attempt at a time. */
  const countFor = (id: string, span: number): number => {
    if (isBoss(id)) return 1;
    const byTime = Math.max(1, Math.floor(span / secondsEach(id)));
    const action = content.actions.find((candidate) => candidate.id === id);
    if (!action || action.inputs.length === 0) return byTime;
    const byInputs = Math.min(...action.inputs.map((input) => Math.floor((held.get(input.item) ?? 0) / input.qty)));
    return Math.max(1, Math.min(byTime, byInputs));
  };

  /**
   * Why a job could not start if it reached the front of the queue now. The
   * queue takes such a job off rather than wait, so say it before it is queued.
   * Materials may still come from the job queued ahead of it.
   */
  const startWarning = (id: string): string | null => {
    const action = content.actions.find((candidate) => candidate.id === id);
    if (action) {
      if ((levels.get(action.skill) ?? 1) < action.level_required) return `needs ${titleCase(action.skill)} ${action.level_required}`;
      const missing = action.inputs.filter((input) => (held.get(input.item) ?? 0) < input.qty).map((input) => name(input.item));
      if (missing.length === 0) return null;
      const ahead = tinker.queue.length > 0 ? " unless the job ahead of it makes some first" : "";
      return `you hold no ${missing.join(" or ")}, so it will be taken off the queue${ahead}`;
    }
    const outlook = fights.get(id);
    if (outlook && !outlook.ready) return `${notReadyText(outlook.reason)}, or it will be taken off the queue`;
    return null;
  };

  return { levels, held, fights, secondsEach, countFor, startWarning, isBoss };
}

/**
 * A job's short title, by what it makes, as Milky Way Idle names its tiles:
 * "Brass Spanner" rather than "Tinker Brass Spanner" on the Tinkering page.
 * A job that makes several things, or nothing, keeps its own name.
 */
export function jobTitle(content: Content, id: string, name: (id: string) => string): string {
  const action = content.actions.find((candidate) => candidate.id === id);
  if (action) return action.outputs.length === 1 ? name(action.outputs[0]!.item) : name(id);
  return content.monsters.find((monster) => monster.id === id)?.name ?? name(id);
}

/** The skill a job belongs to, or FIGHT for a monster. */
export function skillOf(content: Content, id: string): string {
  return content.actions.find((action) => action.id === id)?.skill ?? FIGHT;
}

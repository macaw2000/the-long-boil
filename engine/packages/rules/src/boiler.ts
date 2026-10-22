// The action queue and the Boiler (GDD section 6, Offline play).
//
// A Tinker's queue holds up to two actions, each with a count. Time is
// resolved on demand: resolve() advances a state from where it was last
// resolved to `now`, working through the queue until the count runs out,
// the inputs run out, or the Boiler runs dry. Nothing here is random, and
// resolving a span in one call or in many smaller calls gives the same
// state and the same events.

import type { Action, Content } from "./content.js";
import { levelFor } from "./xp.js";

export const QUEUE_SLOTS = 2;
export const BOILER_HOURS = 12;
const HOUR_MS = 3_600_000;

export interface QueueEntry {
  actionId: string;
  remaining: number;
}

export interface TinkerState {
  skillXp: Record<string, number>;
  inventory: Record<string, number>;
  queue: QueueEntry[];
  /** Time already spent on the head action's current repetition. */
  progressMs: number;
  /** Epoch ms this state has been resolved up to. */
  resolvedTo: number;
  /** Epoch ms the Boiler runs dry. */
  steamUntil: number;
}

export type GameEvent =
  | {
      type: "action_completed";
      at: number;
      actionId: string;
      skill: string;
      xp: number;
      consumed: Record<string, number>;
      produced: Record<string, number>;
    }
  | { type: "level_up"; at: number; skill: string; level: number }
  | { type: "queue_entry_finished"; at: number; actionId: string }
  | { type: "queue_stalled"; at: number; actionId: string; reason: "inputs" | "level" | "unknown_action" }
  | { type: "boiler_dry"; at: number };

export interface Resolution {
  state: TinkerState;
  events: GameEvent[];
}

function cloneState(state: TinkerState): TinkerState {
  return {
    skillXp: { ...state.skillXp },
    inventory: { ...state.inventory },
    queue: state.queue.map((entry) => ({ ...entry })),
    progressMs: state.progressMs,
    resolvedTo: state.resolvedTo,
    steamUntil: state.steamUntil,
  };
}

function stallReason(state: TinkerState, action: Action | undefined, content: Content) {
  if (!action) return "unknown_action" as const;
  if (levelFor(state.skillXp[action.skill] ?? 0, content) < action.level_required) return "level" as const;
  for (const input of action.inputs) {
    if ((state.inventory[input.item] ?? 0) < input.qty) return "inputs" as const;
  }
  return null;
}

/** Advances a Tinker's queue from state.resolvedTo to now. Returns a new state; the input is untouched. */
export function resolve(previous: TinkerState, content: Content, now: number): Resolution {
  const state = cloneState(previous);
  const events: GameEvent[] = [];
  const workEnd = Math.min(now, state.steamUntil);
  let t = state.resolvedTo;

  while (t < workEnd) {
    const head = state.queue[0];
    if (!head) break;
    const action = content.actions.get(head.actionId);
    const reason = stallReason(state, action, content);
    if (reason || !action) {
      events.push({ type: "queue_stalled", at: t, actionId: head.actionId, reason: reason ?? "unknown_action" });
      state.queue.shift();
      state.progressMs = 0;
      continue;
    }

    const needed = action.seconds * 1000 - state.progressMs;
    if (t + needed > workEnd) {
      state.progressMs += workEnd - t;
      t = workEnd;
      break;
    }

    t += needed;
    state.progressMs = 0;
    const consumed: Record<string, number> = {};
    for (const input of action.inputs) {
      state.inventory[input.item] = (state.inventory[input.item] ?? 0) - input.qty;
      consumed[input.item] = input.qty;
    }
    const produced: Record<string, number> = {};
    for (const output of action.outputs) {
      state.inventory[output.item] = (state.inventory[output.item] ?? 0) + output.qty;
      produced[output.item] = output.qty;
    }
    const before = levelFor(state.skillXp[action.skill] ?? 0, content);
    state.skillXp[action.skill] = (state.skillXp[action.skill] ?? 0) + action.xp;
    const after = levelFor(state.skillXp[action.skill] ?? 0, content);
    events.push({ type: "action_completed", at: t, actionId: action.id, skill: action.skill, xp: action.xp, consumed, produced });
    for (let level = before + 1; level <= after; level++) {
      events.push({ type: "level_up", at: t, skill: action.skill, level });
    }

    head.remaining -= 1;
    if (head.remaining <= 0) {
      events.push({ type: "queue_entry_finished", at: t, actionId: action.id });
      state.queue.shift();
    }
  }

  if (state.queue.length > 0 && previous.resolvedTo <= state.steamUntil && now > state.steamUntil) {
    events.push({ type: "boiler_dry", at: state.steamUntil });
  }
  for (const [item, qty] of Object.entries(state.inventory)) {
    if (qty === 0) delete state.inventory[item];
  }
  state.resolvedTo = Math.max(state.resolvedTo, now);
  return { state, events };
}

/** A check-in: resolves up to now, then refills the Boiler to its full hours. */
export function checkIn(state: TinkerState, content: Content, now: number, boilerHours = BOILER_HOURS): Resolution {
  const resolution = resolve(state, content, now);
  resolution.state.steamUntil = now + boilerHours * HOUR_MS;
  return resolution;
}

/** Replaces the queue. Resolve first, so time already spent is not lost. */
export function setQueue(state: TinkerState, queue: QueueEntry[]): TinkerState {
  if (queue.length > QUEUE_SLOTS) throw new Error(`the queue holds ${QUEUE_SLOTS} actions`);
  if (queue.some((entry) => !Number.isInteger(entry.remaining) || entry.remaining < 1)) {
    throw new Error("each queued action needs a whole count of at least 1");
  }
  const next = cloneState(state);
  const sameHead = next.queue[0]?.actionId === queue[0]?.actionId;
  next.queue = queue.map((entry) => ({ ...entry }));
  if (!sameHead) next.progressMs = 0;
  return next;
}

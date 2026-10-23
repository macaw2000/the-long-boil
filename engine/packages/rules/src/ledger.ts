// The While You Were Away ledger (GDD section 6, Offline play; section 7, a
// normal check-in): the events of one resolution folded into the few lines a
// returning Tinker reads first.

import type { GameEvent } from "./boiler.js";

export interface LedgerLine {
  /** An action id, or a monster id for fights and boss attempts. */
  id: string;
  /** Actions completed, kills, or boss attempts. */
  count: number;
  /** Boss attempts won; 0 for actions and ordinary kills. */
  won: number;
  xp: Record<string, number>;
  crowns: number;
  consumed: Record<string, number>;
  produced: Record<string, number>;
}

export interface Ledger {
  /** Epoch ms of the first and last event, or null for an empty ledger. */
  from: number | null;
  to: number | null;
  lines: LedgerLine[];
  crowns: number;
  levelUps: { skill: string; level: number }[];
  stalls: { actionId: string; reason: string }[];
  boilerDryAt: number | null;
}

function addAll(into: Record<string, number>, from: Record<string, number>) {
  for (const [key, value] of Object.entries(from)) into[key] = (into[key] ?? 0) + value;
}

export function summarize(events: readonly GameEvent[]): Ledger {
  const lines = new Map<string, LedgerLine>();
  const ledger: Ledger = { from: null, to: null, lines: [], crowns: 0, levelUps: [], stalls: [], boilerDryAt: null };

  const lineFor = (id: string) => {
    let line = lines.get(id);
    if (!line) {
      line = { id, count: 0, won: 0, xp: {}, crowns: 0, consumed: {}, produced: {} };
      lines.set(id, line);
    }
    return line;
  };

  for (const event of events) {
    ledger.from ??= event.at;
    ledger.to = event.at;
    switch (event.type) {
      case "action_completed": {
        const line = lineFor(event.actionId);
        line.count += 1;
        addAll(line.xp, { [event.skill]: event.xp });
        addAll(line.consumed, event.consumed);
        addAll(line.produced, event.produced);
        break;
      }
      case "monster_killed":
      case "boss_attempted": {
        const line = lineFor(event.monsterId);
        line.count += 1;
        if (event.type === "boss_attempted" && event.won) line.won += 1;
        addAll(line.xp, event.xp);
        line.crowns += event.crowns;
        ledger.crowns += event.crowns;
        addAll(line.consumed, event.consumed);
        addAll(line.produced, event.produced);
        break;
      }
      case "level_up":
        ledger.levelUps.push({ skill: event.skill, level: event.level });
        break;
      case "queue_stalled":
        ledger.stalls.push({ actionId: event.actionId, reason: event.reason });
        break;
      case "boiler_dry":
        ledger.boilerDryAt = event.at;
        break;
      case "queue_entry_finished":
        break;
    }
  }

  ledger.lines = [...lines.values()];
  return ledger;
}

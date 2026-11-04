// The While You Were Away ledger (GDD section 7, a normal check-in, 0:00).

import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { Ledger as LedgerData, TradeNote } from "./api";
import { duration, titleCase, tradeLine } from "./format";
import { colors, ui } from "./theme";

export const STALL_REASONS: Record<string, string> = {
  inputs: "ran out of materials",
  level: "needs a higher level",
  unknown_action: "is no longer known",
  no_weapon: "needs a weapon equipped",
  cannot_win: "cannot be won with what you carry",
};

function list(counts: Record<string, number>, name: (id: string) => string): string {
  return Object.entries(counts)
    .map(([id, qty]) => `${qty.toLocaleString()} ${name(id)}`)
    .join(", ");
}

export function Ledger({
  ledger,
  trades,
  name,
  note,
  onClose,
}: {
  ledger: LedgerData;
  trades: TradeNote[];
  name: (id: string) => string;
  /** A line from the guide, for the first time the ledger shows something new. */
  note?: string;
  onClose: () => void;
}) {
  const span = ledger.from !== null && ledger.to !== null ? ledger.to - ledger.from : 0;
  // Every skill's XP and level on one line was a wall to 12 of 12 cold readers: the count first, the detail on a press.
  const [detail, setDetail] = useState(false);
  const skills = new Set(ledger.levelUps.map((up) => up.skill)).size;
  const highest = new Map(ledger.levelUps.map((up) => [up.skill, up.level]));
  return (
    <View style={[ui.panel, { borderColor: colors.brass }]}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={ui.heading}>While You Were Away</Text>
        <Pressable onPress={onClose} accessibilityRole="button">
          <Text style={ui.muted}>Put it aside</Text>
        </Pressable>
      </View>
      {span > 0 && <Text style={ui.muted}>{duration(span)} of work</Text>}
      {ledger.lines.map((line) => {
        const fight = line.id.startsWith("monster.");
        const xp = detail
          ? Object.entries(line.xp)
              .map(([skill, gained]) => `${Math.round(gained).toLocaleString()} ${titleCase(skill)} XP`)
              .join(", ")
          : null;
        return (
          <View key={line.id} style={{ gap: 2 }}>
            <Text style={ui.text}>
              {fight
                ? `${line.count.toLocaleString()} × ${name(line.id)}${line.won ? ` (${line.won} won)` : ""}`
                : `${name(line.id)} × ${line.count.toLocaleString()}`}
            </Text>
            <Text style={ui.muted}>
              {[
                Object.keys(line.produced).length ? `made ${list(line.produced, name)}` : null,
                // A fight uses only Rations, eaten when hurt: saying so is how a new player first learns what they are for.
                Object.keys(line.consumed).length ? (fight ? `ate ${list(line.consumed, name)} to heal` : `used ${list(line.consumed, name)}`) : null,
                line.crowns ? `${line.crowns.toLocaleString()} Crowns` : null,
                xp,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
        );
      })}
      {trades.map((note, index) => (
        <Text key={`trade-${index}`} style={ui.text}>
          {tradeLine(note, name)}
        </Text>
      ))}
      {ledger.levelUps.length > 0 && (
        <Pressable onPress={() => setDetail(!detail)} accessibilityRole="button" accessibilityState={{ expanded: detail }}>
          <Text style={[ui.text, { color: colors.verdigris }]}>
            {detail
              ? [...highest].map(([skill, level]) => `${titleCase(skill)} ${level}`).join(", ")
              : `${skills} ${skills === 1 ? "skill" : "skills"} went up. Press to see which.`}
          </Text>
        </Pressable>
      )}
      {ledger.stalls.map((stall, index) => (
        <Text key={index} style={[ui.text, { color: colors.scald }]}>
          {name(stall.actionId)} {STALL_REASONS[stall.reason] ?? stall.reason}.
        </Text>
      ))}
      {note && <Text style={[ui.muted, { fontStyle: "italic", lineHeight: 19 }]}>{note}</Text>}
      {ledger.boilerDryAt !== null && (
        <Text style={[ui.text, { color: colors.scald }]}>The Boiler ran dry, and the workshop stopped.</Text>
      )}
    </View>
  );
}

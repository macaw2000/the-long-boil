// The While You Were Away ledger (GDD section 7, a normal check-in, 0:00).

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
  onClose,
}: {
  ledger: LedgerData;
  trades: TradeNote[];
  name: (id: string) => string;
  onClose: () => void;
}) {
  const span = ledger.from !== null && ledger.to !== null ? ledger.to - ledger.from : 0;
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
        const xp = Object.entries(line.xp)
          .map(([skill, gained]) => `${gained.toLocaleString()} ${titleCase(skill)} XP`)
          .join(", ");
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
                Object.keys(line.consumed).length ? `used ${list(line.consumed, name)}` : null,
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
        <Text style={[ui.text, { color: colors.verdigris }]}>
          {ledger.levelUps.map((up) => `${titleCase(up.skill)} ${up.level}`).join(", ")}
        </Text>
      )}
      {ledger.stalls.map((stall, index) => (
        <Text key={index} style={[ui.text, { color: colors.scald }]}>
          {name(stall.actionId)} {STALL_REASONS[stall.reason] ?? stall.reason}.
        </Text>
      ))}
      {ledger.boilerDryAt !== null && (
        <Text style={[ui.text, { color: colors.scald }]}>The Boiler ran dry, and the workshop stopped.</Text>
      )}
    </View>
  );
}

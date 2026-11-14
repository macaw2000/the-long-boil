// The While You Were Away ledger (GDD section 7, a normal check-in, 0:00).
// Coming back to what the workshop made is the reward the whole game turns
// on, so it is shown as a haul, not a report: each thing made with its icon
// and a count that runs up, each level gained as a chip, and one press to
// collect it. The XP behind the levels waits on a press of its own.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import type { GuildActivity, Ledger as LedgerData, TradeNote } from "./api";
import { duration, titleCase, tradeLine } from "./format";
import { GOLD } from "./Guide";
import { Sparks, Tally } from "./Juice";
import { SkillIcon } from "./SkillView";
import { play } from "./sound";
import { ItemIcon, UiIcon } from "./Sprite";
import { colors, ui } from "./theme";

export const STALL_REASONS: Record<string, string> = {
  inputs: "ran out of materials",
  level: "needs a higher level",
  unknown_action: "is no longer known",
  no_weapon: "needs a weapon equipped",
  cannot_win: "cannot be won with what you carry",
};

/** "Bram", "Bram and Cog", "Bram, Cog and Dee", "Bram, Cog, Dee and 2 others". */
function speakers(guild: GuildActivity): string {
  const names = guild.others ? [...guild.from, `${guild.others} ${guild.others === 1 ? "other" : "others"}`] : guild.from;
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "");
}

function list(counts: Record<string, number>, name: (id: string) => string): string {
  return Object.entries(counts)
    .map(([id, qty]) => `${qty.toLocaleString()} ${name(id)}`)
    .join(", ");
}

/** One thing in the haul: its picture, a count that runs up, and its name. */
function Chip({ picture, qty, label, tone = colors.brass }: { picture: ReactNode; qty?: number; label: string; tone?: string }) {
  return (
    <View
      accessibilityLabel={qty === undefined ? label : `${qty.toLocaleString()} ${label}`}
      style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: tone, borderRadius: 6, backgroundColor: colors.soot, paddingVertical: 5, paddingHorizontal: 8 }}
    >
      {picture}
      {qty !== undefined && <Tally value={qty} style={[ui.number, { color: colors.ink, fontSize: 15, fontWeight: "700" }]} />}
      <Text style={[ui.muted, { fontSize: 12 }]}>{label}</Text>
    </View>
  );
}

export function Ledger({
  ledger,
  trades,
  guild,
  name,
  job,
  note,
  onClose,
  onGuildChat,
}: {
  ledger: LedgerData;
  trades: TradeNote[];
  /** The guild's talk meanwhile, if there was any. */
  guild: GuildActivity | null;
  /** Opens the guild's chat. */
  onGuildChat: () => void;
  name: (id: string) => string;
  /** A job's name as the bar shows it. */
  job: (id: string) => string;
  /** A line from the guide, for the first time the ledger shows something new. */
  note?: string;
  onClose: () => void;
}) {
  const span = ledger.from !== null && ledger.to !== null ? ledger.to - ledger.from : 0;
  // Every skill's XP on one line was a wall to 12 of 12 cold readers: the levels show as chips, the XP on a press.
  const [detail, setDetail] = useState(false);
  const highest = new Map(ledger.levelUps.map((up) => [up.skill, up.level]));
  const haul = ledger.lines.some((line) => Object.keys(line.produced).length > 0 || line.crowns > 0) || highest.size > 0;
  // The haul lands with a sound; Collect answers with sparks, then puts the ledger away.
  useEffect(() => {
    if (haul) play("clink");
    // Once, as the ledger opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [collected, setCollected] = useState(0);
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (closing.current && clearTimeout(closing.current)), []);
  const collect = () => {
    if (closing.current) return;
    play("clink");
    setCollected((count) => count + 1);
    closing.current = setTimeout(onClose, 550);
  };
  return (
    <View style={[ui.panel, { borderColor: haul ? GOLD : colors.brass, borderWidth: haul ? 2 : 1, gap: 10 }]}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <Text style={[ui.heading, { fontSize: 20 }]}>While You Were Away</Text>
        {span > 0 && <Text style={ui.muted}>{duration(span)} of work</Text>}
      </View>
      {ledger.lines.map((line) => {
        const fight = line.id.startsWith("monster.");
        const xp = Object.entries(line.xp)
          .map(([skill, gained]) => `${Math.round(gained).toLocaleString()} ${titleCase(skill)} XP`)
          .join(", ");
        return (
          <View key={line.id} style={{ gap: 6 }}>
            <Text style={[ui.text, { fontSize: 15 }]}>
              {fight
                ? `${line.count.toLocaleString()} × ${job(line.id)}${line.won ? ` (${line.won} won)` : ""}`
                : `${job(line.id)} × ${line.count.toLocaleString()}`}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {Object.entries(line.produced).map(([item, qty]) => (
                <Chip key={item} picture={<ItemIcon item={item} size={26} />} qty={qty} label={name(item)} />
              ))}
              {line.crowns > 0 && <Chip picture={<UiIcon name="crowns" size={24} />} qty={line.crowns} label="Crowns" />}
            </View>
            {Object.keys(line.consumed).length > 0 && (
              <Text style={ui.muted}>
                {/* A fight uses only Rations, eaten when hurt: saying so is how a new player first learns what they are for. */}
                {fight ? `ate ${Object.values(line.consumed).reduce((sum, qty) => sum + qty, 0).toLocaleString()} Rations to heal` : `used ${list(line.consumed, name)}`}
              </Text>
            )}
            {detail && xp !== "" && <Text style={ui.muted}>{xp}</Text>}
          </View>
        );
      })}
      {trades.map((note, index) => (
        <Text key={`trade-${index}`} style={ui.text}>
          {tradeLine(note, name)}
        </Text>
      ))}
      {guild && (
        <View style={{ gap: 2, borderLeftWidth: 2, borderLeftColor: colors.verdigris, paddingLeft: 8 }}>
          <Text style={ui.text}>
            <Text style={{ color: colors.brass, fontWeight: "700" }}>{guild.guild}</Text>
            {guild.count > 0 ? `: ${guild.count} ${guild.count === 1 ? "message" : "messages"} from ${speakers(guild)}` : ""}
            {guild.notice ? `${guild.count > 0 ? "; " : ": "}${guild.notice} pinned a new notice` : ""}
          </Text>
          {guild.last && (
            <Text style={ui.muted} numberOfLines={2}>
              {guild.last.name}: “{guild.last.text}”
            </Text>
          )}
          <Pressable onPress={onGuildChat} accessibilityRole="button">
            <Text style={[ui.text, { color: colors.verdigris }]}>{guild.count > 0 ? "Read guild chat" : "Read the notice"} ›</Text>
          </Pressable>
        </View>
      )}
      {highest.size > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={[ui.text, { color: colors.verdigris, fontSize: 15 }]}>
            {highest.size === 1 ? "A skill went up" : `${highest.size} skills went up`}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {[...highest].map(([skill, level]) => (
              <Chip key={skill} picture={<SkillIcon skill={skill} size={22} />} label={`${titleCase(skill)} ${level}`} tone={colors.verdigris} />
            ))}
          </View>
          <Pressable onPress={() => setDetail(!detail)} accessibilityRole="button" accessibilityState={{ expanded: detail }}>
            <Text style={[ui.muted, { fontSize: 12, textDecorationLine: "underline" }]}>{detail ? "Hide the XP" : "Show the XP"}</Text>
          </Pressable>
        </View>
      )}
      {ledger.stalls.map((stall, index) => (
        <Text key={index} style={[ui.text, { color: colors.scald }]}>
          {job(stall.actionId)} {STALL_REASONS[stall.reason] ?? stall.reason}.
        </Text>
      ))}
      {note && <Text style={[ui.muted, { fontStyle: "italic", lineHeight: 19 }]}>{note}</Text>}
      {ledger.boilerDryAt !== null && (
        <Text style={[ui.text, { color: colors.scald }]}>The Boiler ran dry, and the workshop stopped.</Text>
      )}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Sparks bursts={collected}>
          <Pressable onPress={haul ? collect : onClose} accessibilityRole="button" style={[ui.button, { paddingHorizontal: 22, paddingVertical: 9 }, haul && { backgroundColor: GOLD }]}>
            <Text style={[ui.buttonText, { fontSize: 15 }]}>{haul ? "Collect" : "Put it aside"}</Text>
          </Pressable>
        </Sparks>
        {haul && <Text style={[ui.muted, { fontSize: 12 }]}>It is all in your Stores already.</Text>}
      </View>
    </View>
  );
}

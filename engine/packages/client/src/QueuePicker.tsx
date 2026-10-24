// Choosing one queue slot: a skilling action or a Rustmoor monster, and a count.
// The count starts at about an hour of work (or what the materials held allow);
// quick buttons offer 1, 3 and 6 hours or a full Boiler, and the time a count
// takes is shown beside it, so a number like 800 says what it means.

import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { api, type Content, type FightOutlook, type QueueEntry, type Tinker } from "./api";
import { duration, seconds, titleCase } from "./format";
import { ItemIcon } from "./Sprite";
import { characters } from "./sprites";
import { colors, ui } from "./theme";

const BOILER_SECONDS = 12 * 3600;
const DEFAULT_SECONDS = 3600;
const SPANS: { label: string; seconds: number }[] = [
  { label: "1h", seconds: 3600 },
  { label: "3h", seconds: 3 * 3600 },
  { label: "6h", seconds: 6 * 3600 },
  { label: "Fill", seconds: BOILER_SECONDS },
];

export function QueuePicker({
  content,
  tinker,
  name,
  onPick,
  onCancel,
}: {
  content: Content;
  tinker: Tinker;
  name: (id: string) => string;
  onPick: (entry: QueueEntry) => void;
  onCancel: () => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [count, setCount] = useState("");
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

  const groups = useMemo(() => {
    const bySkill = new Map<string, typeof content.actions>();
    for (const action of content.actions) bySkill.set(action.skill, [...(bySkill.get(action.skill) ?? []), action]);
    return [...bySkill.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([skill, actions]) => ({ skill, actions: actions.sort((a, b) => a.level_required - b.level_required) }));
  }, [content.actions]);

  /** Seconds one repetition takes: the action's time, or this Tinker's expected time per kill. */
  function secondsEach(id: string): number {
    const action = content.actions.find((candidate) => candidate.id === id);
    if (action) return action.seconds;
    const outlook = fights.get(id);
    if (outlook?.ready) return outlook.seconds;
    return content.monsters.find((candidate) => candidate.id === id)?.seconds_per_kill ?? 60;
  }

  /** How many fit in a span of steam, and in the materials held. A boss is one attempt at a time. */
  function countFor(id: string, span: number): number {
    if (content.monsters.find((candidate) => candidate.id === id)?.boss) return 1;
    const byTime = Math.max(1, Math.floor(span / secondsEach(id)));
    const action = content.actions.find((candidate) => candidate.id === id);
    if (!action || action.inputs.length === 0) return byTime;
    const byInputs = Math.min(...action.inputs.map((input) => Math.floor((held.get(input.item) ?? 0) / input.qty)));
    return Math.max(1, Math.min(byTime, byInputs));
  }

  function choose(id: string) {
    setChosen(id);
    setCount(String(countFor(id, DEFAULT_SECONDS)));
  }

  const parsed = Number(count);
  const valid = chosen !== null && Number.isInteger(parsed) && parsed >= 1;
  const warning = chosen === null ? null : startWarning(chosen);

  /**
   * Why a job could not start if it reached the front of the queue now. The
   * queue takes such a job off rather than wait, so say it before it is queued.
   * Materials may still come from the job queued ahead of it.
   */
  function startWarning(id: string): string | null {
    const action = content.actions.find((candidate) => candidate.id === id);
    if (action) {
      if ((levels.get(action.skill) ?? 1) < action.level_required) return `needs ${titleCase(action.skill)} ${action.level_required}`;
      const missing = action.inputs.filter((input) => (held.get(input.item) ?? 0) < input.qty).map((input) => name(input.item));
      if (missing.length === 0) return null;
      const ahead = tinker.queue.length > 0 ? " unless the job ahead of it makes some first" : "";
      return `you hold no ${missing.join(" or ")}, so it will be taken off the queue${ahead}`;
    }
    const outlook = fights.get(id);
    if (outlook && !outlook.ready) return `${NOT_READY[outlook.reason] ?? outlook.reason}, or it will be taken off the queue`;
    return null;
  }

  return (
    <View style={[ui.panel, { borderColor: colors.brass }]}>
      <Text style={ui.heading}>Queue work</Text>
      <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 10 }}>
        {groups.map(({ skill, actions }) => (
          <View key={skill} style={{ gap: 4 }}>
            <Text style={[ui.muted, { color: colors.brass }]}>
              {titleCase(skill)} · level {levels.get(skill) ?? 1}
            </Text>
            {actions.map((action) => {
              const locked = (levels.get(action.skill) ?? 1) < action.level_required;
              const inputs = action.inputs.map((input) => `${input.qty} ${name(input.item)}`).join(", ");
              return (
                <Row
                  key={action.id}
                  selected={chosen === action.id}
                  locked={locked}
                  onPress={() => choose(action.id)}
                  title={name(action.id)}
                  picture={action.outputs[0] ? <ItemIcon item={action.outputs[0].item} size={32} /> : undefined}
                  detail={`lvl ${action.level_required} · ${seconds(action.seconds)} · ${action.xp} XP${inputs ? ` · uses ${inputs}` : ""}`}
                />
              );
            })}
          </View>
        ))}
        <View style={{ gap: 4 }}>
          <Text style={[ui.muted, { color: colors.brass }]}>Rustmoor Scrapyards · fight</Text>
          {[...content.monsters]
            .sort((a, b) => a.level - b.level)
            .map((monster) => (
              <Row
                key={monster.id}
                selected={chosen === monster.id}
                locked={false}
                onPress={() => choose(monster.id)}
                title={`${monster.name}${monster.boss ? " (boss)" : ""}`}
                picture={
                  characters[monster.id]?.idle?.[0] !== undefined ? (
                    <Image source={characters[monster.id]!.idle![0] as number} style={{ width: 40, height: 40 }} />
                  ) : undefined
                }
                detail={`lvl ${monster.level} · weak to ${monster.weakness} · ${outlookText(monster, fights.get(monster.id))}`}
              />
            ))}
        </View>
      </ScrollView>
      {chosen !== null && !content.monsters.find((monster) => monster.id === chosen)?.boss && (
        <View style={{ flexDirection: "row", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {SPANS.map((span) => {
            const n = countFor(chosen, span.seconds);
            return (
              <Pressable
                key={span.label}
                onPress={() => setCount(String(n))}
                accessibilityRole="button"
                accessibilityLabel={`${span.label}: ${n}`}
                style={{
                  borderWidth: 1,
                  borderColor: Number(count) === n ? colors.brass : colors.panelEdge,
                  borderRadius: 4,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                }}
              >
                <Text style={[ui.number, { fontSize: 12, color: Number(count) === n ? colors.brass : colors.muted }]}>
                  {span.label} · {n.toLocaleString()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <TextInput
          style={[ui.input, { width: 100 }]}
          value={count}
          onChangeText={setCount}
          inputMode="numeric"
          accessibilityLabel="How many"
          placeholder="count"
          placeholderTextColor={colors.muted}
        />
        <Pressable
          style={[ui.button, !valid && { opacity: 0.4 }]}
          disabled={!valid}
          onPress={() => valid && onPick({ actionId: chosen, remaining: parsed })}
          accessibilityRole="button"
        >
          <Text style={ui.buttonText}>Queue it</Text>
        </Pressable>
        <Pressable onPress={onCancel} accessibilityRole="button">
          <Text style={ui.muted}>Cancel</Text>
        </Pressable>
      </View>
      {valid && (
        <Text style={ui.muted}>
          {parsed.toLocaleString()} × {seconds(secondsEach(chosen))} = {duration(parsed * secondsEach(chosen) * 1000)} of steam
          {parsed * secondsEach(chosen) > BOILER_SECONDS ? " (more than one Boiler: it carries on after your next check-in)" : ""}
        </Text>
      )}
      {warning && <Text style={[ui.muted, { color: colors.copper }]}>Careful: {warning}.</Text>}
      {tinker.queue.length === 1 && <Text style={ui.muted}>This goes second, after {name(tinker.queue[0]!.actionId)} finishes.</Text>}
    </View>
  );
}

const NOT_READY: Record<string, string> = {
  no_weapon: "equip a weapon first",
  level: "your weapon needs a higher level",
  cannot_win: "you cannot hurt it yet",
};

function outlookText(monster: Content["monsters"][number], outlook: FightOutlook | undefined): string {
  if (!outlook) return monster.boss ? "one attempt each" : `about ${seconds(monster.seconds_per_kill)} a kill`;
  if (!outlook.ready) return NOT_READY[outlook.reason] ?? outlook.reason;
  if (monster.boss) {
    const rations = outlook.rations ? ` with ${outlook.rations} Rations` : " without Rations";
    return `${Math.round((outlook.winChance ?? 0) * 100)}% to win${rations}, ${seconds(outlook.seconds)} an attempt`;
  }
  return `about ${seconds(outlook.seconds)} a kill`;
}

function Row({
  title,
  detail,
  selected,
  locked,
  onPress,
  picture,
}: {
  title: string;
  detail: string;
  selected: boolean;
  locked: boolean;
  onPress: () => void;
  /** An icon or sprite beside the row. */
  picture?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={locked}
      accessibilityRole="button"
      style={{
        padding: 8,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: selected ? colors.brass : colors.panelEdge,
        backgroundColor: selected ? "#33291d" : "transparent",
        opacity: locked ? 0.4 : 1,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {picture}
        <View style={{ flex: 1 }}>
          <Text style={ui.text}>{title}</Text>
          <Text style={ui.muted}>{detail}</Text>
        </View>
      </View>
    </Pressable>
  );
}

// Choosing one queue slot: a skilling action or a Rustmoor monster, and a count.
// "Fill" offers the count that 12 hours of steam (or the materials held) allow.

import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { api, type Content, type FightOutlook, type QueueEntry, type Tinker } from "./api";
import { seconds, titleCase } from "./format";
import { colors, ui } from "./theme";

const BOILER_SECONDS = 12 * 3600;

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

  function fillFor(id: string): number {
    const action = content.actions.find((candidate) => candidate.id === id);
    if (action) {
      const byTime = Math.floor(BOILER_SECONDS / action.seconds);
      const byInputs = Math.min(...action.inputs.map((input) => Math.floor((held.get(input.item) ?? 0) / input.qty)));
      return Math.max(1, Math.min(byTime, action.inputs.length ? byInputs : byTime));
    }
    const monster = content.monsters.find((candidate) => candidate.id === id);
    if (monster?.boss) return 1;
    return Math.max(1, Math.floor(BOILER_SECONDS / (monster?.seconds_per_kill ?? 60)));
  }

  function choose(id: string) {
    setChosen(id);
    setCount(String(fillFor(id)));
  }

  const parsed = Number(count);
  const valid = chosen !== null && Number.isInteger(parsed) && parsed >= 1;

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
                detail={`lvl ${monster.level} · weak to ${monster.weakness} · ${outlookText(monster, fights.get(monster.id))}`}
              />
            ))}
        </View>
      </ScrollView>
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
}: {
  title: string;
  detail: string;
  selected: boolean;
  locked: boolean;
  onPress: () => void;
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
      <Text style={ui.text}>{title}</Text>
      <Text style={ui.muted}>{detail}</Text>
    </Pressable>
  );
}

// One skill's page in the centre of the workshop, after Milky Way Idle's
// layout: the skill's level, the Tinker at work, and the skill's jobs as
// tiles. Choosing a tile shows what it takes and gives, a count (about an
// hour by default, with quick spans), and Start or Add to queue. The fights
// are a page of their own, one tile per Rustmoor monster.

import { useState, type ReactNode } from "react";
import { Image, Pressable, Text, TextInput, View } from "react-native";
import type { Content, QueueEntry, Tinker } from "./api";
import { duration, levelProgress, seconds, titleCase } from "./format";
import { FIGHT, SPANS, BOILER_SECONDS, DEFAULT_SECONDS, jobTitle, notReadyText, usePlanner, type Planner } from "./jobs";
import { Glow } from "./Glow";
import { ItemIcon, skillIconSource } from "./Sprite";
import { characters } from "./sprites";
import { colors, ui } from "./theme";

/** A stand-in icon per skill where no skill icon is drawn: the first thing the skill makes. */
export const SKILL_ICONS: Record<string, string> = {
  prospecting: "item.rustmoor.copper",
  smithing: "item.rustmoor.brass_ingot",
  tinkering: "item.rustmoor.brass_spanner",
  cooking: "item.rustmoor.rustmoor_ration",
  scavenging: "item.rustmoor.bent_nails",
};

export function SkillIcon({ skill, size = 24 }: { skill: string; size?: number }) {
  const drawn = skillIconSource(skill);
  if (drawn !== undefined) return <Image source={drawn} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />;
  if (skill === FIGHT) return <MonsterPicture id="monster.rustmoor.rust_rat_runt" size={size} />;
  return <ItemIcon item={SKILL_ICONS[skill] ?? "item.fallback"} size={size} />;
}

export function MonsterPicture({ id, size }: { id: string; size: number }) {
  const frame = characters[id]?.idle?.[0];
  if (frame === undefined) return <View style={{ width: size, height: size }} />;
  return <Image source={frame as number} style={{ width: size, height: size }} />;
}

export function SkillView({
  skill,
  content,
  tinker,
  name,
  scene,
  queueLit,
  onStart,
  onQueue,
}: {
  skill: string;
  content: Content;
  tinker: Tinker;
  name: (id: string) => string;
  /** The Tinker at work, drawn by the workshop. */
  scene: ReactNode;
  /** The guide points at the jobs. */
  queueLit: boolean;
  onStart: (entry: QueueEntry) => void;
  onQueue: (entry: QueueEntry) => void;
}) {
  const planner = usePlanner(content, tinker, name);
  const [chosen, setChosen] = useState<string | null>(null);
  const [count, setCount] = useState("");
  const fight = skill === FIGHT;
  const level = planner.levels.get(skill) ?? 1;
  const xp = tinker.skills.find((entry) => entry.skill === skill)?.xp ?? 0;
  const progress = fight ? null : levelProgress(content, xp, level);

  const actions = content.actions.filter((action) => action.skill === skill).sort((a, b) => a.level_required - b.level_required);
  const monsters = [...content.monsters].sort((a, b) => a.level - b.level);

  const choose = (id: string) => {
    setChosen(id);
    setCount(String(planner.countFor(id, DEFAULT_SECONDS)));
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={[ui.panel, { flexDirection: "row", alignItems: "center", gap: 12 }]}>
        <SkillIcon skill={skill} size={40} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10 }}>
            <Text style={[ui.heading, { fontSize: 20 }]}>{fight ? "Rustmoor Scrapyards" : titleCase(skill)}</Text>
            {!fight && <Text style={[ui.number, { color: colors.brass }]}>Level {level}</Text>}
          </View>
          {progress && (
            <>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.soot, overflow: "hidden" }}>
                <View style={{ width: `${(progress.into / progress.span) * 100}%`, height: "100%", backgroundColor: colors.verdigris }} />
              </View>
              <Text style={[ui.muted, { fontSize: 11 }]}>
                {xp.toLocaleString()} XP · {(progress.span - progress.into).toLocaleString()} to level {level + 1}
              </Text>
            </>
          )}
          {fight && <Text style={ui.muted}>Fight with the weapon in your hand; change it in the Loadout.</Text>}
        </View>
      </View>

      {scene}

      <Glow active={queueLit}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {fight
            ? monsters.map((monster) => {
                const outlook = planner.fights.get(monster.id);
                const line = !outlook
                  ? `Level ${monster.level}`
                  : !outlook.ready
                    ? notReadyText(outlook.reason)
                    : monster.boss && outlook.winChance !== null
                      ? `${Math.round(outlook.winChance * 100)}% to win`
                      : `${seconds(outlook.seconds)} a kill`;
                return (
                  <Tile
                    key={monster.id}
                    selected={chosen === monster.id}
                    locked={false}
                    onPress={() => choose(monster.id)}
                    picture={<MonsterPicture id={monster.id} size={64} />}
                    title={monster.name}
                    line={line}
                    accent={monster.boss ? colors.copper : undefined}
                  />
                );
              })
            : actions.map((action) => {
                const locked = level < action.level_required;
                return (
                  <Tile
                    key={action.id}
                    selected={chosen === action.id}
                    locked={locked}
                    onPress={() => choose(action.id)}
                    picture={<ItemIcon item={action.outputs[0]?.item ?? "item.fallback"} size={40} />}
                    title={jobTitle(content, action.id, name)}
                    line={locked ? `Level ${action.level_required}` : seconds(action.seconds)}
                  />
                );
              })}
        </View>
      </Glow>

      {chosen !== null && (
        <JobDetail
          id={chosen}
          content={content}
          tinker={tinker}
          planner={planner}
          name={name}
          count={count}
          setCount={setCount}
          onStart={(entry) => {
            setChosen(null);
            onStart(entry);
          }}
          onQueue={(entry) => {
            setChosen(null);
            onQueue(entry);
          }}
        />
      )}
    </View>
  );
}

function Tile({
  picture,
  title,
  line,
  selected,
  locked,
  accent,
  onPress,
}: {
  picture: ReactNode;
  title: string;
  line: string;
  selected: boolean;
  locked: boolean;
  accent?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={locked}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${line}`}
      accessibilityState={{ selected, disabled: locked }}
      // hovered is react-native-web's, missing from the native types.
      style={(state) => {
        const hovered = (state as { hovered?: boolean }).hovered;
        return {
          width: 112,
          minHeight: 112,
          padding: 8,
          gap: 6,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 6,
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? colors.brass : (accent ?? (hovered && !locked ? colors.brassDim : colors.panelEdge)),
          backgroundColor: selected ? "#33291d" : hovered && !locked ? "#2c241c" : colors.panel,
          opacity: locked ? 0.45 : 1,
        };
      }}
    >
      {picture}
      <Text style={[ui.text, { fontSize: 13, textAlign: "center" }]} numberOfLines={2}>
        {title}
      </Text>
      <Text style={[ui.muted, { fontSize: 11, textAlign: "center" }]}>{line}</Text>
    </Pressable>
  );
}

function JobDetail({
  id,
  content,
  tinker,
  planner,
  name,
  count,
  setCount,
  onStart,
  onQueue,
}: {
  id: string;
  content: Content;
  tinker: Tinker;
  planner: Planner;
  name: (id: string) => string;
  count: string;
  setCount: (count: string) => void;
  onStart: (entry: QueueEntry) => void;
  onQueue: (entry: QueueEntry) => void;
}) {
  const action = content.actions.find((candidate) => candidate.id === id);
  const monster = content.monsters.find((candidate) => candidate.id === id);
  const parsed = Number(count);
  const valid = Number.isInteger(parsed) && parsed >= 1;
  const warning = planner.startWarning(id);
  const each = planner.secondsEach(id);
  const full = tinker.queue.length >= 2;

  return (
    <View style={[ui.panel, { borderColor: colors.brass, gap: 10 }]}>
      <Text style={ui.heading}>{jobTitle(content, id, name)}</Text>
      {action && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          {action.inputs.map((input) => (
            <Stack key={input.item} item={input.item} qty={input.qty} name={name} held={planner.held.get(input.item) ?? 0} />
          ))}
          {action.inputs.length > 0 && <Text style={[ui.text, { color: colors.brass }]}>→</Text>}
          {action.outputs.map((output) => (
            <Stack key={output.item} item={output.item} qty={output.qty} name={name} />
          ))}
          <Text style={ui.muted}>
            · {seconds(action.seconds)} · {action.xp} XP each
          </Text>
        </View>
      )}
      {monster && (
        <Text style={ui.muted}>
          Level {monster.level} · weak to {monster.weakness}
          {monster.boss ? " · a boss: one attempt at a time" : ` · about ${seconds(each)} a kill`}
        </Text>
      )}

      {!planner.isBoss(id) && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
          {SPANS.map((span) => {
            const n = planner.countFor(id, span.seconds);
            const on = parsed === n;
            return (
              <Pressable
                key={span.label}
                onPress={() => setCount(String(n))}
                accessibilityRole="button"
                accessibilityLabel={`${span.label}: ${n}`}
                style={{
                  borderWidth: 1,
                  borderColor: on ? colors.brass : colors.panelEdge,
                  borderRadius: 4,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                }}
              >
                <Text style={[ui.number, { fontSize: 12, color: on ? colors.brass : colors.muted }]}>
                  {span.label} · {n.toLocaleString()}
                </Text>
              </Pressable>
            );
          })}
          <TextInput
            style={[ui.input, { width: 90 }]}
            value={count}
            onChangeText={setCount}
            inputMode="numeric"
            accessibilityLabel="How many"
            placeholderTextColor={colors.muted}
          />
        </View>
      )}

      {valid && (
        <Text style={ui.muted}>
          {parsed.toLocaleString()} × {seconds(each)} = {duration(parsed * each * 1000)} of steam
          {parsed * each > BOILER_SECONDS ? " (longer than one Boiler: it carries on after your next check-in)" : ""}
        </Text>
      )}
      {warning && <Text style={[ui.muted, { color: colors.copper }]}>Careful: {warning}.</Text>}

      <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
        <Pressable
          style={[ui.button, { paddingHorizontal: 18 }, !valid && { opacity: 0.4 }]}
          disabled={!valid}
          onPress={() => onStart({ actionId: id, remaining: parsed })}
          accessibilityRole="button"
        >
          <Text style={ui.buttonText}>{tinker.queue.length ? "Start now" : "Start"}</Text>
        </Pressable>
        {tinker.queue.length > 0 && (
          <Pressable
            style={[
              ui.button,
              { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.brassDim },
              (!valid || full) && { opacity: 0.4 },
            ]}
            disabled={!valid || full}
            onPress={() => onQueue({ actionId: id, remaining: parsed })}
            accessibilityRole="button"
          >
            <Text style={[ui.buttonText, { color: colors.brass }]}>Add to queue</Text>
          </Pressable>
        )}
        <Text style={[ui.muted, { flex: 1 }]}>
          {tinker.queue.length === 0
            ? ""
            : full
              ? `Start now replaces ${name(tinker.queue[0]!.actionId)}; the queue holds two jobs.`
              : `Start now replaces ${name(tinker.queue[0]!.actionId)}; Add to queue runs it after.`}
        </Text>
      </View>
    </View>
  );
}

function Stack({ item, qty, name, held }: { item: string; qty: number; name: (id: string) => string; held?: number }) {
  const short = held !== undefined && held < qty;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <ItemIcon item={item} size={24} />
      <Text style={[ui.text, short && { color: colors.scald }]}>
        {qty} {name(item)}
        {held !== undefined ? <Text style={ui.muted}> (have {held.toLocaleString()})</Text> : null}
      </Text>
    </View>
  );
}

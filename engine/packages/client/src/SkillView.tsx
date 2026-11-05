// One skill's page in the centre of the workshop, after Milky Way Idle's
// layout: the skill's level, the Tinker at work, and the skill's jobs as
// tiles. Choosing a tile shows what it takes and gives, a count (about an
// hour by default, with quick spans), and Start or Add to queue. The fights
// are a page of their own, one tile per Rustmoor monster.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Image, Pressable, Text, TextInput, View } from "react-native";
import { zoneOpen } from "@long-boil/rules";
import type { Content, QueueEntry, Tinker } from "./api";
import { duration, levelProgress, seconds, titleCase } from "./format";
import { FIGHT, SPANS, BOILER_SECONDS, DEFAULT_SECONDS, jobTitle, notReadyText, startFirst, usePlanner, type Planner } from "./jobs";
import { Glow } from "./Glow";
import { Term } from "./Term";
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

/** What a run of fights means for Rations: a figure at today's level read as a warning, so say what holds and that running out is safe. */
function rationsNote(planner: Planner, content: Content, id: string): string {
  const outlook = planner.fights.get(id);
  if (!outlook?.ready || outlook.rations <= 0) return "";
  return `. You hold ${(planner.held.get(content.ration.item) ?? 0).toLocaleString()} Rations; running out only slows you down`;
}

/** What Start now will do to the queue: it puts the job first and keeps the rest, as far as the queue has room. */
function startNote(tinker: Tinker, content: Content, id: string, full: boolean, job: (id: string) => string): string {
  const head = tinker.queue[0];
  if (!head) return "";
  if (head.actionId === id) return "Start now sets a new count for this job.";
  if (tinker.queue.some((entry) => entry.actionId === id)) return "Start now moves this job to the front.";
  if (full) {
    const slots = tinker.upgrades.queueSlots;
    const after = startFirst(tinker.queue, { actionId: id, remaining: 1 }, slots, content);
    const leaving = tinker.queue.find((entry) => !after.some((kept) => kept.actionId === entry.actionId));
    return `The queue holds ${slots} jobs, so Add to queue has no room. Start now puts this first, and ${job(leaving!.actionId)} leaves the queue.`;
  }
  return `Start now puts this first, and ${job(head.actionId)} waits behind it. Add to queue runs it after.`;
}

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
  guideAt,
  chosen,
  onChoose,
  onStart,
  onQueue,
  onGrocer,
}: {
  skill: string;
  content: Content;
  tinker: Tinker;
  name: (id: string) => string;
  /** The Tinker at work, drawn by the workshop. */
  scene: ReactNode;
  /** The nudges point at the jobs. */
  queueLit: boolean;
  /** The guide's pointer: one job's tile ("job:<id>") or the Start button ("start"). */
  guideAt: string | null;
  /** The tile picked, held by the workshop so the guide can see it. */
  chosen: string | null;
  onChoose: (id: string | null) => void;
  onStart: (entry: QueueEntry) => void;
  onQueue: (entry: QueueEntry) => void;
  /** Goes to the grocer's counter, for an ingredient no skill makes. */
  onGrocer: () => void;
}) {
  const planner = usePlanner(content, tinker, name);
  const setChosen = onChoose;
  const [count, setCount] = useState("");
  const fight = skill === FIGHT;
  const level = planner.levels.get(skill) ?? 1;
  const xp = tinker.skills.find((entry) => entry.skill === skill)?.xp ?? 0;
  const progress = fight ? null : levelProgress(content, xp, level);

  const actions = content.actions.filter((action) => action.skill === skill).sort((a, b) => a.level_required - b.level_required);
  const monsters = [...content.monsters].sort((a, b) => a.level - b.level);

  const choose = (id: string) => {
    setChosen(id);
    // A first piece of gear is one piece: the usual hour's worth asked for 390 silk.
    const output = content.actions.find((action) => action.id === id)?.outputs[0]?.item;
    const gear = content.pieces.some((piece) => piece.item === output) || content.weapons.some((weapon) => weapon.item === output);
    const first = gear && (planner.held.get(output!) ?? 0) === 0;
    setCount(String(first ? 1 : planner.countFor(id, DEFAULT_SECONDS)));
  };
  const guided = (id: string) => guideAt === `job:${id}`;

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

      {fight && <CombatSkills content={content} tinker={tinker} />}

      {scene}

      <Glow active={queueLit && guideAt === null}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {fight
            ? monsters.map((monster) => {
                const outlook = planner.fights.get(monster.id);
                const closed = !zoneOpen(monster.id, tinker.story.qualities);
                const line = closed
                  ? FOUNDRY_PASS_LINE
                  : !outlook
                  ? `Level ${monster.level}`
                  : !outlook.ready
                    ? notReadyText(outlook.reason)
                    : monster.boss && outlook.winChance !== null
                      ? `${Math.round(outlook.winChance * 100)}% to win`
                      : `${seconds(outlook.seconds)} a kill`;
                return (
                  <Tile
                    key={monster.id}
                    guided={guided(monster.id)}
                    selected={chosen === monster.id}
                    locked={closed}
                    onPress={() => choose(monster.id)}
                    picture={<MonsterPicture id={monster.id} size={64} />}
                    title={monster.name}
                    line={line}
                    explain={closed ? (raise) => <FoundryPassNote onOpenChange={raise} /> : undefined}
                    accent={monster.boss ? colors.copper : undefined}
                  />
                );
              })
            : actions.map((action) => {
                const closed = !zoneOpen(action.id, tinker.story.qualities);
                const locked = closed || level < action.level_required;
                return (
                  <Tile
                    key={action.id}
                    guided={guided(action.id)}
                    selected={chosen === action.id}
                    locked={locked}
                    onPress={() => choose(action.id)}
                    picture={<ItemIcon item={action.outputs[0]?.item ?? "item.fallback"} size={40} />}
                    title={jobTitle(content, action.id, name)}
                    line={closed ? FOUNDRY_PASS_LINE : locked ? `Level ${action.level_required}` : seconds(action.seconds)}
                    explain={closed ? (raise) => <FoundryPassNote onOpenChange={raise} /> : undefined}
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
          startGuided={guideAt === "start"}
          onStart={(entry) => {
            setChosen(null);
            onStart(entry);
          }}
          onQueue={(entry) => {
            setChosen(null);
            onQueue(entry);
          }}
          onGrocer={onGrocer}
        />
      )}
    </View>
  );
}

const FOUNDRY_PASS_LINE = "Opens with the Foundry Pass";

/** A zone-locked tile's line, with what the Foundry Pass is and that it is earned, not sold. */
function FoundryPassNote({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  return (
    <Term term="foundry_pass" onOpenChange={onOpenChange}>
      <Text style={[ui.muted, { fontSize: 11, textAlign: "center", textDecorationLine: "underline", textDecorationStyle: "dotted" }]}>
        {FOUNDRY_PASS_LINE} ⓘ
      </Text>
    </Term>
  );
}

function Tile({
  picture,
  title,
  line,
  explain,
  selected,
  locked,
  guided,
  accent,
  onPress,
}: {
  picture: ReactNode;
  title: string;
  line: string;
  /** Shown in place of line, undimmed, when the line explains itself (Term.tsx). */
  explain?: (raise: (open: boolean) => void) => ReactNode;
  selected: boolean;
  locked: boolean;
  guided: boolean;
  accent?: string;
  onPress: () => void;
}) {
  const [raised, setRaised] = useState(false);
  return (
    <Glow active={guided} guide style={{ zIndex: raised ? 50 : 0 }}>
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
        };
      }}
    >
      <View style={{ alignItems: "center", gap: 6, opacity: locked ? 0.45 : 1 }}>
        {picture}
        <Text style={[ui.text, { fontSize: 13, textAlign: "center" }]} numberOfLines={2}>
          {title}
        </Text>
      </View>
      {explain ? explain(setRaised) : <Text style={[ui.muted, { fontSize: 11, textAlign: "center", opacity: locked ? 0.45 : 1 }]}>{line}</Text>}
    </Pressable>
    </Glow>
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
  startGuided,
  onStart,
  onQueue,
  onGrocer,
}: {
  id: string;
  content: Content;
  tinker: Tinker;
  planner: Planner;
  name: (id: string) => string;
  count: string;
  setCount: (count: string) => void;
  /** The guide points at Start. */
  startGuided: boolean;
  onStart: (entry: QueueEntry) => void;
  onQueue: (entry: QueueEntry) => void;
  /** Goes to the grocer's counter, for an ingredient no skill makes. */
  onGrocer: () => void;
}) {
  // Picking a tile opens this below the tiles, often below the fold: bring it, and its Start, into view.
  const panel = useRef<View>(null);
  useEffect(() => {
    const element = panel.current as unknown as { scrollIntoView?: (options: object) => void } | null;
    const timer = setTimeout(() => element?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }), 50);
    return () => clearTimeout(timer);
  }, [id]);
  const action = content.actions.find((candidate) => candidate.id === id);
  const monster = content.monsters.find((candidate) => candidate.id === id);
  const parsed = Number(count);
  const valid = Number.isInteger(parsed) && parsed >= 1;
  const warning = planner.startWarning(id);
  const each = planner.secondsEach(id);
  const full = tinker.queue.length >= tinker.upgrades.queueSlots;

  return (
    <View ref={panel} style={[ui.panel, { borderColor: colors.brass, gap: 10 }]}>
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
      {/* No skill makes Cooking's ingredients; say where they are sold, and go there. */}
      {action?.inputs
        .filter((input) => content.economy[input.item]?.grocerPrice != null && (planner.held.get(input.item) ?? 0) < input.qty)
        .map((input) => (
          <Pressable key={input.item} onPress={onGrocer} accessibilityRole="link" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <ItemIcon item={input.item} size={20} />
            <Text style={ui.muted}>
              {name(input.item)} is sold at the grocer's counter, {content.economy[input.item]!.grocerPrice} Crowns each: on the Exchange, in the
              Counting-House window, below the collectors.{" "}
              <Text style={{ color: colors.brass, textDecorationLine: "underline" }}>Go there</Text>
            </Text>
          </Pressable>
        ))}
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
          {rationsNote(planner, content, id)}
        </Text>
      )}
      {warning && <Text style={[ui.muted, { color: colors.copper }]}>Careful: {warning}.</Text>}

      <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
        <Glow active={startGuided} guide>
          <Pressable
            style={[ui.button, { paddingHorizontal: 18 }, !valid && { opacity: 0.4 }]}
            disabled={!valid}
            onPress={() => onStart({ actionId: id, remaining: parsed })}
            accessibilityRole="button"
          >
            <Text style={ui.buttonText}>{tinker.queue.length ? "Start now" : "Start"}</Text>
          </Pressable>
        </Glow>
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
      </View>
      {tinker.queue.length > 0 && <Text style={ui.muted}>{startNote(tinker, content, id, full, (job) => jobTitle(content, job, name))}</Text>}
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

/** What each combat skill does in a fight (GDD section 6, Skills). */
const COMBAT_SKILLS: [string, string][] = [
  ["melee", "close damage"],
  ["marksmanship", "ranged damage"],
  ["aetherics", "spark and coil damage"],
  ["vitality", "hit points"],
  ["fortitude", "defence; armour needs it to wear"],
  ["pressure", "harder hits"],
  ["precision", "accuracy and crits"],
];

/**
 * The seven combat skills and how they rise. None has jobs of its own: every
 * kill trains them (combat.json combat_xp_split), most of all the style of
 * the weapon in hand, so they were invisible until a locked armour piece
 * asked for Fortitude.
 */
function CombatSkills({ content, tinker }: { content: Content; tinker: Tinker }) {
  const style = content.weapons.find((weapon) => weapon.item === tinker.weapon)?.style ?? null;
  return (
    <View style={[ui.panel, { gap: 8 }]}>
      <Text style={ui.heading}>Combat skills</Text>
      <Text style={[ui.muted, { fontSize: 12 }]}>
        Every kill trains these. The style of the weapon in hand{style ? ` (${titleCase(style)})` : ""} takes most of the XP; the other six take a little each.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {COMBAT_SKILLS.map(([skill, does]) => {
          const entry = tinker.skills.find((candidate) => candidate.skill === skill);
          const level = entry?.level ?? 1;
          const progress = levelProgress(content, entry?.xp ?? 0, level);
          const main = skill === style;
          return (
            <View key={skill} style={{ flexBasis: 150, flexGrow: 1, gap: 3 }} accessibilityLabel={`${titleCase(skill)} level ${level}`}>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                <Text style={[ui.text, { fontWeight: "700", color: main ? colors.brass : colors.ink }]}>{titleCase(skill)}</Text>
                <Text style={[ui.number, { color: colors.brass }]}>{level}</Text>
                {main && <Text style={[ui.muted, { fontSize: 10, color: colors.verdigris }]}>main</Text>}
              </View>
              <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.soot, overflow: "hidden" }}>
                <View style={{ width: `${progress ? (progress.into / progress.span) * 100 : 0}%`, height: "100%", backgroundColor: main ? colors.brass : colors.verdigris }} />
              </View>
              <Text style={[ui.muted, { fontSize: 10 }]}>{does}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

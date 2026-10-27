// The bar pinned across the top of the workshop, after Milky Way Idle's: what
// the Tinker is doing now and how far along, what comes next, and the
// Boiler, Nerve, Crowns and Needles, so none of it is ever scrolled to. On a
// phone it wraps to two rows.

import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import type { Content, QueueEntry, Tinker } from "./api";
import { duration, seconds, titleCase } from "./format";
import type { GlossaryTerm } from "./glossary";
import { jobTitle } from "./jobs";
import { Glow } from "./Glow";
import { Badge, CountUp, Gauge, SteamTube } from "./Juice";
import { ItemIcon, UiIcon } from "./Sprite";
import { MonsterPicture } from "./SkillView";
import { Term } from "./Term";
import { colors, ui } from "./theme";


export function ActionBar({
  content,
  tinker,
  name,
  now,
  wide,
  elapsedMs,
  headSeconds,
  lit,
  onRemove,
  onAdd,
  onShop,
  onLeave,
}: {
  content: Content;
  tinker: Tinker;
  name: (id: string) => string;
  now: number;
  wide: boolean;
  /** How far into the current repetition, in ms. */
  elapsedMs: number;
  headSeconds: number;
  /** What the guide points at: "bench", "queue" and "boiler" light parts of the bar. */
  lit: Set<string>;
  onRemove: (slot: number) => void;
  onAdd: () => void;
  onShop: () => void;
  onLeave: () => void;
}) {
  const steamLeft = new Date(tinker.steamUntil).getTime() - now;
  const boostLeft = tinker.upgrades.boostUntil ? new Date(tinker.upgrades.boostUntil).getTime() - now : 0;
  const [head, ...later] = tinker.queue;
  const working = Boolean(head) && steamLeft > 0;

  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        gap: wide ? 20 : 10,
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: "rgba(20, 16, 12, 0.94)",
        borderBottomWidth: 1,
        borderBottomColor: colors.brassDim,
        // Above the page, so a tooltip opening down from the bar is not hidden.
        zIndex: 20,
      }}
    >
      <Glow active={lit.has("bench")} style={{ flex: 1, minWidth: wide ? 380 : "100%" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          {head ? <JobPicture content={content} id={head.actionId} size={40} /> : <View style={{ width: 40 }} />}
          <View style={{ flex: 1, gap: 4 }}>
            {head ? (
              <>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <Text style={[ui.text, { fontSize: 16, color: colors.ink }]} numberOfLines={1}>
                    <Text style={[ui.muted, { fontSize: 13 }]}>{verb(content, head)} · </Text>
                    {jobTitle(content, head.actionId, name)}
                  </Text>
                  <Text style={[ui.number, { color: colors.brass }]}>×{head.remaining.toLocaleString()}</Text>
                  <Pressable onPress={() => onRemove(0)} accessibilityRole="button" accessibilityLabel={`Stop ${name(head.actionId)}`}>
                    <Text style={[ui.muted, { fontSize: 12 }]}>stop</Text>
                  </Pressable>
                </View>
                {headSeconds > 0 && <SteamTube fraction={Math.min(1, elapsedMs / (headSeconds * 1000))} working={working} />}
                <Text style={[ui.muted, { fontSize: 11 }]}>
                  {working
                    ? `${seconds(Math.max(0, headSeconds - elapsedMs / 1000))} to the next`
                    : "Stopped: the Boiler is dry. Check in to raise steam."}
                </Text>
              </>
            ) : (
              <Text style={[ui.text, { color: colors.copper }]}>The bench is idle. Choose a job from a skill.</Text>
            )}
          </View>
          <Glow active={lit.has("queue")} style={{ gap: 4 }}>
            {later.map((next, index) => (
              <View
                key={index}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  borderWidth: 1,
                  borderColor: colors.panelEdge,
                  borderRadius: 4,
                  padding: 6,
                }}
              >
                <JobPicture content={content} id={next.actionId} size={24} />
                <Text style={[ui.muted, { fontSize: 12 }]}>
                  then {jobTitle(content, next.actionId, name)} ×{next.remaining.toLocaleString()}
                </Text>
                <Pressable onPress={() => onRemove(index + 1)} accessibilityRole="button" accessibilityLabel={`Remove ${name(next.actionId)}`}>
                  <Text style={[ui.muted, { color: colors.scald }]}>×</Text>
                </Pressable>
              </View>
            ))}
            {tinker.queue.length < tinker.upgrades.queueSlots && (
              <Pressable
                onPress={onAdd}
                accessibilityRole="button"
                accessibilityLabel={head ? "Queue a job after this one" : "Choose a job"}
                style={{
                  borderWidth: 1,
                  borderColor: colors.brassDim,
                  borderStyle: "dashed",
                  borderRadius: 4,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <Text style={[ui.muted, { color: colors.brass }]}>{head ? "+ Queue work" : "Queue work"}</Text>
              </Pressable>
            )}
          </Glow>
        </View>
      </Glow>

      <View style={{ flexDirection: "row", alignItems: "center", gap: wide ? 18 : 12, flexWrap: "wrap", ...(wide ? {} : { width: "100%" }) }}>
        <Glow active={lit.has("boiler")}>
          <Term term="boiler">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Gauge fraction={Math.max(0, steamLeft) / (tinker.upgrades.boilerHours * 3_600_000)} size={36} />
              <Text style={[ui.number, { color: steamLeft > 2 * 3_600_000 ? colors.ink : colors.scald }]}>
                {steamLeft > 0 ? duration(steamLeft) : "dry"}
              </Text>
            </View>
          </Term>
        </Glow>
        {boostLeft > 0 && (
          <Pressable onPress={onShop} accessibilityRole="button" accessibilityLabel={`Boiler Boost, ${duration(boostLeft)} left`}>
            <Stat label="Boost">
              <Text style={[ui.number, { color: colors.copper }]}>{duration(boostLeft)}</Text>
            </Stat>
          </Pressable>
        )}
        <Term term="nerve">
          <Stat label="Nerve" icon="nerve">
            <Text style={[ui.number, { color: colors.verdigris }]}>
              {tinker.story.nerve}/{tinker.story.nerveCap}
            </Text>
          </Stat>
        </Term>
        <Term term="crowns">
          <Stat label="Crowns" icon="crowns">
            <CountUp value={tinker.crowns} style={[ui.number, { color: colors.brass }]} />
          </Stat>
        </Term>
        <Pressable onPress={onShop} accessibilityRole="button" accessibilityLabel={`${tinker.cogs} Gilded Cogs; open the Cog Shop`}>
          <Stat label="Cogs">
            <CountUp value={tinker.cogs} style={[ui.number, { color: colors.brass }]} />
          </Stat>
        </Pressable>
        {Object.entries(tinker.story.needles).map(([needle, value]) => (
          <Term key={needle} term={needle as GlossaryTerm}>
            <Stat label={titleCase(needle.split(".")[1] ?? needle)} icon={needle.split(".")[1]}>
              <Text style={[ui.number, { color: value >= 8 ? colors.scald : value > 0 ? colors.copper : colors.muted }]}>{value}</Text>
            </Stat>
          </Term>
        ))}
        {tinker.story.inInfirmary && <Badge count={1} label="St. Pinion's" tone={colors.scald} />}
        <Pressable onPress={onLeave} accessibilityRole="button" accessibilityLabel={`Leave ${tinker.name}'s workshop`}>
          <Text style={[ui.muted, { fontSize: 12 }]}>{tinker.name} · leave</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** A reading on the bar: its icon where one is drawn, then its name over its value. */
function Stat({ label, icon, children }: { label: string; icon?: string; children: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      {icon && <UiIcon name={icon} size={24} />}
      <View style={{ alignItems: "center" }}>
        <Text style={[ui.muted, { fontSize: 10, letterSpacing: 0.5 }]}>{label.toUpperCase()}</Text>
        {children}
      </View>
    </View>
  );
}

function verb(content: Content, entry: QueueEntry): string {
  if (content.monsters.some((monster) => monster.id === entry.actionId)) return "Fighting";
  const skill = content.actions.find((action) => action.id === entry.actionId)?.skill;
  return VERBS[skill ?? ""] ?? "Making";
}

const VERBS: Record<string, string> = {
  prospecting: "Prospecting",
  smithing: "Smithing",
  tinkering: "Tinkering",
  cooking: "Cooking",
  scavenging: "Scavenging",
};

export function JobPicture({ content, id, size }: { content: Content; id: string; size: number }) {
  if (content.monsters.some((monster) => monster.id === id)) return <MonsterPicture id={id} size={size} />;
  const output = content.actions.find((action) => action.id === id)?.outputs[0]?.item;
  return <ItemIcon item={output ?? "item.fallback"} size={size} />;
}

// Where to go in the workshop, after Milky Way Idle's left column: the city's
// places first (the Story, the Exchange, the Guild), then every skill with its
// level and a thin bar to the next, then the fights. On a phone the places sit
// in a bar along the bottom and the skills in a strip above the page.

import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { Content, Tinker } from "./api";
import { levelProgress, titleCase } from "./format";
import { Glow } from "./Glow";
import { FIGHT, SKILL_ORDER } from "./jobs";
import { Badge } from "./Juice";
import { SkillIcon } from "./SkillView";
import { UiIcon } from "./Sprite";
import { colors, ui } from "./theme";

export type Place = "story" | "exchange" | "guild" | "shop" | "stores" | "chat" | `skill:${string}`;

export interface PlaceBadge {
  count: number;
  label?: string;
  tone?: string;
}

/** Each place's icon, from the interface sheet: the Post's canister, the Exchange's scale, a guild's shield. */
const PLACE_ICONS: Partial<Record<Place | "work", string>> = { story: "post", exchange: "exchange", guild: "guild", chat: "chat", stores: "boiler" };

export function skillsOf(content: Content): string[] {
  const present = new Set(content.actions.map((action) => action.skill));
  const ordered = SKILL_ORDER.filter((skill) => present.has(skill));
  const rest = [...present].filter((skill) => !ordered.includes(skill)).sort();
  return [...ordered, ...rest, FIGHT];
}

export function SideNav({
  content,
  tinker,
  place,
  onPlace,
  badges,
  lit,
}: {
  content: Content;
  tinker: Tinker;
  place: Place;
  onPlace: (place: Place) => void;
  badges: Partial<Record<Place, PlaceBadge>>;
  lit: Set<Place>;
}) {
  const working = tinker.queue[0]?.actionId;
  return (
    <ScrollView style={{ width: 210 }} contentContainerStyle={{ paddingVertical: 12, gap: 2 }}>
      {(["story", "exchange", "guild", "shop"] as const).map((choice) => (
        <NavRow key={choice} active={place === choice} lit={lit.has(choice)} onPress={() => onPlace(choice)} badge={badges[choice]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {/* The Cog Shop's icon is not drawn yet; the space keeps the names in line. */}
            <View style={{ width: 26, height: 26 }}>{PLACE_ICONS[choice] && <UiIcon name={PLACE_ICONS[choice]!} size={26} />}</View>
            <Text style={[ui.text, { fontSize: 15, color: place === choice ? colors.brass : colors.ink }]}>{choice === "shop" ? "Cog Shop" : titleCase(choice)}</Text>
          </View>
        </NavRow>
      ))}
      <Text style={[ui.muted, { fontSize: 10, letterSpacing: 1, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4 }]}>SKILLS</Text>
      {skillsOf(content).map((skill) => {
        const key: Place = `skill:${skill}`;
        const entry = tinker.skills.find((candidate) => candidate.skill === skill);
        const level = entry?.level ?? 1;
        const progress = skill === FIGHT ? null : levelProgress(content, entry?.xp ?? 0, level);
        const busy = working !== undefined && (content.actions.find((action) => action.id === working)?.skill ?? FIGHT) === skill;
        return (
          <NavRow key={skill} active={place === key} lit={lit.has(key)} onPress={() => onPlace(key)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
              <SkillIcon skill={skill} size={26} />
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={[ui.text, { color: place === key ? colors.brass : colors.ink }]}>
                    {skill === FIGHT ? "Fight" : titleCase(skill)}
                    {busy ? <Text style={{ color: colors.verdigris }}> ●</Text> : null}
                  </Text>
                  {skill !== FIGHT && <Text style={ui.number}>{level}</Text>}
                </View>
                {progress && (
                  <View style={{ height: 3, borderRadius: 2, backgroundColor: colors.soot, overflow: "hidden" }}>
                    <View style={{ width: `${(progress.into / progress.span) * 100}%`, height: "100%", backgroundColor: colors.verdigris }} />
                  </View>
                )}
              </View>
            </View>
          </NavRow>
        );
      })}
    </ScrollView>
  );
}

function NavRow({
  active,
  lit,
  onPress,
  badge,
  children,
}: {
  active: boolean;
  lit: boolean;
  onPress: () => void;
  badge?: PlaceBadge;
  children: ReactNode;
}) {
  return (
    <Glow active={lit}>
      <Pressable
        onPress={onPress}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        // hovered is react-native-web's, missing from the native types.
        style={(state) => {
          const hovered = (state as { hovered?: boolean }).hovered;
          return {
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 14,
            paddingVertical: 9,
            borderLeftWidth: 3,
            borderLeftColor: active ? colors.brass : "transparent",
            backgroundColor: active ? "rgba(201, 162, 90, 0.12)" : hovered ? "rgba(255, 255, 255, 0.04)" : "transparent",
          };
        }}
      >
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>{children}</View>
        {badge && <Badge count={badge.count} label={badge.label} tone={badge.tone} />}
      </Pressable>
    </Glow>
  );
}

/** A phone's places, along the bottom: the work, then the city, then the stores and chat. */
export function BottomBar({
  place,
  workPlace,
  onPlace,
  badges,
  lit,
}: {
  place: Place;
  /** Where Work leads from elsewhere: the skill the Tinker is busy at. */
  workPlace: Place;
  onPlace: (place: Place) => void;
  badges: Partial<Record<Place, PlaceBadge>>;
  lit: Set<Place>;
}) {
  const working = place.startsWith("skill:");
  const items: { key: Place | "work"; label: string }[] = [
    { key: "work", label: "Work" },
    { key: "story", label: "Story" },
    { key: "exchange", label: "Exchange" },
    { key: "guild", label: "Guild" },
    { key: "stores", label: "Stores" },
    { key: "chat", label: "Chat" },
  ];
  return (
    <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.brassDim, backgroundColor: "rgba(20, 16, 12, 0.96)" }}>
      {items.map(({ key, label }) => {
        const active = key === "work" ? working : place === key;
        const badge = key === "work" ? undefined : badges[key];
        return (
          <Glow key={key} active={key !== "work" && lit.has(key)} style={{ flex: 1 }}>
            <Pressable
              onPress={() => onPlace(key === "work" ? (working ? place : workPlace) : key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={{ alignItems: "center", paddingVertical: 10, borderTopWidth: 2, borderTopColor: active ? colors.brass : "transparent" }}
            >
              {key === "work" ? <SkillIcon skill="tinkering" size={22} /> : PLACE_ICONS[key] ? <UiIcon name={PLACE_ICONS[key]!} size={22} /> : null}
              <Text style={[ui.text, { fontSize: 12, color: active ? colors.brass : colors.muted }]}>{label}</Text>
              {badge && badge.count > 0 && (
                <View style={{ position: "absolute", top: 2, right: 6 }}>
                  <Badge count={badge.count} label={badge.label} tone={badge.tone} />
                </View>
              )}
            </Pressable>
          </Glow>
        );
      })}
    </View>
  );
}

/** A phone's skills, as a strip of icons above the page. */
export function SkillStrip({ content, tinker, place, onPlace }: { content: Content; tinker: Tinker; place: Place; onPlace: (place: Place) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 12, paddingVertical: 8 }}>
      {skillsOf(content).map((skill) => {
        const key: Place = `skill:${skill}`;
        const level = tinker.skills.find((candidate) => candidate.skill === skill)?.level ?? 1;
        const active = place === key;
        return (
          <Pressable
            key={skill}
            onPress={() => onPlace(key)}
            accessibilityRole="tab"
            accessibilityLabel={skill === FIGHT ? "Fight" : `${titleCase(skill)}, level ${level}`}
            accessibilityState={{ selected: active }}
            style={{
              alignItems: "center",
              gap: 2,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: active ? colors.brass : colors.panelEdge,
              backgroundColor: active ? "rgba(201, 162, 90, 0.12)" : colors.panel,
            }}
          >
            <SkillIcon skill={skill} size={24} />
            <Text style={[ui.muted, { fontSize: 11, color: active ? colors.brass : colors.muted }]}>{skill === FIGHT ? "Fight" : String(level)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// Where to go in the workshop, after Milky Way Idle's left column: the city's
// places first (the Story, the Exchange, the Guild), then every skill with its
// level and a thin bar to the next, then the fights. On a phone the places sit
// in a bar along the bottom and the skills in a strip above the page. What the
// game has not opened yet is greyed with a lock, never hidden, so a new player
// sees there is more to come; hovering or tapping it says when it opens.

import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { Content, Tinker } from "./api";
import { levelProgress, titleCase } from "./format";
import { Glow } from "./Glow";
import { opensWhen } from "./Guide";
import { FIGHT, SKILL_ORDER } from "./jobs";
import { Badge } from "./Juice";
import { SkillIcon } from "./SkillView";
import { UiIcon } from "./Sprite";
import { colors, ui } from "./theme";

export type Place = "story" | "exchange" | "guild" | "shop" | "leaderboards" | "stores" | "chat" | "admin" | `skill:${string}`;

export interface PlaceBadge {
  count: number;
  label?: string;
  tone?: string;
}

/** Each place's icon, from the interface sheets: the Post's canister, the Exchange's scale, a guild's shield, the shop's bell, the boards' podium. */
const PLACE_ICONS: Partial<Record<Place | "work", string>> = { story: "post", exchange: "exchange", guild: "guild", chat: "chat", stores: "boiler", shop: "shop", leaderboards: "leaderboards" };

export function skillsOf(content: Content): string[] {
  const present = new Set(content.actions.map((action) => action.skill));
  const ordered = SKILL_ORDER.filter((skill) => present.has(skill));
  const rest = [...present].filter((skill) => !ordered.includes(skill)).sort();
  return [...ordered, ...rest, FIGHT];
}

const placeName = (place: string) => (place === "shop" ? "Cog Shop" : titleCase(place));
const skillName = (skill: string) => (skill === FIGHT ? "Fight" : titleCase(skill));

export function SideNav({
  content,
  tinker,
  place,
  onPlace,
  badges,
  lit,
  guided,
  shown,
  admin = false,
}: {
  content: Content;
  tinker: Tinker;
  place: Place;
  onPlace: (place: Place) => void;
  badges: Partial<Record<Place, PlaceBadge>>;
  lit: Set<Place>;
  /** The place the guide points at, if it points at one. */
  guided: Place | null;
  /** Whether the guide has opened a place yet. */
  shown: (place: Place) => boolean;
  /** Admins also get the admin console, at the foot of the list. */
  admin?: boolean;
}) {
  const working = tinker.queue[0]?.actionId;
  const skills = skillsOf(content);
  return (
    <ScrollView style={{ width: 210 }} contentContainerStyle={{ paddingVertical: 12, gap: 2 }}>
      {(["story", "exchange", "guild", "shop", "leaderboards"] as const).map((choice) => (
        <NavRow key={choice} locked={shown(choice) ? undefined : { name: placeName(choice), when: opensWhen(choice) }} active={place === choice} lit={lit.has(choice)} guided={guided === choice} onPress={() => onPlace(choice)} badge={badges[choice]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ width: 26, height: 26 }}>{PLACE_ICONS[choice] && <UiIcon name={PLACE_ICONS[choice]!} size={26} />}</View>
            <Text style={[ui.text, { fontSize: 15, color: place === choice ? colors.brass : colors.ink }]}>{placeName(choice)}</Text>
          </View>
        </NavRow>
      ))}
      <Text style={[ui.muted, { fontSize: 10, letterSpacing: 1, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4 }]}>SKILLS</Text>
      {skills.map((skill) => {
        const key: Place = `skill:${skill}`;
        const entry = tinker.skills.find((candidate) => candidate.skill === skill);
        const level = entry?.level ?? 1;
        const open = shown(key);
        const progress = !open || skill === FIGHT ? null : levelProgress(content, entry?.xp ?? 0, level);
        const busy = working !== undefined && (content.actions.find((action) => action.id === working)?.skill ?? FIGHT) === skill;
        return (
          <NavRow key={skill} locked={open ? undefined : { name: skillName(skill), when: opensWhen(key) }} active={place === key} lit={lit.has(key)} guided={guided === key} onPress={() => onPlace(key)} badge={badges[key]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
              <SkillIcon skill={skill} size={26} />
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={[ui.text, { color: place === key ? colors.brass : colors.ink }]}>
                    {skill === FIGHT ? "Fight" : titleCase(skill)}
                    {busy ? <Text style={{ color: colors.verdigris }}> ●</Text> : null}
                  </Text>
                  {open && skill !== FIGHT && <Text style={ui.number}>{level}</Text>}
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
      {admin && (
        <>
          <Text style={[ui.muted, { fontSize: 10, letterSpacing: 1, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4 }]}>ADMIN</Text>
          <NavRow active={place === "admin"} lit={false} guided={false} onPress={() => onPlace("admin")}>
            <Text style={[ui.text, { fontSize: 15, color: place === "admin" ? colors.brass : colors.ink }]}>Players and sales</Text>
          </NavRow>
        </>
      )}
    </ScrollView>
  );
}

/** A place still shut: faded, and grey on the web, where the filter is drawn. */
const LOCKED = { opacity: 0.4, filter: "grayscale(1)" } as object;

/** The line a phone shows when a locked place is tapped, since it has no hover. */
function LockedNote({ text }: { text: string }) {
  return (
    <Text accessibilityLiveRegion="polite" style={[ui.muted, { fontSize: 12, textAlign: "center", paddingVertical: 4, backgroundColor: "rgba(20, 16, 12, 0.96)" }]}>
      {text}
    </Text>
  );
}

function NavRow({
  active,
  lit,
  guided,
  onPress,
  badge,
  locked,
  children,
}: {
  active: boolean;
  lit: boolean;
  guided: boolean;
  onPress: () => void;
  badge?: PlaceBadge;
  /** Set while the place is still shut: its name, and when it opens. */
  locked?: { name: string; when: string };
  children: ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const [tapped, setTapped] = useState(false);
  if (locked) {
    return (
      <Pressable
        onPress={() => setTapped((value) => !value)}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => {
          setHovered(false);
          setTapped(false);
        }}
        accessibilityRole="tab"
        accessibilityLabel={`${locked.name}, locked. ${locked.when}`}
        accessibilityState={{ selected: false, disabled: true }}
        style={{ paddingHorizontal: 14, paddingVertical: 9, borderLeftWidth: 3, borderLeftColor: "transparent", cursor: "default", zIndex: hovered || tapped ? 50 : 0 } as object}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={[{ flex: 1, flexDirection: "row", alignItems: "center" }, LOCKED]}>{children}</View>
          <View style={LOCKED}>
            <UiIcon name="locked" size={14} />
          </View>
        </View>
        {/* Laid over the next row, so pointing down the list never moves it. */}
        {(hovered || tapped) && (
          <View pointerEvents="none" style={[ui.panel, { position: "absolute", top: "100%", left: 10, right: 10, marginTop: -4, padding: 8, borderColor: colors.brassDim, zIndex: 50 }]}>
            <Text style={[ui.text, { fontSize: 12, lineHeight: 16 }]}>{locked.when}</Text>
          </View>
        )}
      </Pressable>
    );
  }
  return (
    <Glow active={lit || guided} guide={guided}>
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
  guided,
  shown,
}: {
  place: Place;
  /** Where Work leads from elsewhere: the skill the Tinker is busy at. */
  workPlace: Place;
  onPlace: (place: Place) => void;
  badges: Partial<Record<Place, PlaceBadge>>;
  lit: Set<Place>;
  guided: Place | null;
  shown: (place: Place) => boolean;
}) {
  const [asked, setAsked] = useState<Place | null>(null);
  const working = place.startsWith("skill:");
  // The guide wants a skill while the player is elsewhere: Work is the way there.
  const workGuided = guided !== null && guided.startsWith("skill:") && !working;
  const items: { key: Place | "work"; label: string }[] = [
    { key: "work", label: "Work" },
    { key: "story", label: "Story" },
    { key: "exchange", label: "Exchange" },
    { key: "guild", label: "Guild" },
    { key: "stores", label: "Stores" },
    { key: "chat", label: "Chat" },
  ];
  const press = (key: Place | "work") => {
    if (key !== "work" && !shown(key)) return setAsked(asked === key ? null : key);
    setAsked(null);
    onPlace(key === "work" ? (workGuided ? guided! : working ? place : workPlace) : key);
  };
  return (
    <View>
    {asked !== null && !shown(asked) && <LockedNote text={`${placeName(asked)}: ${opensWhen(asked)}`} />}
    <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.brassDim, backgroundColor: "rgba(20, 16, 12, 0.96)" }}>
      {items.map(({ key, label }) => {
        const open = key === "work" || shown(key);
        const active = key === "work" ? working : place === key;
        const badge = key === "work" || !open ? undefined : badges[key];
        const guide = key === "work" ? workGuided : guided === key;
        return (
          <Glow key={key} active={open && (guide || (key !== "work" && lit.has(key)))} guide={guide} style={{ flex: 1 }}>
            <Pressable
              onPress={() => press(key)}
              accessibilityRole="tab"
              accessibilityLabel={open ? label : `${label}, locked. ${opensWhen(key)}`}
              accessibilityState={{ selected: active, disabled: !open }}
              style={{ alignItems: "center", paddingVertical: 10, borderTopWidth: 2, borderTopColor: active ? colors.brass : "transparent", ...(open ? null : LOCKED) }}
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
    </View>
  );
}

/** A phone's skills, as a strip of icons above the page. */
export function SkillStrip({
  content,
  tinker,
  place,
  onPlace,
  guided,
  shown,
}: {
  content: Content;
  tinker: Tinker;
  place: Place;
  onPlace: (place: Place) => void;
  guided: Place | null;
  shown: (place: Place) => boolean;
}) {
  const [asked, setAsked] = useState<string | null>(null);
  return (
    <View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 12, paddingVertical: 8 }}>
      {skillsOf(content).map((skill) => {
        const key: Place = `skill:${skill}`;
        const level = tinker.skills.find((candidate) => candidate.skill === skill)?.level ?? 1;
        const open = shown(key);
        const active = place === key;
        return (
          <Glow key={skill} active={guided === key} guide>
          <Pressable
            onPress={() => {
              setAsked(open || asked === skill ? null : skill);
              if (open) onPlace(key);
            }}
            accessibilityRole="tab"
            accessibilityLabel={!open ? `${skillName(skill)}, locked. ${opensWhen(key)}` : skill === FIGHT ? "Fight" : `${titleCase(skill)}, level ${level}`}
            accessibilityState={{ selected: active, disabled: !open }}
            style={{
              alignItems: "center",
              gap: 2,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: active ? colors.brass : colors.panelEdge,
              backgroundColor: active ? "rgba(201, 162, 90, 0.12)" : colors.panel,
              ...(open ? null : LOCKED),
            }}
          >
            <SkillIcon skill={skill} size={24} />
            {/* A phone shows icons only, so the guide's skill carries its name. */}
            {!open && <UiIcon name="locked" size={14} />}
            {open && <Text style={[ui.muted, { fontSize: 11, color: active ? colors.brass : colors.muted }]}>
              {skill === FIGHT ? "Fight" : guided === key ? titleCase(skill) : String(level)}
            </Text>}
          </Pressable>
          </Glow>
        );
      })}
    </ScrollView>
    {asked !== null && !shown(`skill:${asked}`) && <LockedNote text={`${skillName(asked)}: ${opensWhen(`skill:${asked}`)}`} />}
    </View>
  );
}

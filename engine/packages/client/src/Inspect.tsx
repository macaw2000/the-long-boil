// Inspecting another Tinker: a card over the screen, opened by tapping a name
// in chat, the guild roster or a leaderboard. It shows what the server's
// inspect.ts lets anyone see: guild and rank, the gear on them as a small
// paperdoll, their tools, and every skill's level. From it you can whisper
// them, or invite them to your guild.

import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, Text, View } from "react-native";
import { api, type Content, type InspectView } from "./api";
import { Portrait, Slot } from "./Loadout";
import { SkillIcon } from "./SkillView";
import { ItemIcon } from "./Sprite";
import { titleCase } from "./format";
import { colors, ui } from "./theme";

const RANKS = { leader: "Leader", officer: "Officer", member: "Member" } as const;
const SLOTS = [
  ["head", "Head"],
  ["body", "Body"],
  ["hands", "Hands"],
  ["feet", "Feet"],
] as const;

export function Inspect({
  tinkerId,
  otherId,
  content,
  name,
  onClose,
  onWhisper,
  onInvite,
}: {
  tinkerId: number;
  otherId: number;
  content: Content;
  name: (item: string) => string;
  onClose: () => void;
  onWhisper?: (other: number, name: string) => void;
  /** Set when the viewer may invite to its guild. */
  onInvite?: (other: number) => void;
}) {
  const [view, setView] = useState<InspectView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invited, setInvited] = useState(false);
  const still = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setView(null);
    setError(null);
    setInvited(false);
    api
      .inspect(tinkerId, otherId)
      .then(setView)
      .catch((reason: Error) => setError(reason.message));
  }, [tinkerId, otherId]);

  const self = otherId === tinkerId;
  const weaponLevel = view?.weapon ? content.weapons.find((weapon) => weapon.item === view.weapon)?.level_required : undefined;
  const wearing = view ? [view.weapon, ...Object.values(view.worn), view.armour].filter((item): item is string => Boolean(item)) : [];
  const tools = view ? Object.entries(view.tools) : [];

  return (
    <Pressable
      onPress={onClose}
      style={{ position: "absolute", inset: 0, backgroundColor: "rgba(10,8,6,0.72)", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}
      accessibilityViewIsModal
      accessibilityLabel="Close"
    >
      {/* A press inside the card stays in the card. */}
      <Pressable onPress={() => undefined} style={[ui.panel, { width: 440, maxWidth: "100%", maxHeight: "92%", gap: 10 }]}>
        {!view ? (
          <Text style={error ? [ui.muted, { color: colors.scald }] : ui.muted}>{error ?? "Looking them over…"}</Text>
        ) : (
          <ScrollView contentContainerStyle={{ gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
              <Text style={[ui.heading, { fontSize: 22 }]}>{view.name}</Text>
              <Text style={ui.number}>Total {view.totalLevel}</Text>
            </View>
            <Text style={ui.muted}>
              {view.guild ? (
                <>
                  <Text style={{ color: colors.brass }}>{view.guild.name}</Text> · {RANKS[view.guild.rank]}
                </>
              ) : (
                "In no guild"
              )}
              {" · "}a Tinker since {new Date(view.since).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
              {view.bossesBeaten > 0 ? ` · ${view.bossesBeaten} ${view.bossesBeaten === 1 ? "boss" : "bosses"} beaten` : ""}
            </Text>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#211b15",
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.panelEdge,
                paddingVertical: 6,
              }}
            >
              <View style={{ gap: 4 }}>
                {SLOTS.map(([slot, label]) => (
                  <Slot key={slot} label={label} item={view.worn[slot] ?? null} empty={`empty_${slot}`} small />
                ))}
              </View>
              <Portrait weapon={view.weapon} flash={still} size={128} />
              <View style={{ gap: 4 }}>
                <Slot label="Weapon" item={view.weapon} empty="empty_weapon" tierLevel={weaponLevel} small />
                <Slot label="Off-hand" item={view.worn.off_hand ?? null} empty="empty_off_hand" small />
                <Slot label="Charm" item={view.worn.charm ?? null} empty="empty_charm" small />
                {view.armour && <Slot label="Armour" item={view.armour} empty="empty_armour" small />}
              </View>
            </View>
            {wearing.length > 0 && <Text style={[ui.muted, { textAlign: "center", fontSize: 12 }]}>{wearing.map(name).join(" · ")}</Text>}

            {tools.length > 0 && (
              <View style={{ gap: 4 }}>
                <Text style={[ui.muted, { fontSize: 11 }]}>Tools</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {tools.map(([skill, item]) => (
                    <View key={skill} accessibilityLabel={`${name(item)}, for ${titleCase(skill)}`} style={{ alignItems: "center", width: 76 }}>
                      <View style={{ width: 40, height: 40, borderRadius: 6, borderWidth: 1, borderColor: colors.panelEdge, backgroundColor: colors.soot, alignItems: "center", justifyContent: "center" }}>
                        <ItemIcon item={item} size={30} />
                      </View>
                      <Text numberOfLines={1} style={[ui.muted, { fontSize: 10 }]}>
                        {titleCase(skill)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View style={{ gap: 4 }}>
              <Text style={[ui.muted, { fontSize: 11 }]}>Skills</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {view.skills.map((skill) => (
                  <View
                    key={skill.skill}
                    style={{
                      width: 128,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingHorizontal: 6,
                      paddingVertical: 4,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: colors.panelEdge,
                      backgroundColor: "rgba(20, 16, 12, 0.6)",
                      opacity: skill.xp > 0 ? 1 : 0.5,
                    }}
                  >
                    <SkillIcon skill={skill.skill} size={20} />
                    <Text numberOfLines={1} style={[ui.text, { flex: 1, fontSize: 13 }]}>
                      {titleCase(skill.skill.replace("_", " "))}
                    </Text>
                    <Text style={ui.number}>{skill.level}</Text>
                  </View>
                ))}
              </View>
            </View>

            {error && <Text style={[ui.muted, { color: colors.scald }]}>{error}</Text>}
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {!self && onWhisper && (
                <Pressable onPress={() => onWhisper(view.id, view.name)} accessibilityRole="button" style={ui.button}>
                  <Text style={ui.buttonText}>Whisper</Text>
                </Pressable>
              )}
              {!self && onInvite && !view.guild && (
                <Pressable
                  onPress={() => {
                    onInvite(view.id);
                    setInvited(true);
                  }}
                  disabled={invited}
                  accessibilityRole="button"
                  style={[ui.button, invited && { opacity: 0.5 }]}
                >
                  <Text style={ui.buttonText}>{invited ? "Invited" : "Invite to guild"}</Text>
                </Pressable>
              )}
              <Pressable onPress={onClose} accessibilityRole="button" style={[ui.button, { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.panelEdge }]}>
                <Text style={[ui.buttonText, { color: colors.muted }]}>Close</Text>
              </Pressable>
            </View>
          </ScrollView>
        )}
      </Pressable>
    </Pressable>
  );
}

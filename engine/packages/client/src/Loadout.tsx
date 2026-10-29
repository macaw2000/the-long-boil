// The loadout as a paperdoll (GDD section 6: "A loadout is one weapon and one
// armour piece"). The Tinker stands in the middle holding whatever is
// equipped; the weapon rack below shows every weapon owned, framed by its
// tier, and picking one compares it with the weapon in hand on real kill
// times from the server. Equipping lands with a flash and a burst of sparks.
// Rustmoor has no armour, so the armour slot is not drawn until the Tinker
// owns a piece (Tailoring, in the Cinderworks); an empty slot read to
// playtesters as a bug.

import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Image, Pressable, Text, View } from "react-native";
import { api, type Content, type FightOutlook, type LoadoutWeapon, type Tinker } from "./api";
import { Sparks, useReducedMotion } from "./Juice";
import { ItemIcon } from "./Sprite";
import { characters } from "./sprites";
import { seconds, titleCase } from "./format";
import { colors, fonts, ui } from "./theme";

/** A weapon's tier, from the level it needs: the frame it is shown in. */
export function gearTier(level: number): { name: string; colour: string } {
  if (level >= 20) return { name: "Boss", colour: "#f2c14e" };
  if (level >= 15) return { name: "Garnet", colour: "#D0545F" };
  if (level >= 10) return { name: "Steel", colour: "#c3ccd0" };
  if (level >= 5) return { name: "Iron", colour: "#8E979A" };
  return { name: "Brass", colour: colors.brass };
}

export const STYLE_COLOURS: Record<string, string> = {
  melee: colors.copper,
  marksmanship: colors.steam,
  aetherics: colors.verdigris,
};

// 3x the 64-pixel portrait; a narrow column asks for 2x, so the pixels stay whole.
const PORTRAIT = 192;

/** The Tinker as the paperdoll shows it: holding the equipped weapon, breathing. */
function Portrait({ weapon, flash, size }: { weapon: string | null; flash: Animated.Value; size: number }) {
  const reduced = useReducedMotion();
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const timer = setInterval(() => setFrame((f) => 1 - f), 600);
    return () => clearInterval(timer);
  }, [reduced]);
  const frames = (weapon && characters[`tinker:${weapon}`]?.portrait) || characters["tinker:bare"]!.portrait!;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          position: "absolute",
          bottom: 14,
          width: size * 0.625,
          height: 18,
          borderRadius: 60,
          backgroundColor: "#000",
          opacity: 0.35,
        }}
      />
      <Image source={frames[frame % frames.length] as number} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />
      <Animated.View pointerEvents="none" style={{ position: "absolute", inset: 0, backgroundColor: colors.ink, opacity: flash }} />
    </View>
  );
}

function Slot({ label, item, tierLevel, pop }: { label: string; item: string | null; tierLevel?: number; pop?: Animated.Value }) {
  const tier = tierLevel === undefined ? null : gearTier(tierLevel);
  return (
    <View style={{ alignItems: "center", gap: 4, width: 84 }}>
      <Animated.View
        style={{
          width: 64,
          height: 64,
          borderRadius: 8,
          borderWidth: 2,
          borderColor: tier?.colour ?? colors.panelEdge,
          backgroundColor: colors.soot,
          alignItems: "center",
          justifyContent: "center",
          transform: pop ? [{ scale: pop }] : [],
          shadowColor: tier?.colour ?? "transparent",
          shadowOpacity: item ? 0.6 : 0,
          shadowRadius: 10,
        }}
      >
        {item ? <ItemIcon item={item} size={48} /> : <Text style={[ui.muted, { fontSize: 22 }]}>—</Text>}
      </Animated.View>
      <Text style={[ui.muted, { fontSize: 11, textAlign: "center" }]}>{label}</Text>
    </View>
  );
}

function Delta({ before, after, better = "higher", format = (n: number) => String(n) }: { before: number | null; after: number; better?: "higher" | "lower"; format?: (n: number) => string }) {
  if (before === null || before === after) return <Text style={ui.number}>{format(after)}</Text>;
  const improved = better === "higher" ? after > before : after < before;
  const change = better === "lower" ? Math.round(((after - before) / before) * 100) : after - before;
  const sign = change > 0 ? "+" : "";
  return (
    <Text style={ui.number}>
      <Text style={{ color: colors.muted }}>{format(before)} → </Text>
      {format(after)}{" "}
      <Text style={{ color: improved ? colors.verdigris : colors.scald, fontWeight: "700" }}>
        {better === "lower" ? `${sign}${change}%` : `${sign}${change}`}
        {improved ? " ▲" : " ▼"}
      </Text>
    </Text>
  );
}

/** The fight the comparison is about: the one queued, or the hardest the Tinker can reach. */
function targetFor(tinker: Tinker, content: Content) {
  const head = tinker.queue[0];
  const queued = head ? content.monsters.find((monster) => monster.id === head.actionId) : undefined;
  if (queued) return queued;
  const fighting = Math.max(1, ...["melee", "marksmanship", "aetherics"].map((style) => tinker.skills.find((s) => s.skill === style)?.level ?? 1));
  const reachable = content.monsters.filter((monster) => !monster.boss && monster.level <= fighting).sort((a, b) => b.level - a.level);
  return reachable[0] ?? content.monsters.find((monster) => !monster.boss);
}

function outlookText(outlook: FightOutlook | undefined): string {
  if (!outlook) return "—";
  if (!outlook.ready) return outlook.reason === "level" ? "level too low" : outlook.reason === "no_weapon" ? "—" : "cannot win";
  return outlook.winChance !== null ? `${Math.round(outlook.winChance * 100)}% to win` : `${seconds(outlook.seconds)} a kill`;
}

export function Loadout({
  content,
  tinker,
  name,
  onEquip,
  onWear,
  portrait = PORTRAIT,
}: {
  content: Content;
  tinker: Tinker;
  name: (item: string) => string;
  onEquip: (item: string) => Promise<unknown>;
  onWear: (item: string) => Promise<unknown>;
  /** The portrait's size: 192 (3x) where there is room, 128 (2x) in a narrow column. */
  portrait?: number;
}) {
  const reduced = useReducedMotion();
  const [weapons, setWeapons] = useState<LoadoutWeapon[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [bursts, setBursts] = useState(0);
  const [banner, setBanner] = useState<string | null>(null);
  const flash = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const bannerRise = useRef(new Animated.Value(0)).current;

  // Reload when what could change a comparison changes: the weapon, the rack, or a level.
  const owned = tinker.inventory.filter((stack) => content.weapons.some((weapon) => weapon.item === stack.item)).map((stack) => stack.item);
  const levels = tinker.skills.map((skill) => `${skill.skill}${skill.level}`).join();
  const key = `${tinker.weapon}|${[...new Set(owned)].sort().join()}|${levels}|${tinker.queue[0]?.actionId ?? ""}`;
  useEffect(() => {
    api
      .loadout(tinker.id)
      .then((result) => setWeapons(result.weapons))
      .catch(() => undefined);
  }, [tinker.id, key]);

  // Equipping lands: a flash on the Tinker, the slot pops, sparks, a banner.
  const previous = useRef(tinker.weapon);
  useEffect(() => {
    if (previous.current === tinker.weapon) return;
    previous.current = tinker.weapon;
    if (!tinker.weapon) return;
    setBanner(`Equipped: ${name(tinker.weapon)}`);
    setBursts((count) => count + 1);
    setSelected(null);
    if (reduced) return;
    flash.setValue(0.85);
    pop.setValue(0.3);
    bannerRise.setValue(0);
    Animated.parallel([
      Animated.timing(flash, { toValue: 0, duration: 450, useNativeDriver: false }),
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 120, useNativeDriver: false }),
      Animated.timing(bannerRise, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: false }),
    ]).start(() => setBanner(null));
  }, [tinker.weapon, name, reduced, flash, pop, bannerRise]);

  const target = useMemo(() => targetFor(tinker, content), [tinker, content]);
  const equipped = weapons.find((weapon) => weapon.equipped) ?? null;
  const choice = weapons.find((weapon) => weapon.item === selected) ?? null;
  const outlookOf = (weapon: LoadoutWeapon | null) => weapon?.outlooks.find((outlook) => outlook.monsterId === target?.id);
  const killSeconds = (weapon: LoadoutWeapon | null) => {
    const outlook = outlookOf(weapon);
    return outlook && outlook.ready && outlook.winChance === null ? outlook.seconds : null;
  };
  const styleLevel = (style: string) => tinker.skills.find((skill) => skill.skill === style)?.level ?? 1;
  const shown = equipped && !choice ? equipped : choice;
  const equippedWeapon = content.weapons.find((weapon) => weapon.item === tinker.weapon);
  // Armour pieces held, cheapest first; the slot appears with the first one.
  const armours = content.armours
    .filter((armour) => tinker.inventory.some((stack) => stack.item === armour.item && stack.qty > 0))
    .sort((a, b) => a.level_required - b.level_required || a.armour - b.armour);
  const worn = content.armours.find((armour) => armour.item === tinker.armour);
  const fortitude = styleLevel("fortitude");

  return (
    <View style={[ui.panel, { gap: 10 }]}>
      <Text style={ui.heading}>Loadout</Text>

      {/* The paperdoll: weapon slot, the Tinker, and the armour slot once there is armour to wear. */}
      <Sparks bursts={bursts}>
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
          <Slot label="Weapon" item={tinker.weapon} tierLevel={equippedWeapon?.level_required} pop={pop} />
          <Portrait weapon={tinker.weapon} flash={flash} size={portrait} />
          {armours.length > 0 || worn ? <Slot label="Armour" item={tinker.armour} /> : <View style={{ width: 84 }} />}
          {banner && (
            <Animated.Text
              pointerEvents="none"
              style={{
                position: "absolute",
                top: 8,
                alignSelf: "center",
                color: colors.brass,
                fontFamily: fonts.serif,
                fontWeight: "900",
                fontSize: 18,
                textShadowColor: colors.soot,
                textShadowRadius: 4,
                opacity: bannerRise.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 1, 0] }),
                transform: [{ translateY: bannerRise.interpolate({ inputRange: [0, 1], outputRange: [10, -10] }) }],
              }}
            >
              {banner}
            </Animated.Text>
          )}
        </View>
      </Sparks>

      {/* What the shown weapon does, and how it compares with the one in hand. */}
      {shown ? (
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Text style={[ui.text, { color: gearTier(shown.level_required).colour, fontWeight: "700" }]}>{name(shown.item)}</Text>
            <Text style={[ui.muted, { fontSize: 11, color: STYLE_COLOURS[shown.style] }]}>
              {titleCase(shown.style)} {shown.level_required} · {gearTier(shown.level_required).name}
            </Text>
            {shown.equipped && <Text style={[ui.muted, { fontSize: 11, color: colors.verdigris }]}>in hand</Text>}
          </View>
          <View style={{ flexDirection: "row", gap: 16, flexWrap: "wrap" }}>
            <Text style={ui.muted}>
              Power <Delta before={choice && equipped ? equipped.power : null} after={shown.power} />
            </Text>
            <Text style={ui.muted}>
              Accuracy <Delta before={choice && equipped ? equipped.accuracy : null} after={shown.accuracy} />
            </Text>
          </View>
          {target && (
            <Text style={ui.muted}>
              vs {name(target.id)}
              {target.weakness === shown.style ? <Text style={{ color: colors.verdigris }}> (weak to {shown.style}!)</Text> : null}:{" "}
              {choice && equipped && killSeconds(equipped) !== null && killSeconds(choice) !== null ? (
                <Delta before={killSeconds(equipped)} after={killSeconds(choice)!} better="lower" format={seconds} />
              ) : (
                <Text style={ui.number}>{outlookText(outlookOf(shown))}</Text>
              )}
            </Text>
          )}
          {choice && !choice.equipped && (
            <Pressable
              disabled={!choice.usable}
              onPress={() => onEquip(choice.item)}
              accessibilityRole="button"
              style={[ui.button, { marginTop: 4, paddingVertical: 10 }, !choice.usable && { opacity: 0.45 }]}
            >
              <Text style={[ui.buttonText, { fontSize: 16 }]}>
                {choice.usable ? `Equip ${name(choice.item)}` : `Needs ${titleCase(choice.style)} ${choice.level_required} (you have ${styleLevel(choice.style)})`}
              </Text>
            </Pressable>
          )}
        </View>
      ) : (
        <Text style={ui.muted}>Bare hands. Make a weapon at the bench, then equip it here to fight.</Text>
      )}

      {/* The rack: every weapon owned, framed by tier. */}
      {weapons.length > 0 && (
        <View style={{ gap: 4 }}>
          <Text style={[ui.muted, { fontSize: 11 }]}>Weapon rack · tap to compare</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {weapons
              .slice()
              .sort((a, b) => a.level_required - b.level_required || a.style.localeCompare(b.style))
              .map((weapon) => {
                const tier = gearTier(weapon.level_required);
                const active = weapon.item === selected || (!selected && weapon.equipped);
                return (
                  <Pressable
                    key={weapon.item}
                    onPress={() => setSelected(weapon.equipped ? null : weapon.item)}
                    accessibilityRole="button"
                    accessibilityLabel={`${name(weapon.item)}${weapon.equipped ? ", equipped" : ""}`}
                    style={{
                      width: 58,
                      height: 66,
                      borderRadius: 6,
                      borderWidth: active ? 2 : 1,
                      borderColor: active ? tier.colour : colors.panelEdge,
                      backgroundColor: weapon.equipped ? "#2f2619" : colors.soot,
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: weapon.usable ? 1 : 0.5,
                    }}
                  >
                    <View style={{ position: "absolute", top: 3, left: 3, width: 6, height: 6, borderRadius: 3, backgroundColor: STYLE_COLOURS[weapon.style] }} />
                    <View style={{ position: "absolute", top: 0, right: 0, width: 0, height: 0, borderTopWidth: 12, borderLeftWidth: 12, borderTopColor: tier.colour, borderLeftColor: "transparent" }} />
                    <ItemIcon item={weapon.item} size={36} />
                    <Text style={[ui.number, { fontSize: 10, color: weapon.usable ? colors.muted : colors.scald }]}>
                      {weapon.equipped ? "in hand" : weapon.usable ? `Lv ${weapon.level_required}` : `🔒 ${weapon.level_required}`}
                    </Text>
                  </Pressable>
                );
              })}
          </View>
        </View>
      )}

      {/* The armour held: tap one to put it on. Armour adds to Fortitude against every hit. */}
      {armours.length > 0 && (
        <View style={{ gap: 4 }}>
          <Text style={[ui.muted, { fontSize: 11 }]}>Armour · tap to wear · Fortitude {fortitude}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {armours.map((armour) => {
              const on = armour.item === tinker.armour;
              const usable = fortitude >= armour.level_required;
              return (
                <Pressable
                  key={armour.item}
                  disabled={on || !usable}
                  onPress={() => onWear(armour.item)}
                  accessibilityRole="button"
                  accessibilityLabel={on ? `${name(armour.item)}, worn` : usable ? `Wear ${name(armour.item)}` : `${name(armour.item)}, needs Fortitude ${armour.level_required}`}
                  style={{
                    width: 58,
                    height: 66,
                    borderRadius: 6,
                    borderWidth: on ? 2 : 1,
                    borderColor: on ? colors.brass : colors.panelEdge,
                    backgroundColor: on ? "#2f2619" : colors.soot,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: usable ? 1 : 0.5,
                  }}
                >
                  <ItemIcon item={armour.item} size={36} />
                  <Text style={[ui.number, { fontSize: 10, color: usable ? colors.muted : colors.scald }]}>
                    {on ? "worn" : usable ? `+${armour.armour}` : `🔒 ${armour.level_required}`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

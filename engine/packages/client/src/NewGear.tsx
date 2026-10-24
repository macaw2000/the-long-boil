// A new weapon's arrival: the first time one lands in the stores, it is shown
// off on a card with light wheeling behind it, its stats against the weapon
// in hand, and a button to put it on at once.

import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import type { Content, Tinker } from "./api";
import { useReducedMotion } from "./Juice";
import { gearTier, STYLE_COLOURS } from "./Loadout";
import { ItemIcon } from "./Sprite";
import { titleCase } from "./format";
import { colors, fonts, ui } from "./theme";

export function NewGear({
  item,
  content,
  tinker,
  name,
  onEquip,
  onClose,
}: {
  item: string;
  content: Content;
  tinker: Tinker;
  name: (item: string) => string;
  onEquip: (item: string) => void;
  onClose: () => void;
}) {
  const reduced = useReducedMotion();
  const enter = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    Animated.spring(enter, { toValue: 1, friction: 5, tension: 90, useNativeDriver: false }).start();
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 6000, easing: Easing.linear, useNativeDriver: false }));
    loop.start();
    return () => loop.stop();
  }, [reduced, enter, spin]);

  const weapon = content.weapons.find((candidate) => candidate.item === item);
  if (!weapon) return null;
  const tier = gearTier(weapon.level_required);
  const inHand = content.weapons.find((candidate) => candidate.item === tinker.weapon);
  const level = tinker.skills.find((skill) => skill.skill === weapon.style)?.level ?? 1;
  const usable = level >= weapon.level_required;
  const diff = (after: number, before: number | undefined) =>
    before === undefined || after === before ? "" : ` (${after > before ? "+" : ""}${after - before})`;

  return (
    <View
      style={{ position: "absolute", inset: 0, backgroundColor: "rgba(10,8,6,0.72)", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}
      accessibilityViewIsModal
    >
      <Animated.View
        style={[
          ui.panel,
          {
            width: 320,
            maxWidth: "100%",
            alignItems: "center",
            borderColor: tier.colour,
            borderWidth: 2,
            gap: 10,
            opacity: enter,
            transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
          },
        ]}
      >
        <Text style={[ui.muted, { letterSpacing: 2, color: tier.colour, fontWeight: "700" }]}>NEW GEAR</Text>
        <View style={{ width: 140, height: 140, alignItems: "center", justifyContent: "center" }}>
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              width: 140,
              height: 140,
              transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }],
            }}
          >
            {Array.from({ length: 8 }, (_, index) => (
              <View
                key={index}
                style={{
                  position: "absolute",
                  left: 66,
                  top: 0,
                  width: 8,
                  height: 70,
                  backgroundColor: tier.colour,
                  opacity: 0.18,
                  borderRadius: 4,
                  transform: [{ translateY: 35 }, { rotate: `${index * 45}deg` }, { translateY: -35 }],
                }}
              />
            ))}
          </Animated.View>
          <View style={{ width: 88, height: 88, borderRadius: 12, borderWidth: 2, borderColor: tier.colour, backgroundColor: colors.soot, alignItems: "center", justifyContent: "center" }}>
            <ItemIcon item={item} size={64} />
          </View>
        </View>
        <Text style={{ color: tier.colour, fontFamily: fonts.serif, fontSize: 20, fontWeight: "900", textAlign: "center" }}>{name(item)}</Text>
        <Text style={[ui.muted, { color: STYLE_COLOURS[weapon.style] }]}>
          {titleCase(weapon.style)} · level {weapon.level_required} · {tier.name}
        </Text>
        <Text style={ui.number}>
          Power {weapon.power}
          <Text style={{ color: inHand && weapon.power > inHand.power ? colors.verdigris : colors.muted }}>{diff(weapon.power, inHand?.power)}</Text>
          {"   "}Accuracy {weapon.accuracy}
          <Text style={{ color: inHand && weapon.accuracy > inHand.accuracy ? colors.verdigris : colors.muted }}>{diff(weapon.accuracy, inHand?.accuracy)}</Text>
        </Text>
        {inHand && <Text style={[ui.muted, { fontSize: 12 }]}>against your {name(inHand.item)}</Text>}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            disabled={!usable}
            onPress={() => onEquip(item)}
            accessibilityRole="button"
            style={[ui.button, { paddingVertical: 10, paddingHorizontal: 18 }, !usable && { opacity: 0.45 }]}
          >
            <Text style={[ui.buttonText, { fontSize: 16 }]}>{usable ? "Equip now" : `Needs ${titleCase(weapon.style)} ${weapon.level_required}`}</Text>
          </Pressable>
          <Pressable onPress={onClose} accessibilityRole="button" style={{ paddingVertical: 10, paddingHorizontal: 12 }}>
            <Text style={ui.muted}>Later</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

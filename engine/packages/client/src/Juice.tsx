// Motion and feedback (docs/art-brief.md, UI mock-ups: "a round brass
// pressure gauge with a needle, marked 0 to 12 hours, venting steam near
// empty"; "a progress bar styled as a glass tube filling with steam"; GDD
// section 4, "Scald reddens the frame's edges"). Built on React Native's own
// Animated, so it runs on web and phone with no extra dependency. Every loop
// stops when the player has asked the system to reduce motion.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, Text, View, type StyleProp, type TextStyle } from "react-native";
import { colors, fonts } from "./theme";

const NATIVE = false; // react-native-web animates on the JS side either way.

/** True when the player has asked for reduced motion; loops and bursts then stay still. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => live && setReduced(value))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.("reduceMotionChanged", (value: boolean) => setReduced(value));
    return () => {
      live = false;
      sub?.remove?.();
    };
  }, []);
  return reduced;
}

/** A value that springs to its target whenever the target changes. */
function useSpring(target: number, reduced: boolean) {
  const value = useRef(new Animated.Value(target)).current;
  useEffect(() => {
    if (reduced) value.setValue(target);
    else Animated.spring(value, { toValue: target, friction: 7, tension: 60, useNativeDriver: NATIVE }).start();
  }, [target, reduced, value]);
  return value;
}

/** A looping 0 to 1 to 0 value, for idle motion. */
function useLoop(active: boolean, duration: number, reduced: boolean) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active || reduced) {
      value.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
        Animated.timing(value, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, duration, reduced, value]);
  return value;
}

/**
 * A brass count badge for a tab. It pops in when the count rises and, while
 * it is above zero, gives a small wiggle every few seconds to draw the eye.
 */
export function Badge({ count, label, tone = colors.brass }: { count: number; label?: string; tone?: string }) {
  const reduced = useReducedMotion();
  const pop = useRef(new Animated.Value(count > 0 ? 1 : 0)).current;
  const wiggle = useRef(new Animated.Value(0)).current;
  const previous = useRef(count);

  useEffect(() => {
    if (count > previous.current && !reduced) {
      pop.setValue(0.2);
      Animated.spring(pop, { toValue: 1, friction: 3, tension: 140, useNativeDriver: NATIVE }).start();
    } else {
      pop.setValue(count > 0 ? 1 : 0);
    }
    previous.current = count;
  }, [count, reduced, pop]);

  useEffect(() => {
    if (count <= 0 || reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(2600),
        Animated.timing(wiggle, { toValue: 1, duration: 90, useNativeDriver: NATIVE }),
        Animated.timing(wiggle, { toValue: -1, duration: 120, useNativeDriver: NATIVE }),
        Animated.timing(wiggle, { toValue: 0.6, duration: 100, useNativeDriver: NATIVE }),
        Animated.timing(wiggle, { toValue: 0, duration: 120, useNativeDriver: NATIVE }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [count, reduced, wiggle]);

  if (count <= 0 && !label) return null;
  return (
    <Animated.View
      style={{
        minWidth: 20,
        height: 20,
        paddingHorizontal: 6,
        borderRadius: 10,
        backgroundColor: tone,
        borderWidth: 1,
        borderColor: colors.ink,
        alignItems: "center",
        justifyContent: "center",
        transform: [
          { scale: pop },
          { rotate: wiggle.interpolate({ inputRange: [-1, 1], outputRange: ["-14deg", "14deg"] }) },
        ],
      }}
    >
      <Text style={{ color: colors.soot, fontFamily: fonts.mono, fontSize: 11, fontWeight: "700" }}>{label ?? count}</Text>
    </Animated.View>
  );
}

/**
 * A pneumatic canister that drops onto whatever it is placed over, bounces,
 * and fades. Bump `drops` to send another.
 */
export function CanisterDrop({ drops }: { drops: number }) {
  const reduced = useReducedMotion();
  const fall = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduced) return;
    fall.setValue(0);
    fade.setValue(1);
    Animated.sequence([
      Animated.timing(fall, { toValue: 1, duration: 520, easing: Easing.bounce, useNativeDriver: NATIVE }),
      Animated.delay(500),
      Animated.timing(fade, { toValue: 0, duration: 400, useNativeDriver: NATIVE }),
    ]).start();
  }, [drops, reduced, fall, fade]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: -6,
        right: -10,
        opacity: fade,
        transform: [{ translateY: fall.interpolate({ inputRange: [0, 1], outputRange: [-90, 0] }) }, { rotate: "18deg" }],
      }}
    >
      <View style={{ width: 12, height: 24, borderRadius: 6, backgroundColor: colors.brass, borderWidth: 1, borderColor: colors.soot }}>
        <View style={{ height: 5, borderTopLeftRadius: 5, borderTopRightRadius: 5, backgroundColor: colors.copper }} />
      </View>
    </Animated.View>
  );
}

/**
 * The Boiler as a round brass pressure gauge, 0 to 12 hours, its needle
 * falling as the steam runs down and puffs of steam venting near empty.
 */
export function Gauge({ fraction, size = 58 }: { fraction: number; size?: number }) {
  const reduced = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, fraction));
  const needle = useSpring(clamped, reduced);
  const sweep = 240; // degrees, from -120 to +120
  const venting = clamped < 0.2;
  const ticks = Array.from({ length: 13 }, (_, hour) => -sweep / 2 + (sweep * hour) / 12);

  return (
    <View style={{ width: size, height: size }} accessibilityRole="image" accessibilityLabel={`Boiler gauge, ${Math.round(clamped * 12)} of 12 hours`}>
      <View
        style={{
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.steam,
          borderWidth: 3,
          borderColor: colors.brass,
        }}
      />
      {ticks.map((angle, hour) => (
        <View
          key={hour}
          style={{ position: "absolute", width: size, height: size, alignItems: "center", transform: [{ rotate: `${angle}deg` }] }}
        >
          <View style={{ marginTop: 5, width: hour % 6 === 0 ? 2 : 1, height: hour % 3 === 0 ? 7 : 4, backgroundColor: colors.soot }} />
        </View>
      ))}
      <View style={{ position: "absolute", top: 5, left: size * 0.62, width: 8, height: 5, backgroundColor: colors.scald, opacity: 0.8, transform: [{ rotate: "-55deg" }] }} />
      <Animated.View
        style={{
          position: "absolute",
          width: size,
          height: size,
          alignItems: "center",
          transform: [{ rotate: needle.interpolate({ inputRange: [0, 1], outputRange: [`${-sweep / 2}deg`, `${sweep / 2}deg`] }) }],
        }}
      >
        <View style={{ marginTop: 7, width: 2, height: size / 2 - 7, backgroundColor: clamped < 0.2 ? colors.scald : colors.soot, borderRadius: 1 }} />
      </Animated.View>
      <View style={{ position: "absolute", left: size / 2 - 4, top: size / 2 - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brassDim }} />
      {venting && !reduced && [0, 1, 2].map((puff) => <SteamPuff key={puff} delay={puff * 450} left={size * 0.7} />)}
    </View>
  );
}

function SteamPuff({ delay, left }: { delay: number; left: number }) {
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(rise, { toValue: 1, duration: 1300, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE }),
        Animated.timing(rise, { toValue: 0, duration: 0, useNativeDriver: NATIVE }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delay, rise]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left,
        top: 0,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: colors.steam,
        opacity: rise.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.7, 0] }),
        transform: [
          { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [0, -26] }) },
          { translateX: rise.interpolate({ inputRange: [0, 1], outputRange: [0, 8] }) },
          { scale: rise.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.8] }) },
        ],
      }}
    />
  );
}

/** A glass tube filling with steam, for a job's progress; a highlight drifts along it while it works. */
export function SteamTube({ fraction, working }: { fraction: number; working: boolean }) {
  const reduced = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, fraction));
  const shimmer = useLoop(working, 900, reduced);
  return (
    <View
      style={{
        height: 12,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: colors.brassDim,
        backgroundColor: "rgba(217, 210, 195, 0.08)",
        overflow: "hidden",
      }}
    >
      <View style={{ width: `${clamped * 100}%`, height: "100%", backgroundColor: colors.steam, opacity: 0.75 }}>
        <Animated.View
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            width: 18,
            backgroundColor: "rgba(255, 255, 255, 0.55)",
            left: shimmer.interpolate({ inputRange: [0, 1], outputRange: ["-10%", "90%"] }),
          }}
        />
      </View>
      <View style={{ position: "absolute", top: 2, left: 6, right: 6, height: 2, borderRadius: 1, backgroundColor: "rgba(255, 255, 255, 0.25)" }} />
    </View>
  );
}

/** A number that counts up or down to its new value instead of jumping. */
export function CountUp({ value, style, suffix = "" }: { value: number; style?: StyleProp<TextStyle>; suffix?: string }) {
  const reduced = useReducedMotion();
  const animated = useRef(new Animated.Value(value)).current;
  const [shown, setShown] = useState(value);
  const flash = useRef(new Animated.Value(0)).current;
  const previous = useRef(value);

  useEffect(() => {
    const id = animated.addListener(({ value: current }) => setShown(Math.round(current)));
    return () => animated.removeListener(id);
  }, [animated]);

  useEffect(() => {
    if (reduced || value === previous.current) {
      animated.setValue(value);
      setShown(value);
    } else {
      Animated.timing(animated, { toValue: value, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }).start();
      flash.setValue(1);
      Animated.timing(flash, { toValue: 0, duration: 900, useNativeDriver: NATIVE }).start();
    }
    previous.current = value;
  }, [value, reduced, animated, flash]);

  return (
    <Animated.Text style={[style, { transform: [{ scale: flash.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) }] }]}>
      {shown.toLocaleString()}
      {suffix}
    </Animated.Text>
  );
}

export interface Floater {
  id: number;
  text: string;
  color: string;
  /** An item id, to show its icon beside the text. */
  item?: string;
}

let floaterId = 0;

/** A stack of short messages ("+1 Brass Spanner") that rise and fade. */
export function useFloaters(): [Floater[], (text: string, color?: string, item?: string) => void, (id: number) => void] {
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const add = (text: string, color: string = colors.brass, item?: string) =>
    setFloaters((list) => [...list.slice(-5), { id: ++floaterId, text, color, ...(item ? { item } : {}) }]);
  const remove = (id: number) => setFloaters((list) => list.filter((floater) => floater.id !== id));
  return [floaters, add, remove];
}

export function Floaters({
  floaters,
  onDone,
  icon,
}: {
  floaters: Floater[];
  onDone: (id: number) => void;
  /** Renders an item's icon; passed in so this file needs no sprite imports. */
  icon?: (item: string) => ReactNode;
}) {
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, right: 12, alignItems: "flex-end", gap: 2, zIndex: 10 }}>
      {floaters.map((floater, index) => (
        <FloatingText key={floater.id} floater={floater} order={index} onDone={onDone} icon={icon} />
      ))}
    </View>
  );
}

function FloatingText({
  floater,
  order,
  onDone,
  icon,
}: {
  floater: Floater;
  order: number;
  onDone: (id: number) => void;
  icon?: ((item: string) => ReactNode) | undefined;
}) {
  const reduced = useReducedMotion();
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.timing(rise, {
      toValue: 1,
      duration: reduced ? 1800 : 1600,
      delay: order * 120,
      easing: Easing.out(Easing.quad),
      useNativeDriver: NATIVE,
    });
    animation.start(() => onDone(floater.id));
    return () => animation.stop();
    // Each floater animates once, from when it mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Animated.View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        opacity: rise.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 1, 1, 0] }),
        transform: [
          { translateY: reduced ? 0 : rise.interpolate({ inputRange: [0, 1], outputRange: [10, -36] }) },
          { scale: reduced ? 1 : rise.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0.6, 1.15, 1] }) },
        ],
      }}
    >
      {floater.item && icon ? icon(floater.item) : null}
      <Text
        style={{
          color: floater.color,
          fontFamily: fonts.serif,
          fontWeight: "700",
          fontSize: 16,
          textShadowColor: colors.soot,
          textShadowRadius: 4,
        }}
      >
        {floater.text}
      </Text>
    </Animated.View>
  );
}

/** A burst of brass sparks around its children; bump `bursts` to fire another. */
export function Sparks({ bursts, children }: { bursts: number; children: ReactNode }) {
  const reduced = useReducedMotion();
  const burst = useRef(new Animated.Value(0)).current;
  const angles = useRef(Array.from({ length: 10 }, (_, i) => (i / 10) * 2 * Math.PI + Math.random() * 0.4)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduced) return;
    burst.setValue(0);
    Animated.timing(burst, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }).start();
  }, [bursts, reduced, burst]);
  return (
    <View style={{ position: "relative" }}>
      {children}
      <View pointerEvents="none" style={{ position: "absolute", left: "50%", top: "50%" }}>
        {angles.map((angle, index) => (
          <Animated.View
            key={index}
            style={{
              position: "absolute",
              width: index % 3 === 0 ? 5 : 3,
              height: index % 3 === 0 ? 5 : 3,
              borderRadius: 3,
              backgroundColor: index % 2 ? colors.brass : colors.copper,
              opacity: burst.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 1, 0] }),
              transform: [
                { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * 46] }) },
                { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * 26] }) },
              ],
            }}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * A challenge's roll as a dial: the green wedge is the chance of success,
 * and the needle sweeps across the face before settling on the roll.
 */
export function OddsDial({ odds, roll, success, size = 92 }: { odds: number; roll: number; success: boolean; size?: number }) {
  const reduced = useReducedMotion();
  const needle = useRef(new Animated.Value(reduced ? roll : 0)).current;
  useEffect(() => {
    if (reduced) {
      needle.setValue(roll);
      return;
    }
    needle.setValue(0);
    Animated.sequence([
      Animated.timing(needle, { toValue: 1, duration: 450, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE }),
      Animated.timing(needle, { toValue: 0.15, duration: 380, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE }),
      Animated.spring(needle, { toValue: roll, friction: 4, tension: 40, useNativeDriver: NATIVE }),
    ]).start();
  }, [roll, reduced, needle]);

  // The face runs left (0) to right (1) across the top half; the success wedge is 0 to odds.
  const segments = 24;
  return (
    <View style={{ width: size, height: size / 2 + 10, alignItems: "center" }} accessibilityLabel={`${Math.round(odds * 100)}% odds, ${success ? "success" : "failure"}`}>
      <View style={{ width: size, height: size / 2, overflow: "hidden" }}>
        {Array.from({ length: segments }, (_, i) => {
          const at = (i + 0.5) / segments;
          const angle = -90 + at * 180;
          return (
            <View key={i} style={{ position: "absolute", width: size, height: size, alignItems: "center", transform: [{ rotate: `${angle}deg` }] }}>
              <View style={{ width: (Math.PI * size) / segments / 1.6, height: 12, backgroundColor: at <= odds ? colors.verdigris : colors.scald, opacity: 0.85 }} />
            </View>
          );
        })}
        <Animated.View
          style={{
            position: "absolute",
            width: size,
            height: size,
            alignItems: "center",
            transform: [{ rotate: needle.interpolate({ inputRange: [0, 1], outputRange: ["-90deg", "90deg"] }) }],
          }}
        >
          <View style={{ marginTop: 4, width: 3, height: size / 2 - 4, backgroundColor: colors.ink, borderRadius: 2 }} />
        </Animated.View>
      </View>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brass, marginTop: -5 }} />
    </View>
  );
}

/** Scald reddens the frame's edges as it rises (GDD section 4), and throbs near redline. */
export function ScaldVignette({ scald }: { scald: number }) {
  const reduced = useReducedMotion();
  const throb = useLoop(scald >= 6, 1100, reduced);
  if (scald <= 0) return null;
  const base = Math.min(1, scald / 8) * 0.55;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderWidth: 6 + scald * 2,
        borderColor: colors.scald,
        opacity: throb.interpolate({ inputRange: [0, 1], outputRange: [base, Math.min(0.85, base + 0.2)] }),
      }}
    />
  );
}

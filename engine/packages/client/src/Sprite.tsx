// Sprites on screen: item icons, and the scene at the top of the bench where
// the Tinker works or fights. Frames come from src/sprites.ts, which
// scripts/art/build_sprites.py generates; the PNGs are drawn at an exact
// multiple of their pixel size and shown at that size, so they stay crisp.

import { useEffect, useRef, useState } from "react";
import { Easing } from "react-native";
import { Animated, Image, Text, View } from "react-native";
import type { Content, Tinker } from "./api";
import { useReducedMotion } from "./Juice";
import { backgrounds, characters, icons } from "./sprites";
import { colors, ui } from "./theme";

const CHARACTER_PX = 144; // 48 pixels at 3x
const BOSS_PX = 192; // 96 pixels at 2x, so a boss fits the scene
const SCENE_HEIGHT = 192; // the 64-pixel backgrounds at 3x
const FLOOR = 150; // where feet stand, in scene pixels

/** An item's icon, or a riveted crate for anything not drawn yet. */
export function ItemIcon({ item, size = 24 }: { item: string; size?: number }) {
  const source = icons[item] ?? icons.fallback;
  return <Image source={source as number} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />;
}

/** A shared frame clock, so the Tinker's swing and the monster's flinch land together. */
function useFrameClock(fps: number, running: boolean) {
  const reduced = useReducedMotion();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!running || reduced) return;
    const timer = setInterval(() => setTick((t) => t + 1), 1000 / fps);
    return () => clearInterval(timer);
  }, [fps, running, reduced]);
  return tick;
}

function Frame({ frames, tick, size, flip, style }: { frames: number[]; tick: number; size: number; flip?: boolean; style?: object }) {
  const source = frames[tick % frames.length] ?? frames[0];
  return (
    <Image
      source={source as number}
      style={[{ width: size, height: size, transform: flip ? [{ scaleX: -1 }] : [] }, style]}
      accessibilityIgnoresInvertColors
    />
  );
}

type Puff = { id: number; x: number; y: number; kind: "spark" | "dust" | "glint" | "damage" | "tracer" | "bolt"; text?: string; toX?: number; toY?: number };
let puffId = 0;

/**
 * One burst at a point in the scene: sparks or dust scattering, a glint, or a
 * damage number rising. It plays once and then asks to be removed.
 */
function PuffView({ puff, onDone }: { puff: Puff; onDone: (id: number) => void }) {
  const t = useRef(new Animated.Value(0)).current;
  const angles = useRef(Array.from({ length: puff.kind === "damage" ? 0 : 7 }, () => Math.random() * Math.PI - Math.PI)).current;
  const duration = puff.kind === "damage" ? 800 : puff.kind === "tracer" ? 160 : puff.kind === "bolt" ? 280 : 480;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration, easing: puff.kind === "tracer" ? Easing.linear : Easing.out(Easing.quad), useNativeDriver: false }).start(() =>
      onDone(puff.id),
    );
    // Each burst plays once from when it mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // A shot: a hot streak flying from the muzzle to the target.
  if (puff.kind === "tracer") {
    const reach = (puff.toX ?? puff.x + 60) - puff.x;
    return (
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: puff.x,
          top: puff.y,
          width: 14,
          height: 3,
          borderRadius: 2,
          backgroundColor: "#E07A2E",
          borderRightWidth: 4,
          borderRightColor: "#efe4cc",
          opacity: t.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }),
          transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, reach] }) }],
        }}
      />
    );
  }
  // Aetherics: a crooked bolt from the rod's tip to the target, flickering out.
  if (puff.kind === "bolt") {
    const points = boltPoints(puff);
    return (
      <Animated.View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, opacity: t.interpolate({ inputRange: [0, 0.2, 0.4, 0.6, 1], outputRange: [1, 0.4, 1, 0.6, 0] }) }}>
        {points.slice(1).map((point, index) => {
          const from = points[index]!;
          const dx = point.x - from.x;
          const dy = point.y - from.y;
          const length = Math.hypot(dx, dy);
          return (
            <View
              key={index}
              style={{
                position: "absolute",
                left: (from.x + point.x) / 2 - length / 2,
                top: (from.y + point.y) / 2 - 1.5,
                width: length,
                height: 3,
                backgroundColor: index % 2 ? "#efe4cc" : colors.verdigris,
                transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
              }}
            />
          );
        })}
      </Animated.View>
    );
  }
  if (puff.kind === "damage") {
    return (
      <Animated.Text
        pointerEvents="none"
        style={{
          position: "absolute",
          left: puff.x,
          top: puff.y,
          color: colors.steam,
          fontWeight: "900",
          fontSize: 18,
          textShadowColor: colors.soot,
          textShadowRadius: 3,
          opacity: t.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
          transform: [
            { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -34] }) },
            { scale: t.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0.5, 1.4, 1] }) },
          ],
        }}
      >
        {puff.text}
      </Animated.Text>
    );
  }
  const tone = puff.kind === "spark" ? [colors.brass, "#E07A2E", "#efe4cc"] : puff.kind === "dust" ? ["#8E979A", "#A9A9A2", "#5E6466"] : ["#efe4cc", colors.brass];
  const reach = puff.kind === "dust" ? 22 : puff.kind === "glint" ? 10 : 30;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: puff.x, top: puff.y }}>
      {angles.map((angle, index) => (
        <Animated.View
          key={index}
          style={{
            position: "absolute",
            width: puff.kind === "dust" ? 5 : 4,
            height: puff.kind === "dust" ? 5 : 4,
            backgroundColor: tone[index % tone.length],
            opacity: t.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
            transform: [
              { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * reach] }) },
              { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * reach + (puff.kind === "spark" ? 10 : 0)] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

/** A zigzag between a puff's two points, fixed per puff so it does not jitter as it fades. */
function boltPoints(puff: Puff): { x: number; y: number }[] {
  const toX = puff.toX ?? puff.x + 80;
  const toY = puff.toY ?? puff.y;
  const steps = 6;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const f = i / steps;
    const jag = i === 0 || i === steps ? 0 : ((puff.id * 7 + i * 13) % 11) - 5;
    return { x: puff.x + (toX - puff.x) * f, y: puff.y + (toY - puff.y) * f + jag };
  });
}

/** What the Tinker does with each skill's work. */
const POSE: Record<string, string> = {
  smithing: "hammer",
  prospecting: "pick",
  scavenging: "pick",
  tinkering: "tinker",
  cooking: "tinker",
};

/**
 * The scene above the bench. Idle, the Tinker stands in the workshop. At a
 * job, the Tinker works it. In a fight, the scene moves to Rustmoor: the
 * monster's health drains over each kill, it flinches at every swing, and it
 * falls when the kill lands, then the next one comes on.
 */
export function Scene({ tinker, content, progress, working }: { tinker: Tinker; content: Content; progress: number; working: boolean }) {
  const head = tinker.queue[0];
  const monster = head ? content.monsters.find((candidate) => candidate.id === head.actionId) : undefined;
  const action = head ? content.actions.find((candidate) => candidate.id === head.actionId) : undefined;
  const fighting = Boolean(monster && working);
  const tick = useFrameClock(fighting ? 4 : 3, true);

  // A kill shows as the progress wrapping back to the start.
  const [falling, setFalling] = useState(false);
  const last = useRef(progress);
  useEffect(() => {
    if (fighting && progress < last.current - 0.3) {
      setFalling(true);
      const timer = setTimeout(() => setFalling(false), 900);
      last.current = progress;
      return () => clearTimeout(timer);
    }
    last.current = progress;
  }, [progress, fighting]);

  const reduced = useReducedMotion();
  const [puffs, setPuffs] = useState<Puff[]>([]);
  const lastSwing = useRef(progress);
  const shake = useRef(new Animated.Value(0)).current;

  // Each beat of work or a fight lands with something to see.
  useEffect(() => {
    if (reduced || !working || !head || tick % 2 !== 1) return;
    const add = (puff: Omit<Puff, "id">) => setPuffs((list) => [...list.slice(-12), { ...puff, id: ++puffId }]);
    if (monster) {
      if (falling) return;
      const dealt = Math.max(1, Math.round((progress - lastSwing.current) * monster.hp));
      lastSwing.current = progress;
      const x = monster.boss ? 200 : 190;
      // Each style lands its own way: a swing, a shot, or a bolt.
      if (style === "marksmanship") add({ x: 145, y: FLOOR - 64, kind: "tracer", toX: x });
      if (style === "aetherics") add({ x: 120, y: FLOOR - 102, kind: "bolt", toX: x, toY: FLOOR - 72 });
      add({ x, y: FLOOR - 70, kind: "spark" });
      add({ x: x + 10, y: FLOOR - (monster.boss ? 150 : 110), kind: "damage", text: `-${dealt}` });
      if (monster.boss) {
        shake.setValue(1);
        Animated.timing(shake, { toValue: 0, duration: 240, useNativeDriver: false }).start();
      }
    } else if (pose === "hammer") {
      add({ x: 125, y: FLOOR - 26, kind: "spark" });
    } else if (pose === "pick") {
      add({ x: 128, y: FLOOR - 20, kind: "dust" });
    } else if (pose === "tinker") {
      add({ x: 124, y: FLOOR - 52, kind: "glint" });
    }
    // Fires once per beat of the shared clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const tinkerFrames = characters.tinker!;
  const pose = !working || !head ? "idle" : monster ? "attack" : (POSE[action?.skill ?? ""] ?? "hammer");
  // With a weapon equipped, the Tinker holds it when idle and fights with it in its own style.
  const armed = tinker.weapon ? characters[`tinker:${tinker.weapon}`] : undefined;
  const style = content.weapons.find((weapon) => weapon.item === tinker.weapon)?.style;
  const shownFrames = armed && (pose === "attack" || pose === "idle") ? armed[pose] : tinkerFrames[pose];
  const monsterFrames = monster ? characters[monster.id] : undefined;
  const boss = Boolean(monster?.boss);
  const monsterSize = boss ? BOSS_PX : CHARACTER_PX;
  const swinging = fighting && tick % 2 === 1;

  return (
    <Animated.View
      style={{
        transform: [{ translateX: shake.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, -4, 4, -3, 0] }) }],
        height: SCENE_HEIGHT,
        borderRadius: 6,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: colors.panelEdge,
        backgroundColor: colors.soot,
      }}
    >
      <Image
        source={(fighting ? backgrounds.rustmoor : backgrounds.workshop) as number}
        style={{ position: "absolute", left: "50%", marginLeft: -240, width: 480, height: SCENE_HEIGHT }}
        accessibilityIgnoresInvertColors
      />
      <View style={{ position: "absolute", left: 12, top: FLOOR - 132 }}>
        <Frame frames={shownFrames ?? tinkerFrames.idle!} tick={tick} size={CHARACTER_PX} />
      </View>
      {fighting && monsterFrames && (
        <View style={{ position: "absolute", left: boss ? 130 : 150, top: FLOOR - (boss ? 164 : 132) }}>
          <Frame
            frames={falling ? monsterFrames.dead! : !swinging && tick % 4 === 0 ? monsterFrames.attack! : monsterFrames.idle!}
            tick={tick}
            size={monsterSize}
            style={{ opacity: swinging && !falling ? 0.7 : 1, marginLeft: swinging && !falling ? 6 : 0 }}
          />
          {!falling && <HealthBar fraction={1 - progress} width={boss ? 160 : 90} />}
        </View>
      )}
      {!working && head && <Text style={[ui.muted, { position: "absolute", right: 10, bottom: 8 }]}>The Boiler is dry.</Text>}
      {!head && <Text style={[ui.muted, { position: "absolute", right: 10, bottom: 8, color: colors.ink }]}>Idle. Queue some work.</Text>}
      {puffs.map((puff) => (
        <PuffView key={puff.id} puff={puff} onDone={(id) => setPuffs((list) => list.filter((entry) => entry.id !== id))} />
      ))}
    </Animated.View>
  );
}

function HealthBar({ fraction, width }: { fraction: number; width: number }) {
  const value = useRef(new Animated.Value(fraction)).current;
  useEffect(() => {
    Animated.timing(value, { toValue: Math.max(0, Math.min(1, fraction)), duration: 300, useNativeDriver: false }).start();
  }, [fraction, value]);
  return (
    <View style={{ position: "absolute", top: 6, left: 24, width, height: 7, borderRadius: 3, backgroundColor: colors.soot, borderWidth: 1, borderColor: colors.ink }}>
      <Animated.View
        style={{
          height: "100%",
          borderRadius: 3,
          backgroundColor: colors.scald,
          width: value.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
        }}
      />
    </View>
  );
}

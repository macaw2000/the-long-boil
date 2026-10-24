// Sprites on screen: item icons, and the scene at the top of the bench where
// the Tinker works or fights. Frames come from src/sprites.ts, which
// scripts/art/build_sprites.py generates; the PNGs are drawn at an exact
// multiple of their pixel size and shown at that size, so they stay crisp.

import { useEffect, useRef, useState } from "react";
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

  const tinkerFrames = characters.tinker!;
  const pose = !working || !head ? "idle" : monster ? "attack" : (POSE[action?.skill ?? ""] ?? "hammer");
  const monsterFrames = monster ? characters[monster.id] : undefined;
  const boss = Boolean(monster?.boss);
  const monsterSize = boss ? BOSS_PX : CHARACTER_PX;
  const swinging = fighting && tick % 2 === 1;

  return (
    <View
      style={{
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
        <Frame frames={tinkerFrames[pose] ?? tinkerFrames.idle!} tick={tick} size={CHARACTER_PX} />
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
    </View>
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

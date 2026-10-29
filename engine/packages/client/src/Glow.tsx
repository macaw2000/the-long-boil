// A pulsing ring around whatever the player should press next. When inactive
// it renders its children untouched, so it can wrap any control. The guide's
// ring is thicker and gold, brighter than the brass the screen is drawn in,
// and scrolls its control into view; the nudges after the guide stay brass.

import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, View, type StyleProp, type ViewStyle } from "react-native";
import { colors } from "./theme";

const GUIDE_GOLD = "#f2c14e";

export function Glow({
  active,
  guide = false,
  children,
  style,
}: {
  active: boolean;
  /** The guide's one pointer, rather than a nudge. */
  guide?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const pulse = useRef(new Animated.Value(0)).current;
  const box = useRef<View>(null);

  useEffect(() => {
    if (!active) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  // On the web a View is its element: bring the guide's pointer on screen, so a
  // Start button below the fold is never the thing the player cannot find.
  useEffect(() => {
    if (!active || !guide) return;
    const element = box.current as unknown as { scrollIntoView?: (options: object) => void } | null;
    const timer = setTimeout(() => element?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }), 150);
    return () => clearTimeout(timer);
  }, [active, guide]);

  const tone = guide ? GUIDE_GOLD : colors.brass;
  return (
    <View ref={box} style={[{ position: "relative" }, style]}>
      {children}
      {active && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: guide ? -5 : -4,
            left: guide ? -5 : -4,
            right: guide ? -5 : -4,
            bottom: guide ? -5 : -4,
            borderRadius: 8,
            borderWidth: guide ? 3 : 2,
            borderColor: tone,
            backgroundColor: guide ? "rgba(242, 193, 78, 0.08)" : "transparent",
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: guide ? [0.55, 1] : [0.25, 1] }),
            shadowColor: tone,
            shadowOpacity: guide ? 1 : 0.8,
            shadowRadius: pulse.interpolate({ inputRange: [0, 1], outputRange: guide ? [6, 20] : [2, 12] }),
          }}
        />
      )}
    </View>
  );
}

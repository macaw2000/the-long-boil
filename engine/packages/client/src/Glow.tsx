// A pulsing brass ring around whatever the player should press next. When
// inactive it renders its children untouched, so it can wrap any control.

import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, View, type StyleProp, type ViewStyle } from "react-native";
import { colors } from "./theme";

export function Glow({ active, children, style }: { active: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const pulse = useRef(new Animated.Value(0)).current;

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

  return (
    <View style={[{ position: "relative" }, style]}>
      {children}
      {active && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -4,
            left: -4,
            right: -4,
            bottom: -4,
            borderRadius: 8,
            borderWidth: 2,
            borderColor: colors.brass,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }),
            shadowColor: colors.brass,
            shadowOpacity: 0.8,
            shadowRadius: pulse.interpolate({ inputRange: [0, 1], outputRange: [2, 12] }),
          }}
        />
      )}
    </View>
  );
}

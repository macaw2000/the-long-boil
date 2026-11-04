// A word on the screen that explains itself: hover it on a desktop, or tap
// it on a phone, and a short definition from glossary.ts opens below it.
// Screen readers get the definition as the element's hint.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { glossary, type GlossaryTerm } from "./glossary";
import { colors, ui } from "./theme";

const BOX_WIDTH = 260;
/** The gap kept between the definition and the window's edge. */
const EDGE = 12;

export function Term({
  term,
  children,
  onOpenChange,
}: {
  term: GlossaryTerm;
  children: ReactNode;
  /** For a parent that must rise above its siblings while the definition shows (react-native-web gives every View z-index 0). */
  onOpenChange?: (open: boolean) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || pinned;
  useEffect(() => onOpenChange?.(open), [open]);
  // Near the window's right edge the definition slides left so none of it is cut off.
  const { width: windowWidth } = useWindowDimensions();
  const anchor = useRef<View>(null);
  const [shift, setShift] = useState(0);
  const boxWidth = Math.min(BOX_WIDTH, windowWidth - 2 * EDGE);
  useEffect(() => {
    if (!open) return;
    anchor.current?.measureInWindow((x) => setShift(Math.min(0, windowWidth - EDGE - (x + boxWidth))));
  }, [open, windowWidth, boxWidth]);
  return (
    <View ref={anchor} style={{ position: "relative", zIndex: open ? 50 : 0 }}>
      <Pressable
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        onPress={() => setPinned((value) => !value)}
        accessibilityRole="button"
        accessibilityHint={glossary[term]}
        style={{ cursor: "help" } as object}
      >
        {children}
      </Pressable>
      {open && (
        <View
          pointerEvents="none"
          style={[ui.panel, { position: "absolute", top: "100%", left: shift, marginTop: 4, width: boxWidth, borderColor: colors.brassDim, zIndex: 50 }]}
        >
          <Text style={[ui.text, { fontSize: 13, lineHeight: 19 }]}>{glossary[term]}</Text>
        </View>
      )}
    </View>
  );
}

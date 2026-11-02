// A word on the screen that explains itself: hover it on a desktop, or tap
// it on a phone, and a short definition from glossary.ts opens below it.
// Screen readers get the definition as the element's hint.

import { useEffect, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { glossary, type GlossaryTerm } from "./glossary";
import { colors, ui } from "./theme";

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
  return (
    <View style={{ position: "relative", zIndex: open ? 50 : 0 }}>
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
          style={[ui.panel, { position: "absolute", top: "100%", left: 0, marginTop: 4, width: 260, borderColor: colors.brassDim, zIndex: 50 }]}
        >
          <Text style={[ui.text, { fontSize: 13, lineHeight: 19 }]}>{glossary[term]}</Text>
        </View>
      )}
    </View>
  );
}

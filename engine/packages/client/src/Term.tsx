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

/** The words in story text that open a definition, and the glossary entry each opens. */
const STORY_TERMS: [RegExp, GlossaryTerm][] = [
  [/\bCrowns?\b/, "crowns"],
  [/\bCounting-House\b/, "counting_house"],
  [/\bPneumatic Post\b/, "pneumatic_post"],
  [/\bBoiler\b/, "boiler"],
  [/\bNerve\b/, "nerve"],
  [/\bArrears\b/, "needle.arrears"],
  [/\bFoundry Pass\b/, "foundry_pass"],
  [/\bRations?\b/, "rations"],
];

/**
 * A paragraph of story text whose game words explain themselves: the first
 * time each appears it is underlined, and hovering or tapping it shows its
 * definition under the paragraph, where it cannot run off the screen.
 */
export function GlossedText({ text, style }: { text: string; style?: object }) {
  const [hovered, setHovered] = useState<GlossaryTerm | null>(null);
  const [pinned, setPinned] = useState<GlossaryTerm | null>(null);
  const shown = hovered ?? pinned;
  const pieces: (string | { word: string; term: GlossaryTerm })[] = [];
  let rest = text;
  const used = new Set<GlossaryTerm>();
  for (;;) {
    let first: { at: number; word: string; term: GlossaryTerm } | null = null;
    for (const [pattern, term] of STORY_TERMS) {
      if (used.has(term)) continue;
      const match = pattern.exec(rest);
      if (match && (!first || match.index < first.at)) first = { at: match.index, word: match[0], term };
    }
    if (!first) break;
    used.add(first.term);
    pieces.push(rest.slice(0, first.at), { word: first.word, term: first.term });
    rest = rest.slice(first.at + first.word.length);
  }
  pieces.push(rest);
  return (
    <View style={{ gap: 6 }}>
      <Text style={style}>
        {pieces.map((piece, index) =>
          typeof piece === "string" ? (
            piece
          ) : (
            <Text
              key={index}
              onPress={() => setPinned((term) => (term === piece.term ? null : piece.term))}
              accessibilityHint={glossary[piece.term]}
              style={{ textDecorationLine: "underline", textDecorationStyle: "dotted", cursor: "help" } as object}
              // react-native-web passes mouse events through to the span; there is no hover prop on Text.
              {...({ onMouseEnter: () => setHovered(piece.term), onMouseLeave: () => setHovered(null) } as object)}
            >
              {piece.word}
            </Text>
          ),
        )}
      </Text>
      {shown && (
        <View style={[ui.panel, { borderColor: colors.brassDim }]}>
          <Text style={[ui.text, { fontSize: 13, lineHeight: 19 }]}>{glossary[shown]}</Text>
        </View>
      )}
    </View>
  );
}

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

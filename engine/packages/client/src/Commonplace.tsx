// The Commonplace Book (GDD section 5): every lore fact a Tinker has
// uncovered, written down to be read again. Opened from the Story tab; the
// server builds it from the notes on the outcomes played and the Ledger Pages held.

import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api, type CommonplaceBook } from "./api";
import { colors, ui } from "./theme";

export function Commonplace({ tinkerId, onClose }: { tinkerId: number; onClose: () => void }) {
  const [book, setBook] = useState<CommonplaceBook | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .commonplace(tinkerId)
      .then(setBook)
      .catch((reason: Error) => setError(reason.message));
  }, [tinkerId]);

  return (
    <View style={{ gap: 12, maxWidth: 720, width: "100%" }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={ui.heading}>The Commonplace Book</Text>
        <Pressable onPress={onClose} accessibilityRole="button">
          <Text style={ui.muted}>Back to the story</Text>
        </Pressable>
      </View>
      {error && <Text style={[ui.text, { color: colors.scald }]}>{error}</Text>}
      {!book ? (
        !error && <Text style={ui.muted}>Finding the right page…</Text>
      ) : book.notes.length === 0 && book.pages.length === 0 ? (
        <Text style={ui.muted}>Nothing written in it yet. What you learn of the city is noted here.</Text>
      ) : (
        <>
          <Text style={ui.muted}>What you have learned of the city, written down to read again.</Text>
          {book.notes.length > 0 && (
            <View style={[ui.panel, { gap: 10 }]}>
              {book.notes.map((entry) => (
                <View key={`${entry.scene}/${entry.at}`} style={{ gap: 2 }}>
                  <Text style={[ui.text, { lineHeight: 21, fontStyle: "italic" }]}>{entry.note}</Text>
                  <Text style={ui.muted}>
                    {entry.sender ? `From ${entry.sender}'s letter · ` : ""}
                    {new Date(entry.at).toLocaleDateString([], { day: "numeric", month: "short" })}
                  </Text>
                </View>
              ))}
            </View>
          )}
          {book.pages.length > 0 && <Text style={[ui.heading, { fontSize: 15 }]}>From Hester's Ledger</Text>}
          {book.pages.map((page) => (
            <View key={page.item} style={[ui.panel, { gap: 6 }]}>
              <Text style={[ui.text, { color: colors.brass }]}>{page.title ?? page.name}</Text>
              {page.text ? <PageText text={page.text} /> : <Text style={ui.muted}>Not yet transcribed.</Text>}
            </View>
          ))}
        </>
      )}
    </View>
  );
}

/** A page's text in Hester's hand. A line with tabs in it is a ruled row: its cells line up in columns. */
export function PageText({ text }: { text: string }) {
  const hand = [ui.text, { lineHeight: 21, fontStyle: "italic" as const }];
  return (
    <View>
      {text.split("\n").map((line, i) =>
        line.includes("\t") ? (
          <View key={i} style={{ flexDirection: "row", maxWidth: 320 }}>
            {line.split("\t").map((cell, j) => (
              <Text key={j} style={[hand, { flex: 1, fontVariant: ["tabular-nums"] }]}>
                {cell}
              </Text>
            ))}
          </View>
        ) : (
          <Text key={i} style={hand}>
            {line}
          </Text>
        ),
      )}
    </View>
  );
}

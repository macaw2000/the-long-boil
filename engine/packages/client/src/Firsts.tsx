// Firsts (work order 049): one-off goals for the first hours, each paying a
// few Crowns when claimed. They give a player who stays something of their own
// to do. Those ready to claim come first, then the next few still open; the
// claimed ones fold away into a count, and the panel goes once all are done.

import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api, type Outcome, type Tinker } from "./api";
import { Glow } from "./Glow";
import { GOLD } from "./Guide";
import { Sparks } from "./Juice";
import { play } from "./sound";
import { UiIcon } from "./Sprite";
import { colors, ui } from "./theme";

/** How many still-open firsts show beneath the ready ones. */
const OPEN_SHOWN = 3;

export function Firsts({ tinker, onOutcome }: { tinker: Tinker; onOutcome: (outcome: Outcome) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bursts, setBursts] = useState(0);
  const firsts = tinker.firsts ?? [];
  const claimed = firsts.filter((first) => first.status === "claimed").length;
  if (firsts.length === 0 || claimed === firsts.length) return null;
  const ready = firsts.filter((first) => first.status === "ready");
  const open = firsts.filter((first) => first.status === "open").slice(0, OPEN_SHOWN);

  const claim = (id: string) => {
    if (busy) return;
    setBusy(id);
    api
      .claimFirst(tinker.id, id)
      .then((outcome) => {
        play("claim");
        setBursts((count) => count + 1);
        setError(null);
        onOutcome(outcome);
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setBusy(null));
  };

  return (
    <Sparks bursts={bursts}>
      <View style={[ui.panel, { gap: 8 }, ready.length > 0 && { borderColor: GOLD }]}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          <Text style={ui.heading}>Firsts</Text>
          <Text style={ui.muted}>
            {claimed} of {firsts.length}
          </Text>
        </View>
        {ready.map((first) => (
          <Glow key={first.id} active>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 3, paddingHorizontal: 6 }}>
              <Text style={[ui.text, { flex: 1, color: GOLD }]}>✓ {first.title}</Text>
              <Pressable
                onPress={() => claim(first.id)}
                disabled={busy !== null}
                accessibilityRole="button"
                accessibilityLabel={`Claim ${first.crowns} Crowns for ${first.title}`}
                style={[ui.button, { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4 }]}
              >
                <UiIcon name="crowns" size={16} />
                <Text style={ui.buttonText}>Claim {first.crowns}</Text>
              </Pressable>
            </View>
          </Glow>
        ))}
        {open.map((first) => (
          <View key={first.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={[ui.muted, { flex: 1 }]}>○ {first.title}</Text>
            <Text style={[ui.muted, { fontSize: 12 }]}>{first.crowns} Crowns</Text>
          </View>
        ))}
        {error && <Text style={[ui.muted, { color: colors.scald }]}>{error}</Text>}
      </View>
    </Sparks>
  );
}

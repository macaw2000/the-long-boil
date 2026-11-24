// A guild looked over: a card over the screen, opened by tapping a guild's
// name on a profile, the Guild tab or the guild board. It shows what anyone
// may see (server guilds.ts lookAtGuild): its leader, members and their levels,
// never its notice or chat. From it a Tinker without a guild can apply or join.

import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { api, type GuildCardView, type GuildView } from "./api";
import { UiIcon } from "./Sprite";
import { colors, ui } from "./theme";

const RANKS = { leader: "Leader", officer: "Officer", member: "Member" } as const;

export function GuildCard({
  tinkerId,
  guildId,
  mine,
  setMine,
  onInspect,
  onClose,
}: {
  tinkerId: number;
  guildId: number;
  /** The viewer's own guild view, or null while it loads: what they may do here. */
  mine: GuildView | null;
  setMine: (view: GuildView) => void;
  onInspect: (other: number) => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<GuildCardView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Looked at again when the viewer's own guild changes, as joining adds a member.
  const myGuild = mine?.guild?.id ?? null;
  useEffect(() => {
    let live = true;
    api
      .guildCard(tinkerId, guildId)
      .then((next) => live && setView(next))
      .catch((reason: Error) => live && setError(reason.message));
    return () => {
      live = false;
    };
  }, [tinkerId, guildId, myGuild]);

  const act = (call: () => Promise<GuildView>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    call()
      .then(setMine)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setBusy(false));
  };

  const invited = mine?.invites.some((invite) => invite.guildId === guildId);
  const applied = mine?.applications.some((application) => application.guildId === guildId);
  const full = view !== null && view.size >= view.maxMembers;
  let step: { label: string; act: () => void } | null = null;
  let standing: string | null = null;
  if (mine && view) {
    if (mine.guild) standing = mine.guild.id === guildId ? "Your guild" : null;
    else if (applied) {
      standing = "Applied. The leader or an officer will answer.";
      step = { label: "Withdraw", act: () => act(() => api.dropRequest(tinkerId, guildId, tinkerId)) };
    } else if (full) standing = "This guild is full.";
    else if (invited) step = { label: "Join", act: () => act(() => api.acceptInvite(tinkerId, guildId)) };
    else if (!view.recruiting.open) standing = "By invitation only.";
    else if (mine.totalLevel < view.recruiting.minLevel) standing = `Asks for total level ${view.recruiting.minLevel}. Yours is ${mine.totalLevel}.`;
    else step = { label: view.recruiting.autoAccept ? "Join" : "Apply", act: () => act(() => api.applyToGuild(tinkerId, guildId)) };
  }

  return (
    <Pressable
      onPress={onClose}
      style={{ position: "absolute", inset: 0, backgroundColor: "rgba(10,8,6,0.72)", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}
      accessibilityViewIsModal
      accessibilityLabel="Close"
    >
      {/* A press inside the card stays in the card. */}
      <Pressable onPress={() => undefined} style={[ui.panel, { width: 440, maxWidth: "100%", maxHeight: "92%", gap: 10 }]}>
        {!view ? (
          <Text style={error ? [ui.muted, { color: colors.scald }] : ui.muted}>{error ?? "Opening the guild hall…"}</Text>
        ) : (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <UiIcon name="guild" size={32} />
              <View style={{ flex: 1 }}>
                <Text style={[ui.heading, { fontSize: 22 }]}>{view.name}</Text>
                <Text style={ui.muted}>
                  {view.size} of {view.maxMembers} · Total {view.totalLevel.toLocaleString()} · since{" "}
                  {new Date(view.formedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                </Text>
              </View>
            </View>
            <ScrollView style={{ flexShrink: 1 }}>
              {view.members.map((member) => (
                <Pressable
                  key={member.id}
                  onPress={() => onInspect(member.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Inspect ${member.name}`}
                  style={{ flexDirection: "row", alignItems: "baseline", gap: 10, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.panelEdge }}
                >
                  <Text numberOfLines={1} style={[ui.text, { flex: 1, fontWeight: "700", color: member.id === tinkerId ? colors.brass : colors.copper }]}>
                    {member.name}
                  </Text>
                  <Text style={[ui.muted, { fontSize: 12, color: member.rank === "leader" ? colors.brass : colors.muted }]}>{RANKS[member.rank]}</Text>
                  <Text style={[ui.number, { width: 80, textAlign: "right" }]}>Total {member.totalLevel}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {error && <Text style={[ui.muted, { color: colors.scald }]}>{error}</Text>}
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}>
              {standing && <Text style={[ui.muted, { flex: 1 }]}>{standing}</Text>}
              {step && (
                <Pressable onPress={step.act} disabled={busy} accessibilityRole="button" style={[ui.button, busy && { opacity: 0.5 }]}>
                  <Text style={ui.buttonText}>{step.label}</Text>
                </Pressable>
              )}
              <Pressable onPress={onClose} accessibilityRole="button" style={[ui.button, { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.panelEdge }]}>
                <Text style={[ui.buttonText, { color: colors.muted }]}>Close</Text>
              </Pressable>
            </View>
          </>
        )}
      </Pressable>
    </Pressable>
  );
}

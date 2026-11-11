// The Guild tab (build plan milestone 10; GDD section 7 lists Guild among the
// phone tabs). Without a guild: invitations, the guilds to apply to, and a
// name box to found one, free and at once. In one: the guild, its notice
// board (pinned by the leader or an officer, for members who come by at
// different times), the roster, requests to answer, and the leader's controls.

import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { api, gameNow, type GuildRank, type GuildView } from "./api";
import { duration } from "./format";
import { colors, ui } from "./theme";

const RANKS: Record<GuildRank, string> = { leader: "Leader", officer: "Officer", member: "Member" };

function crowns(n: number): string {
  return `${n.toLocaleString()} Crowns`;
}

function SmallButton({ label, onPress, tone = colors.brass }: { label: string; onPress: () => void; tone?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ borderWidth: 1, borderColor: tone, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={[ui.muted, { fontSize: 12, color: tone }]}>{label}</Text>
    </Pressable>
  );
}

export function Guild({
  tinkerId,
  view,
  setView,
  onInspect,
}: {
  tinkerId: number;
  view: GuildView | null;
  setView: (view: GuildView) => void;
  onInspect: (other: number) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [rename, setRename] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  if (!view) return <Text style={ui.muted}>Opening the guild hall…</Text>;

  const act = (call: Promise<GuildView>) =>
    call
      .then((next) => {
        setView(next);
        setError(null);
        setName("");
        setNotice(null);
        setConfirming(null);
      })
      .catch((reason: Error) => setError(reason.message));

  const guild = view.guild;

  // ------------------------------------------------------------ in a guild
  if (guild) {
    const leader = guild.rank === "leader";
    const answers = guild.rank !== "member";
    return (
      <View style={{ gap: 12, width: "100%", maxWidth: 720 }}>
        <View style={[ui.panel, { borderColor: colors.brass }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
            <Text style={[ui.heading, { fontSize: 22 }]}>{guild.name}</Text>
            <Text style={ui.muted}>
              {guild.members.length} of {view.rules.maxMembers} · you are {RANKS[guild.rank]}
            </Text>
          </View>
          {guild.members.length === 1 && <Text style={ui.muted}>Just you so far. Tap a name in chat to invite them in.</Text>}
        </View>

        <View style={[ui.panel, { gap: 6 }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={ui.heading}>Notice board</Text>
            {answers && notice === null && <SmallButton label={guild.notice ? "Edit" : "Pin a notice"} onPress={() => setNotice(guild.notice?.text ?? "")} />}
          </View>
          {notice !== null ? (
            <View style={{ gap: 6 }}>
              <TextInput
                value={notice}
                onChangeText={(text) => setNotice([...text].slice(0, view.rules.noticeMax).join(""))}
                multiline
                numberOfLines={4}
                placeholder="Plans, a welcome, what the guild is after…"
                placeholderTextColor={colors.muted}
                accessibilityLabel="Guild notice"
                style={[ui.input, { minHeight: 90, textAlignVertical: "top", fontFamily: undefined }]}
              />
              <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                <SmallButton label="Pin it" tone={colors.verdigris} onPress={() => act(api.setNotice(tinkerId, notice))} />
                {guild.notice && <SmallButton label="Take it down" tone={colors.scald} onPress={() => act(api.setNotice(tinkerId, ""))} />}
                <SmallButton label="Cancel" tone={colors.muted} onPress={() => setNotice(null)} />
                <Text style={[ui.number, { fontSize: 11, color: colors.muted, marginLeft: "auto" }]}>{view.rules.noticeMax - [...notice].length} left</Text>
              </View>
            </View>
          ) : guild.notice ? (
            <>
              <Text style={ui.text} selectable>
                {guild.notice.text}
              </Text>
              <Text style={[ui.muted, { fontSize: 12 }]}>
                {guild.notice.by}, {gameNow() - new Date(guild.notice.at).getTime() < 60_000 ? "just now" : `${duration(gameNow() - new Date(guild.notice.at).getTime())} ago`}
              </Text>
            </>
          ) : (
            <Text style={ui.muted}>{answers ? "Nothing pinned. Leave word for members who come by later." : "Nothing pinned yet."}</Text>
          )}
        </View>

        <View style={ui.panel}>
          <Text style={ui.heading}>Roster</Text>
          {guild.members.map((member) => {
            const self = member.tinkerId === tinkerId;
            return (
              <View key={member.tinkerId} style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.panelEdge }}>
                <Pressable onPress={() => onInspect(member.tinkerId)} accessibilityRole="button" accessibilityLabel={`Inspect ${member.name}`} style={{ minWidth: 110 }}>
                  <Text style={[ui.text, { fontWeight: "700", color: self ? colors.brass : colors.ink }]}>{member.name}</Text>
                </Pressable>
                <Text style={[ui.muted, { fontSize: 12, minWidth: 60, color: member.rank === "leader" ? colors.brass : colors.muted }]}>{RANKS[member.rank]}</Text>
                <Text style={[ui.number, { fontSize: 12 }]}>Total {member.totalLevel}</Text>
                <Text style={[ui.muted, { fontSize: 12 }]}>seen {duration(Math.max(0, gameNow() - new Date(member.lastSeen).getTime()))} ago</Text>
                <Text style={[ui.muted, { fontSize: 12 }]}>{member.workOrders} Work Orders</Text>
                <View style={{ flexDirection: "row", gap: 4, marginLeft: "auto" }}>
                  {leader && !self && member.rank === "member" && <SmallButton label="Make officer" onPress={() => act(api.setRank(tinkerId, member.tinkerId, "officer"))} />}
                  {leader && !self && member.rank === "officer" && <SmallButton label="Make member" onPress={() => act(api.setRank(tinkerId, member.tinkerId, "member"))} />}
                  {leader && !self &&
                    (confirming === `lead-${member.tinkerId}` ? (
                      <SmallButton label="Confirm: hand on leadership" tone={colors.copper} onPress={() => act(api.setRank(tinkerId, member.tinkerId, "leader"))} />
                    ) : (
                      <SmallButton label="Hand on leadership" onPress={() => setConfirming(`lead-${member.tinkerId}`)} />
                    ))}
                  {leader && !self && <SmallButton label="Remove" tone={colors.scald} onPress={() => act(api.removeMember(tinkerId, member.tinkerId))} />}
                </View>
              </View>
            );
          })}
        </View>

        {answers && (
          <View style={ui.panel}>
            <Text style={ui.heading}>Requests</Text>
            {guild.requests.length === 0 && <Text style={ui.muted}>No applications waiting. Invite Tinkers from chat.</Text>}
            {guild.requests.map((request) => (
              <View key={request.tinkerId} style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Text style={ui.text}>{request.name}</Text>
                <Text style={ui.muted}>{request.kind === "application" ? "applied" : "invited"}</Text>
                {request.kind === "application" && <SmallButton label="Accept" tone={colors.verdigris} onPress={() => act(api.acceptApplication(tinkerId, request.tinkerId))} />}
                <SmallButton label={request.kind === "application" ? "Decline" : "Withdraw"} tone={colors.muted} onPress={() => act(api.dropRequest(tinkerId, guild.id, request.tinkerId))} />
              </View>
            ))}
          </View>
        )}

        <View style={[ui.panel, { gap: 10 }]}>
          {leader && (
            <View style={{ flexDirection: "row", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <TextInput
                value={rename}
                onChangeText={setRename}
                placeholder="A new name"
                placeholderTextColor={colors.muted}
                accessibilityLabel="New guild name"
                style={[ui.input, { width: 200, fontFamily: undefined }]}
              />
              <SmallButton label={`Rename for ${crowns(view.rules.renameCrowns)}`} onPress={() => act(api.renameGuild(tinkerId, rename))} />
            </View>
          )}
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {(!leader || guild.members.length === 1) &&
              (confirming === "leave" ? (
                <SmallButton
                  label={leader ? "Confirm: leave and disband" : "Confirm: leave"}
                  tone={colors.scald}
                  onPress={() => act(api.removeMember(tinkerId, tinkerId))}
                />
              ) : (
                <SmallButton label="Leave the guild" tone={colors.scald} onPress={() => setConfirming("leave")} />
              ))}
            {leader &&
              guild.members.length > 1 &&
              (confirming === "disband" ? (
                <SmallButton label="Confirm: disband" tone={colors.scald} onPress={() => act(api.disbandGuild(tinkerId))} />
              ) : (
                <SmallButton label="Disband" tone={colors.scald} onPress={() => setConfirming("disband")} />
              ))}
          </View>
          {error && <Text style={[ui.muted, { color: colors.scald }]}>{error}</Text>}
        </View>
      </View>
    );
  }

  // ------------------------------------------------------------ no guild yet
  return (
    <View style={{ gap: 12, width: "100%", maxWidth: 720 }}>
      {view.invites.length > 0 && (
        <View style={[ui.panel, { borderColor: colors.verdigris }]}>
          <Text style={ui.heading}>Invitations</Text>
          {view.invites.map((invite) => (
            <View key={invite.guildId} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <Text style={ui.text}>{invite.name}</Text>
              <SmallButton label="Join" tone={colors.verdigris} onPress={() => act(api.acceptInvite(tinkerId, invite.guildId))} />
              <SmallButton label="Decline" tone={colors.muted} onPress={() => act(api.dropRequest(tinkerId, invite.guildId, tinkerId))} />
            </View>
          ))}
        </View>
      )}

      <View style={[ui.panel, { gap: 8 }]}>
        <Text style={ui.heading}>Found a guild</Text>
        <Text style={ui.muted}>Free, and yours at once. Up to {view.rules.maxMembers} members, one guild per account.</Text>
        <View style={{ flexDirection: "row", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <TextInput
            value={name}
            onChangeText={setName}
            onSubmitEditing={() => name.trim() && act(api.foundGuild(tinkerId, name))}
            placeholder="The guild's name"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Guild name"
            style={[ui.input, { flex: 1, minWidth: 180, fontFamily: undefined }]}
          />
          <Pressable
            onPress={() => act(api.foundGuild(tinkerId, name))}
            disabled={!name.trim()}
            accessibilityRole="button"
            style={[ui.button, !name.trim() && { opacity: 0.45 }]}
          >
            <Text style={ui.buttonText}>Found</Text>
          </Pressable>
        </View>
        {error && <Text style={[ui.muted, { color: colors.scald }]}>{error}</Text>}
      </View>

      <View style={ui.panel}>
        <Text style={ui.heading}>Join a guild</Text>
        {view.guilds.length === 0 && <Text style={ui.muted}>No guilds yet. Found the first.</Text>}
        {view.guilds.map((entry) => {
          const applied = view.applications.some((application) => application.guildId === entry.id);
          return (
            <View key={entry.id} style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.panelEdge }}>
              <Text style={[ui.text, { fontWeight: "700" }]}>{entry.name}</Text>
              <Text style={ui.muted}>
                {entry.members} of {view.rules.maxMembers}
              </Text>
              <View style={{ marginLeft: "auto" }}>
                {applied ? (
                  <SmallButton label="Applied · withdraw" tone={colors.muted} onPress={() => act(api.dropRequest(tinkerId, entry.id, tinkerId))} />
                ) : entry.members >= view.rules.maxMembers ? (
                  <Text style={[ui.muted, { fontSize: 12 }]}>full</Text>
                ) : (
                  <SmallButton label="Apply" onPress={() => act(api.applyToGuild(tinkerId, entry.id))} />
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

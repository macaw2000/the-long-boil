// The Guild tab (build plan milestone 10; GDD section 7 lists Guild among the
// phone tabs). Without a guild: invitations, applications, the guilds open or
// forming, and a form to open a charter. In one: the charter's progress or the
// formed guild, the roster, requests to answer, and the leader's controls.

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

function ProgressBar({ fraction }: { fraction: number }) {
  return (
    <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.soot, borderWidth: 1, borderColor: colors.panelEdge, overflow: "hidden" }}>
      <View style={{ width: `${Math.round(Math.min(1, fraction) * 1000) / 10}%`, height: "100%", backgroundColor: colors.brass }} />
    </View>
  );
}

export function Guild({
  tinkerId,
  view,
  setView,
  crownsHeld,
}: {
  tinkerId: number;
  view: GuildView | null;
  setView: (view: GuildView) => void;
  crownsHeld: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [rename, setRename] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);

  if (!view) return <Text style={ui.muted}>Opening the guild hall…</Text>;

  const act = (call: Promise<GuildView>) =>
    call
      .then((next) => {
        setView(next);
        setError(null);
        setAmount("");
        setConfirming(null);
      })
      .catch((reason: Error) => setError(reason.message));

  const pledgeAmount = Number(amount);
  const guild = view.guild;

  // ------------------------------------------------------------ in a guild
  if (guild) {
    const leader = guild.rank === "leader";
    const answers = guild.rank !== "member";
    const left = new Date(guild.charterEnds).getTime() - gameNow();
    return (
      <View style={{ gap: 12, width: "100%", maxWidth: 720 }}>
        <View style={[ui.panel, { borderColor: guild.status === "active" ? colors.brass : colors.copper }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
            <Text style={[ui.heading, { fontSize: 22 }]}>{guild.name}</Text>
            <Text style={ui.muted}>
              {guild.status === "active" ? `Founded · ${guild.members.length} of ${view.rules.maxMembers}` : "Charter"} · you are {RANKS[guild.rank]}
            </Text>
          </View>
          {guild.status === "charter" && (
            <View style={{ gap: 6 }}>
              <ProgressBar fraction={guild.pledged / guild.fee} />
              <Text style={ui.muted}>
                {crowns(guild.pledged)} of {crowns(guild.fee)} pledged · {duration(Math.max(0, left))} left. Every pledge is refunded if the charter does not fill.
              </Text>
              <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  inputMode="numeric"
                  placeholder="Crowns"
                  placeholderTextColor={colors.muted}
                  accessibilityLabel="Crowns to pledge"
                  style={[ui.input, { width: 140 }]}
                />
                <Pressable
                  onPress={() => act(api.pledge(tinkerId, guild.id, pledgeAmount))}
                  disabled={!(pledgeAmount > 0)}
                  accessibilityRole="button"
                  style={[ui.button, !(pledgeAmount > 0) && { opacity: 0.45 }]}
                >
                  <Text style={ui.buttonText}>Pledge</Text>
                </Pressable>
                <Text style={[ui.muted, { fontSize: 12 }]}>you hold {crowns(crownsHeld)}</Text>
              </View>
            </View>
          )}
        </View>

        <View style={ui.panel}>
          <Text style={ui.heading}>Roster</Text>
          {guild.members.map((member) => {
            const self = member.tinkerId === tinkerId;
            return (
              <View key={member.tinkerId} style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.panelEdge }}>
                <Text style={[ui.text, { fontWeight: "700", color: self ? colors.brass : colors.ink, minWidth: 110 }]}>{member.name}</Text>
                <Text style={[ui.muted, { fontSize: 12, minWidth: 60, color: member.rank === "leader" ? colors.brass : colors.muted }]}>{RANKS[member.rank]}</Text>
                <Text style={[ui.number, { fontSize: 12 }]}>Total {member.totalLevel}</Text>
                <Text style={[ui.muted, { fontSize: 12 }]}>seen {duration(Math.max(0, gameNow() - new Date(member.lastSeen).getTime()))} ago</Text>
                {member.pledged > 0 && <Text style={[ui.muted, { fontSize: 12 }]}>pledged {crowns(member.pledged)}</Text>}
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
            {guild.requests.length === 0 && <Text style={ui.muted}>No applications waiting. Invite Tinkers from the city chat.</Text>}
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
                  label={leader ? (guild.status === "charter" ? "Confirm: abandon and refund" : "Confirm: leave and disband") : "Confirm: leave"}
                  tone={colors.scald}
                  onPress={() => act(api.removeMember(tinkerId, tinkerId))}
                />
              ) : (
                <SmallButton label="Leave the guild" tone={colors.scald} onPress={() => setConfirming("leave")} />
              ))}
            {leader &&
              guild.members.length > 1 &&
              (confirming === "disband" ? (
                <SmallButton
                  label={guild.status === "charter" ? "Confirm: abandon the charter and refund every pledge" : "Confirm: disband (the fee is not refunded)"}
                  tone={colors.scald}
                  onPress={() => act(api.disbandGuild(tinkerId))}
                />
              ) : (
                <SmallButton label={guild.status === "charter" ? "Abandon the charter" : "Disband"} tone={colors.scald} onPress={() => setConfirming("disband")} />
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
      <View style={ui.panel}>
        <Text style={ui.heading}>Guilds</Text>
        <Text style={ui.muted}>
          A guild costs {crowns(view.rules.fee)}, raised together: a founder opens a charter with at least {crowns(view.rules.founderMin)}, anyone may pledge toward the rest, and
          the guild forms when it is paid. Up to {view.rules.maxMembers} members, one guild per account.
        </Text>
        {view.locked && <Text style={[ui.muted, { color: colors.copper }]}>The guild hall opens with trading: {view.locked}.</Text>}
      </View>

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

      <View style={ui.panel}>
        <Text style={ui.heading}>Open and forming</Text>
        {view.guilds.length === 0 && <Text style={ui.muted}>No guilds yet. Found the first.</Text>}
        {view.guilds.map((entry) => {
          const applied = view.applications.some((application) => application.guildId === entry.id);
          return (
            <View key={entry.id} style={{ gap: 4, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.panelEdge }}>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Text style={[ui.text, { fontWeight: "700" }]}>{entry.name}</Text>
                <Text style={ui.muted}>
                  {entry.status === "active" ? `${entry.members} members` : `charter · ${crowns(entry.pledged)} of ${crowns(view.rules.fee)}`}
                </Text>
                {applied ? (
                  <SmallButton label="Withdraw application" tone={colors.muted} onPress={() => act(api.dropRequest(tinkerId, entry.id, tinkerId))} />
                ) : (
                  <SmallButton label="Apply" onPress={() => act(api.applyToGuild(tinkerId, entry.id))} />
                )}
              </View>
              {entry.status === "charter" && <ProgressBar fraction={entry.pledged / view.rules.fee} />}
            </View>
          );
        })}
      </View>

      <View style={[ui.panel, { gap: 8 }]}>
        <Text style={ui.heading}>Found a guild</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="The guild's name"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Guild name"
          style={[ui.input, { fontFamily: undefined }]}
        />
        <View style={{ flexDirection: "row", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            inputMode="numeric"
            placeholder={`at least ${view.rules.founderMin.toLocaleString()}`}
            placeholderTextColor={colors.muted}
            accessibilityLabel="Crowns to open the charter with"
            style={[ui.input, { width: 160 }]}
          />
          <Pressable onPress={() => act(api.foundGuild(tinkerId, name, pledgeAmount))} accessibilityRole="button" style={ui.button}>
            <Text style={ui.buttonText}>Open the charter</Text>
          </Pressable>
          <Text style={[ui.muted, { fontSize: 12 }]}>you hold {crowns(crownsHeld)}</Text>
        </View>
        {error && <Text style={[ui.muted, { color: colors.scald }]}>{error}</Text>}
      </View>
    </View>
  );
}

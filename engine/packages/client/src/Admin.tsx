// The admin console (build plan milestone 14): who is playing, buying and
// signing in, and the tools to act on it. Shown only to admins; the server
// refuses everyone else on every /admin/ route.

import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api, type AdminOverview, type AdminPlayer, type AdminPlayerDetail, type AdminPurchase } from "./api";
import { TapInput } from "./TapInput";
import { colors, ui } from "./theme";

type Tab = "overview" | "players" | "purchases";

export function Admin() {
  const [tab, setTab] = useState<Tab>("overview");
  const [account, setAccount] = useState<number | null>(null);
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {(["overview", "players", "purchases"] as const).map((choice) => (
          <Chip
            key={choice}
            label={choice === "overview" ? "Overview" : choice === "players" ? "Players" : "Purchases"}
            active={tab === choice && account === null}
            onPress={() => {
              setTab(choice);
              setAccount(null);
            }}
          />
        ))}
      </View>
      {account !== null ? (
        <PlayerView account={account} onBack={() => setAccount(null)} />
      ) : tab === "overview" ? (
        <OverviewView />
      ) : tab === "players" ? (
        <PlayersView onOpen={setAccount} />
      ) : (
        <PurchasesView onOpen={setAccount} />
      )}
    </View>
  );
}

/** Loads once and on demand, keeping the last error to show. */
function useLoad<T>(load: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    load()
      .then((value) => {
        setData(value);
        setError(null);
      })
      .catch((reason: Error) => setError(reason.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(reload, [reload]);
  return { data, error, reload };
}

function OverviewView() {
  const { data, error, reload } = useLoad<AdminOverview>(() => api.admin.overview(), []);
  if (!data) return <Loading error={error} />;
  const most = Math.max(1, ...data.newAccounts.map((day) => day.count));
  const top = Math.max(1, data.funnel[0]?.tinkers ?? 1);
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        <Stat label="Accounts" value={data.accounts} note={`${data.tinkers} Tinkers`} />
        <Stat label="Online now" value={data.online} note="Tinkers with the game open" />
        <Stat label="Active today" value={data.active.day} note={`${data.active.week} this week`} />
        <Stat
          label="Revenue"
          value={money(data.revenue.cents)}
          note={`${data.revenue.crates} crates, ${data.revenue.buyers} ${data.revenue.buyers === 1 ? "buyer" : "buyers"}${
            data.revenue.refunded ? `, ${data.revenue.refunded} refunded` : ""
          }`}
        />
      </View>
      <View style={[ui.panel, { gap: 10 }]}>
        <Text style={ui.heading}>New accounts, last 14 days</Text>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, height: 110 }}>
          {data.newAccounts.map((day) => (
            <View key={day.day} style={{ flex: 1, alignItems: "center", gap: 4 }}>
              <Text style={[ui.number, { fontSize: 11, color: day.count ? colors.ink : colors.muted }]}>{day.count}</Text>
              <View style={{ width: "70%", height: Math.max(2, (day.count / most) * 70), backgroundColor: day.count ? colors.brass : colors.panelEdge, borderRadius: 2 }} />
              <Text style={[ui.muted, { fontSize: 10 }]}>{day.day.slice(8)}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={[ui.panel, { gap: 8 }]}>
        <Text style={ui.heading}>How far Tinkers get</Text>
        {data.funnel.map((step) => (
          <View key={step.label} style={{ gap: 3 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={ui.text}>{step.label}</Text>
              <Text style={ui.number}>
                {step.tinkers} {top ? `· ${Math.round((100 * step.tinkers) / top)}%` : ""}
              </Text>
            </View>
            <View style={{ height: 8, backgroundColor: colors.panelEdge, borderRadius: 4 }}>
              <View style={{ width: `${(100 * step.tinkers) / top}%`, height: 8, backgroundColor: colors.verdigris, borderRadius: 4 }} />
            </View>
          </View>
        ))}
      </View>
      <View style={{ alignSelf: "flex-start" }}>
        <Chip label="Refresh" active={false} onPress={reload} />
      </View>
    </View>
  );
}

function PlayersView({ onOpen }: { onOpen: (account: number) => void }) {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const { data, error } = useLoad(() => api.admin.players(search), [search]);
  return (
    <View style={{ gap: 12 }}>
      <TapInput
        style={ui.input}
        value={q}
        onChangeText={setQ}
        onSubmitEditing={() => setSearch(q)}
        placeholder="Search by email, Tinker name or login, then press Enter"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        accessibilityLabel="Search players"
      />
      {!data ? (
        <Loading error={error} />
      ) : data.players.length === 0 ? (
        <Text style={ui.muted}>No one matches.</Text>
      ) : (
        <View style={[ui.panel, { gap: 0, padding: 0 }]}>
          {data.players.map((player) => (
            <PlayerLine key={player.account} player={player} onPress={() => onOpen(player.account)} />
          ))}
        </View>
      )}
    </View>
  );
}

function PlayerLine({ player, onPress }: { player: AdminPlayer; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{ paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.panelEdge, gap: 3 }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <Text style={[ui.text, { color: colors.brass }]}>
          {player.email ?? player.login}
          {player.provider ? <Text style={ui.muted}> · {player.provider}</Text> : null}
          {player.ban ? <Text style={{ color: colors.scald }}> · {player.ban.kind === "full" ? "banned" : "chat banned"}</Text> : null}
        </Text>
        <Text style={ui.muted}>
          {player.spentCents ? `${money(player.spentCents)} · ` : ""}seen {ago(player.lastSeenAt)}
        </Text>
      </View>
      <Text style={ui.muted}>
        {player.tinkers.length
          ? player.tinkers.map((tinker) => `${tinker.name} (level ${tinker.totalLevel}, Act I ${tinker.act1}%)`).join(" · ")
          : "No Tinker yet"}
      </Text>
    </Pressable>
  );
}

function PlayerView({ account, onBack }: { account: number; onBack: () => void }) {
  const { data, error, reload } = useLoad<AdminPlayerDetail>(() => api.admin.player(account), [account]);
  const [reason, setReason] = useState("");
  const [arming, setArming] = useState<"chat" | "full" | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const act = (work: Promise<unknown>) => {
    setBusy(true);
    work
      .then(() => {
        setProblem(null);
        setArming(null);
        reload();
      })
      .catch((reasonError: Error) => setProblem(reasonError.message))
      .finally(() => setBusy(false));
  };
  if (!data) return <Loading error={error} />;
  return (
    <View style={{ gap: 12 }}>
      <View style={{ alignSelf: "flex-start" }}>
        <Chip label="← All players" active={false} onPress={onBack} />
      </View>
      <View style={[ui.panel, { gap: 6 }]}>
        <Text style={ui.heading}>{data.email ?? data.login}</Text>
        <Text style={ui.muted}>
          {data.provider ?? "unknown provider"} · joined {day(data.createdAt)} · seen {ago(data.lastSeenAt)} · spent {money(data.spentCents)}
        </Text>
        <Text style={[ui.muted, { fontSize: 11 }]}>{data.login}</Text>
        {data.tinkers.map((tinker) => (
          <Text key={tinker.id} style={ui.text}>
            {tinker.name}: total level {tinker.totalLevel}, Act I {tinker.act1}%, {tinker.crowns.toLocaleString()} Crowns, {tinker.cogs} Cogs
          </Text>
        ))}
      </View>

      <View style={[ui.panel, { gap: 8 }]}>
        <Text style={ui.heading}>Ban</Text>
        {data.ban ? (
          <>
            <Text style={[ui.text, { color: colors.scald }]}>
              {data.ban.kind === "full" ? "Banned from the game" : "Banned from chat"} since {day(data.ban.at)}
              {data.ban.reason ? `: ${data.ban.reason}` : ""}
            </Text>
            <View style={{ alignSelf: "flex-start" }}>
              <Chip label="Lift ban" active={false} disabled={busy} onPress={() => act(api.admin.unban(account))} />
            </View>
          </>
        ) : (
          <Text style={ui.muted}>
            A chat ban stops posting and hides their messages; they keep playing. A full ban also keeps them out of the game and cancels
            their open Exchange orders. Lifting either restores everything.
          </Text>
        )}
        <TapInput
          style={ui.input}
          value={reason}
          onChangeText={setReason}
          placeholder="Reason (they see it)"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Ban reason"
        />
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {(["chat", "full"] as const)
            .filter((kind) => data.ban?.kind !== kind)
            .map((kind) =>
              arming === kind ? (
                <Chip
                  key={kind}
                  label={`Confirm ${kind === "full" ? "full ban" : "chat ban"}`}
                  active
                  danger
                  disabled={busy}
                  onPress={() => act(api.admin.ban(account, kind, reason))}
                />
              ) : (
                <Chip key={kind} label={kind === "full" ? "Full ban…" : "Chat ban…"} active={false} disabled={busy} onPress={() => setArming(kind)} />
              ),
            )}
          {arming && <Chip label="Cancel" active={false} onPress={() => setArming(null)} />}
        </View>
        {problem && <Text style={[ui.text, { color: colors.scald }]}>{problem}</Text>}
      </View>

      <View style={[ui.panel, { gap: 6 }]}>
        <Text style={ui.heading}>Chat ({data.chat.length})</Text>
        {data.chat.length === 0 && <Text style={ui.muted}>Nothing said.</Text>}
        {data.chat.map((message) => (
          <View key={message.id} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text style={[ui.text, message.removed && { color: colors.muted, textDecorationLine: "line-through" }]}>{message.text}</Text>
              <Text style={[ui.muted, { fontSize: 11 }]}>
                {message.tinker} · {channelName(message.channel)} · {ago(message.at)}
                {message.removed ? " · removed" : ""}
              </Text>
            </View>
            {!message.removed && <Chip label="Remove" active={false} disabled={busy} onPress={() => act(api.admin.removeMessage(message.id))} />}
          </View>
        ))}
      </View>

      <View style={[ui.panel, { gap: 6 }]}>
        <Text style={ui.heading}>Purchases ({data.purchases.length})</Text>
        {data.purchases.length === 0 && <Text style={ui.muted}>None.</Text>}
        {data.purchases.map((purchase) => (
          <PurchaseLine key={purchase.id} purchase={purchase} />
        ))}
      </View>

      <View style={[ui.panel, { gap: 4 }]}>
        <Text style={ui.heading}>Recent activity</Text>
        {data.events.map((event, index) => (
          <Text key={index} style={ui.muted}>
            {ago(event.at)} · {event.tinker} · {event.type.replace(/_/g, " ")}
          </Text>
        ))}
      </View>
    </View>
  );
}

function PurchasesView({ onOpen }: { onOpen: (account: number) => void }) {
  const { data, error } = useLoad(() => api.admin.purchases(), []);
  const { data: people } = useLoad(() => api.admin.players(""), []);
  if (!data) return <Loading error={error} />;
  const accountOf = (tinkerId: number) => people?.players.find((player) => player.tinkers.some((tinker) => tinker.id === tinkerId))?.account;
  return (
    <View style={[ui.panel, { gap: 6 }]}>
      <Text style={ui.heading}>Every purchase ({data.purchases.length})</Text>
      {data.purchases.length === 0 && <Text style={ui.muted}>No one has bought anything yet.</Text>}
      {data.purchases.map((purchase) => {
        const account = accountOf(purchase.tinkerId);
        return (
          <Pressable key={purchase.id} disabled={account === undefined} onPress={() => account !== undefined && onOpen(account)} accessibilityRole="button">
            <PurchaseLine purchase={purchase} />
          </Pressable>
        );
      })}
    </View>
  );
}

function PurchaseLine({ purchase }: { purchase: AdminPurchase }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
      <Text style={[ui.text, purchase.refunded && { color: colors.muted, textDecorationLine: "line-through" }]}>
        {money(purchase.cents)} · {purchase.crates} {purchase.crates === 1 ? "crate" : "crates"} · {purchase.tinker}
        {purchase.email ? <Text style={ui.muted}> ({purchase.email})</Text> : null}
        {purchase.refunded ? <Text style={{ color: colors.scald }}> · refunded</Text> : null}
      </Text>
      <Text style={ui.muted}>{day(purchase.at)}</Text>
    </View>
  );
}

function Stat({ label, value, note }: { label: string; value: number | string; note?: string }) {
  return (
    <View style={[ui.panel, { flexBasis: 180, flexGrow: 1, gap: 2 }]}>
      <Text style={ui.muted}>{label}</Text>
      <Text style={[ui.number, { fontSize: 24, color: colors.brass }]}>{typeof value === "number" ? value.toLocaleString() : value}</Text>
      {note && <Text style={[ui.muted, { fontSize: 12 }]}>{note}</Text>}
    </View>
  );
}

function Chip({ label, active, danger, disabled, onPress }: { label: string; active: boolean; danger?: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={{
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: danger ? colors.scald : active ? colors.brass : colors.panelEdge,
        backgroundColor: danger ? colors.scald : active ? colors.brass : "transparent",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={[ui.text, { color: danger || active ? colors.soot : colors.ink, fontWeight: active || danger ? "700" : "400" }]}>{label}</Text>
    </Pressable>
  );
}

function Loading({ error }: { error: string | null }) {
  return <Text style={error ? [ui.text, { color: colors.scald }] : ui.muted}>{error ?? "Loading…"}</Text>;
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** "just now", "5 min ago", "3 h ago", "2 days ago", or "never". */
function ago(iso: string | null): string {
  if (!iso) return "never";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** A chat channel as a person would say it. */
function channelName(channel: string): string {
  if (channel.startsWith("chat:dm:")) return "whisper";
  if (channel.startsWith("chat:guild:")) return "guild";
  return channel.replace(/^chat:/, "");
}

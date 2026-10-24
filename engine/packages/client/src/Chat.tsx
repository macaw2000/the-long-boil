// Chat (build plan milestones 8 and 10; GDD section 7 puts it on the right of
// the desktop screen). Five tabs: Kettleport for general talk, Trade for
// buying and selling, Help for new Tinkers' questions, the guild's own channel
// for members, and Whispers, private conversations between two Tinkers.
// History loads once per channel; new messages arrive over the live
// connection. Anyone else's messages can be muted, for this account only.

import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { api, type ChatChannel, type ChatMessage, type WhisperConversation } from "./api";
import { colors, ui } from "./theme";

const MAX_CHARS = 280;
const KEEP = 200;

type RoomChannel = Exclude<ChatChannel, "whisper">;

export interface ChatState {
  channel: RoomChannel;
  messages: ChatMessage[];
  muted: number[];
  unread: number;
  receive: (message: ChatMessage) => void;
  reload: () => void;
  markRead: () => void;
}

/** One room's state, kept by the workshop so the live connection can feed it. `active` is false while the room does not exist for this Tinker. */
export function useChat(tinkerId: number, channel: RoomChannel = "city", active = true): ChatState {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [muted, setMuted] = useState<number[]>([]);
  const [unread, setUnread] = useState(0);

  const reload = useCallback(() => {
    if (!active) {
      setMessages([]);
      return;
    }
    api
      .chat(tinkerId, channel)
      .then((view) => {
        setMessages(view.messages);
        setMuted(view.muted);
      })
      .catch(() => undefined);
  }, [tinkerId, channel, active]);

  useEffect(reload, [reload]);

  const receive = useCallback(
    (message: ChatMessage) => {
      setMessages((list) => (list.some((known) => known.id === message.id) ? list : [...list, message].slice(-KEEP)));
      if (message.tinker.id !== tinkerId) setUnread((count) => count + 1);
    },
    [tinkerId],
  );

  return { channel, messages, muted, unread, receive, reload, markRead: useCallback(() => setUnread(0), []) };
}

export interface WhisperState {
  conversations: { id: number; name: string; last: ChatMessage | null; unread: number }[];
  open: number | null;
  thread: ChatMessage[];
  unread: number;
  receive: (message: ChatMessage) => void;
  openWith: (other: number, name: string) => void;
  close: () => void;
  reload: () => void;
}

/** The other Tinker in a whisper's channel, chat:dm:<low>:<high>. */
function partnerIn(channel: string, self: number): number {
  const [low, high] = channel.split(":").slice(2).map(Number);
  return low === self ? high! : low!;
}

/** Whisper conversations: the inbox, the one open, and unread counts. */
export function useWhispers(tinkerId: number): WhisperState {
  const [inbox, setInbox] = useState<WhisperState["conversations"]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [thread, setThread] = useState<ChatMessage[]>([]);
  const openRef = useRef<number | null>(null);
  openRef.current = open;

  const reload = useCallback(() => {
    api
      .whispers(tinkerId)
      .then(({ conversations }: { conversations: WhisperConversation[] }) =>
        setInbox((known) =>
          conversations.map((conversation) => ({
            id: conversation.with.id,
            name: conversation.with.name,
            last: conversation.last,
            unread: known.find((entry) => entry.id === conversation.with.id)?.unread ?? 0,
          })),
        ),
      )
      .catch(() => undefined);
  }, [tinkerId]);
  useEffect(reload, [reload]);

  const openWith = useCallback(
    (other: number, name: string) => {
      setOpen(other);
      setThread([]);
      setInbox((list) => (list.some((entry) => entry.id === other) ? list.map((entry) => (entry.id === other ? { ...entry, unread: 0 } : entry)) : [{ id: other, name, last: null, unread: 0 }, ...list]));
      api
        .chat(tinkerId, "whisper", other)
        .then((view) => setThread(view.messages))
        .catch(() => undefined);
    },
    [tinkerId],
  );

  const receive = useCallback(
    (message: ChatMessage) => {
      const other = partnerIn(message.channel, tinkerId);
      const mine = message.tinker.id === tinkerId;
      const viewing = openRef.current === other;
      if (viewing) setThread((list) => (list.some((known) => known.id === message.id) ? list : [...list, message].slice(-KEEP)));
      setInbox((list) => {
        const rest = list.filter((entry) => entry.id !== other);
        const before = list.find((entry) => entry.id === other);
        const name = before?.name ?? (mine ? `Tinker ${other}` : message.tinker.name);
        return [{ id: other, name, last: message, unread: (before?.unread ?? 0) + (mine || viewing ? 0 : 1) }, ...rest];
      });
    },
    [tinkerId],
  );

  return {
    conversations: inbox,
    open,
    thread,
    unread: inbox.reduce((sum, entry) => sum + entry.unread, 0),
    receive,
    openWith,
    close: useCallback(() => setOpen(null), []),
    reload,
  };
}

/** Which tab a pushed message belongs to. */
export function channelOf(message: ChatMessage): ChatChannel {
  if (message.channel.startsWith("chat:guild:")) return "guild";
  if (message.channel.startsWith("chat:dm:")) return "whisper";
  if (message.channel === "chat:trade") return "trade";
  if (message.channel === "chat:help") return "help";
  return "city";
}

function clockTime(at: string): string {
  const time = new Date(at);
  return `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
}

const PLACEHOLDERS: Record<ChatChannel, string> = {
  city: "Say something to the city",
  trade: "Buying or selling? Say what and for how much",
  help: "Ask a question, or answer one",
  guild: "Say something to the guild",
  whisper: "Whisper",
};

const EMPTY: Record<ChatChannel, string> = {
  city: "The city is quiet. Say something.",
  trade: "No one is trading yet. Post what you are buying or selling.",
  help: "No questions yet. New here? Ask anything.",
  guild: "The guild hall is quiet.",
  whisper: "No whispers yet.",
};

export function Chat({
  tinkerId,
  rooms,
  whispers,
  guildName,
  connected,
  onInvite,
}: {
  tinkerId: number;
  /** The rooms this Tinker reads; guild is null outside a guild. */
  rooms: { city: ChatState; trade: ChatState; help: ChatState; guild: ChatState | null };
  whispers: WhisperState;
  guildName?: string;
  connected: boolean;
  /** Set when this Tinker may invite to its guild. */
  onInvite?: (other: number) => void;
}) {
  const [which, setWhich] = useState<ChatChannel>("city");
  const room = which === "whisper" ? null : which === "guild" ? rooms.guild : rooms[which];
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const scroll = useRef<ScrollView>(null);

  // A guild room that has gone (left or disbanded) falls back to the city.
  useEffect(() => {
    if (which === "guild" && !rooms.guild) setWhich("city");
  }, [which, rooms.guild]);

  const shown = which === "whisper" ? (whispers.open !== null ? whispers.thread : []) : (room?.messages ?? []);
  const markRead = room?.markRead;
  useEffect(() => {
    markRead?.();
    scroll.current?.scrollToEnd({ animated: true });
  }, [shown.length, markRead, which, whispers.open]);

  const send = () => {
    const text = draft.trim();
    if (!text || sending) return;
    if (which === "whisper" && whispers.open === null) return;
    setSending(true);
    const call = which === "whisper" ? api.say(tinkerId, text, "whisper", whispers.open!) : api.say(tinkerId, text, which);
    call
      .then(({ message }) => {
        if (which === "whisper") whispers.receive(message);
        else room?.receive(message);
        setDraft("");
        setError(null);
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setSending(false));
  };

  const everyRoom = [rooms.city, rooms.trade, rooms.help, rooms.guild].filter((entry): entry is ChatState => entry !== null);
  const mute = (other: number, on: boolean) =>
    (on ? api.mute(tinkerId, other) : api.unmute(tinkerId, other))
      .then(() => {
        everyRoom.forEach((entry) => entry.reload());
        whispers.reload();
      })
      .catch((reason: Error) => setError(reason.message));

  const whisperTo = (other: number, name: string) => {
    setWhich("whisper");
    whispers.openWith(other, name);
  };

  const tabs: { channel: ChatChannel; label: string; unread: number }[] = [
    { channel: "city", label: "Kettleport", unread: rooms.city.unread },
    { channel: "trade", label: "Trade", unread: rooms.trade.unread },
    { channel: "help", label: "Help", unread: rooms.help.unread },
    ...(rooms.guild ? [{ channel: "guild" as const, label: guildName ?? "Guild", unread: rooms.guild.unread }] : []),
    { channel: "whisper", label: "Whispers", unread: whispers.unread },
  ];
  const left = MAX_CHARS - [...draft].length;
  const inInbox = which === "whisper" && whispers.open === null;
  const openName = whispers.conversations.find((entry) => entry.id === whispers.open)?.name;

  return (
    <View style={[ui.panel, { flex: 1, minHeight: 320 }]}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <Text style={ui.heading}>Chat</Text>
        <Text style={[ui.muted, { fontSize: 11, color: connected ? colors.verdigris : colors.scald }]}>{connected ? "● on the wire" : "○ reconnecting…"}</Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }} accessibilityRole="tablist">
        {tabs.map((tab) => (
          <Pressable
            key={tab.channel}
            onPress={() => setWhich(tab.channel)}
            accessibilityRole="tab"
            accessibilityState={{ selected: which === tab.channel }}
            style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4, borderWidth: 1, borderColor: which === tab.channel ? colors.brass : colors.panelEdge }}
          >
            <Text style={[ui.muted, { fontSize: 12, color: which === tab.channel ? colors.brass : colors.muted }]}>
              {tab.label}
              {which !== tab.channel && tab.unread > 0 ? <Text style={{ color: colors.verdigris }}> {tab.unread}</Text> : null}
            </Text>
          </Pressable>
        ))}
      </View>

      {which === "whisper" && whispers.open !== null && (
        <Pressable onPress={whispers.close} accessibilityRole="button">
          <Text style={[ui.muted, { fontSize: 12 }]}>‹ All whispers · with <Text style={{ color: colors.brass }}>{openName}</Text></Text>
        </Pressable>
      )}

      <ScrollView ref={scroll} style={{ flex: 1, maxHeight: 520 }} contentContainerStyle={{ gap: 6 }}>
        {inInbox ? (
          whispers.conversations.length === 0 ? (
            <Text style={ui.muted}>No whispers yet. Tap "whisper" beside a name in any room to start one.</Text>
          ) : (
            whispers.conversations.map((entry) => (
              <Pressable key={entry.id} onPress={() => whispers.openWith(entry.id, entry.name)} accessibilityRole="button" style={{ paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.panelEdge }}>
                <Text style={[ui.text, { fontWeight: "700", color: entry.unread ? colors.verdigris : colors.ink }]}>
                  {entry.name}
                  {entry.unread ? ` · ${entry.unread} new` : ""}
                </Text>
                {entry.last && (
                  <Text style={ui.muted} numberOfLines={1}>
                    {entry.last.tinker.id === tinkerId ? "You: " : ""}
                    {entry.last.text}
                  </Text>
                )}
              </Pressable>
            ))
          )
        ) : (
          <>
            {shown.length === 0 && <Text style={ui.muted}>{EMPTY[which]}</Text>}
            {shown.map((message) => {
              const mine = message.tinker.id === tinkerId;
              return (
                <View key={message.id} style={{ gap: 1 }}>
                  <View style={{ flexDirection: "row", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
                    <Text style={[ui.number, { fontSize: 11, color: colors.muted }]}>{clockTime(message.at)}</Text>
                    <Text style={[ui.text, { color: mine ? colors.brass : colors.copper, fontWeight: "700" }]}>{message.tinker.name}</Text>
                    {!mine && which !== "whisper" && (
                      <Pressable onPress={() => whisperTo(message.tinker.id, message.tinker.name)} accessibilityRole="button" accessibilityLabel={`Whisper to ${message.tinker.name}`}>
                        <Text style={[ui.muted, { fontSize: 11 }]}>whisper</Text>
                      </Pressable>
                    )}
                    {!mine && (
                      <Pressable onPress={() => mute(message.tinker.id, true)} accessibilityRole="button" accessibilityLabel={`Mute ${message.tinker.name}`}>
                        <Text style={[ui.muted, { fontSize: 11 }]}>mute</Text>
                      </Pressable>
                    )}
                    {!mine && onInvite && which !== "guild" && which !== "whisper" && (
                      <Pressable onPress={() => onInvite(message.tinker.id)} accessibilityRole="button" accessibilityLabel={`Invite ${message.tinker.name} to the guild`}>
                        <Text style={[ui.muted, { fontSize: 11, color: colors.verdigris }]}>invite</Text>
                      </Pressable>
                    )}
                  </View>
                  <Text style={ui.text} selectable>
                    {message.text}
                  </Text>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
      {rooms.city.muted.length > 0 && (
        <Pressable onPress={() => rooms.city.muted.forEach((other) => mute(other, false))} accessibilityRole="button">
          <Text style={[ui.muted, { fontSize: 11 }]}>{rooms.city.muted.length} muted · unmute all</Text>
        </Pressable>
      )}
      {error && <Text style={[ui.muted, { color: colors.scald }]}>{error}</Text>}
      {!inInbox && (
        <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
          <TextInput
            value={draft}
            onChangeText={(text) => setDraft([...text].slice(0, MAX_CHARS).join(""))}
            onSubmitEditing={send}
            placeholder={which === "whisper" ? `Whisper to ${openName ?? "them"}` : PLACEHOLDERS[which]}
            placeholderTextColor={colors.muted}
            accessibilityLabel="Chat message"
            style={[ui.input, { flex: 1, fontFamily: undefined }]}
            blurOnSubmit={false}
          />
          <Pressable onPress={send} accessibilityRole="button" style={[ui.button, { opacity: draft.trim() && !sending ? 1 : 0.5 }]}>
            <Text style={ui.buttonText}>Say</Text>
          </Pressable>
        </View>
      )}
      {!inInbox && left <= 40 && <Text style={[ui.number, { fontSize: 11, color: left <= 10 ? colors.scald : colors.muted }]}>{left} left</Text>}
    </View>
  );
}

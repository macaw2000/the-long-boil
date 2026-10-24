// City and guild chat (build plan milestones 8 and 10; GDD section 7 puts chat
// on the right of the desktop screen). History loads once per channel; new
// messages arrive over the live connection. Any message from someone else can
// be muted, for this account only, and a guild's leader or officers can invite
// its sender from the city channel.

import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { api, type ChatChannel, type ChatMessage } from "./api";
import { colors, ui } from "./theme";

const MAX_CHARS = 280;
const KEEP = 200;

export interface ChatState {
  channel: ChatChannel;
  messages: ChatMessage[];
  muted: number[];
  unread: number;
  receive: (message: ChatMessage) => void;
  reload: () => void;
  markRead: () => void;
}

/** One channel's state, kept by the workshop so the live connection can feed it. `active` is false while the channel does not exist for this Tinker. */
export function useChat(tinkerId: number, channel: ChatChannel = "city", active = true): ChatState {
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

/** Which channel a pushed message belongs to. */
export function channelOf(message: ChatMessage): ChatChannel {
  return message.channel.startsWith("chat:guild:") ? "guild" : "city";
}

function clockTime(at: string): string {
  const time = new Date(at);
  return `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
}

export function Chat({
  tinkerId,
  city,
  guild,
  guildName,
  connected,
  onInvite,
}: {
  tinkerId: number;
  city: ChatState;
  /** The guild channel, when this Tinker is in a guild. */
  guild: ChatState | null;
  guildName?: string;
  connected: boolean;
  /** Set when this Tinker may invite to its guild. */
  onInvite?: (other: number) => void;
}) {
  const [which, setWhich] = useState<ChatChannel>("city");
  const chat = which === "guild" && guild ? guild : city;
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const { markRead } = chat;

  useEffect(() => {
    markRead();
    scroll.current?.scrollToEnd({ animated: true });
  }, [chat.messages.length, markRead, which]);

  const send = () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    api
      .say(tinkerId, text, chat.channel)
      .then(({ message }) => {
        chat.receive(message);
        setDraft("");
        setError(null);
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setSending(false));
  };

  const mute = (other: number, on: boolean) =>
    (on ? api.mute(tinkerId, other) : api.unmute(tinkerId, other))
      .then(() => {
        city.reload();
        guild?.reload();
      })
      .catch((reason: Error) => setError(reason.message));

  const left = MAX_CHARS - [...draft].length;
  const tab = (channel: ChatChannel, label: string, state: ChatState) => (
    <Pressable key={channel} onPress={() => setWhich(channel)} accessibilityRole="tab" accessibilityState={{ selected: which === channel }}>
      <Text style={[ui.heading, { fontSize: 15, color: which === channel ? colors.brass : colors.muted }]}>
        {label}
        {which !== channel && state.unread > 0 ? <Text style={{ color: colors.verdigris }}> •{state.unread}</Text> : null}
      </Text>
    </Pressable>
  );

  return (
    <View style={[ui.panel, { flex: 1, minHeight: 320 }]}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <View style={{ flexDirection: "row", gap: 12, flexShrink: 1 }}>
          {tab("city", "Kettleport", city)}
          {guild && tab("guild", guildName ?? "Guild", guild)}
        </View>
        <Text style={[ui.muted, { fontSize: 11, color: connected ? colors.verdigris : colors.scald }]}>{connected ? "● on the wire" : "○ reconnecting…"}</Text>
      </View>
      <ScrollView ref={scroll} style={{ flex: 1, maxHeight: 520 }} contentContainerStyle={{ gap: 6 }}>
        {chat.messages.length === 0 && <Text style={ui.muted}>{which === "guild" ? "The guild hall is quiet." : "The city is quiet. Say something."}</Text>}
        {chat.messages.map((message) => {
          const mine = message.tinker.id === tinkerId;
          return (
            <View key={message.id} style={{ gap: 1 }}>
              <View style={{ flexDirection: "row", gap: 6, alignItems: "baseline" }}>
                <Text style={[ui.number, { fontSize: 11, color: colors.muted }]}>{clockTime(message.at)}</Text>
                <Text style={[ui.text, { color: mine ? colors.brass : colors.copper, fontWeight: "700" }]}>{message.tinker.name}</Text>
                {!mine && (
                  <Pressable onPress={() => mute(message.tinker.id, true)} accessibilityRole="button" accessibilityLabel={`Mute ${message.tinker.name}`}>
                    <Text style={[ui.muted, { fontSize: 11 }]}>mute</Text>
                  </Pressable>
                )}
                {!mine && onInvite && which === "city" && (
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
      </ScrollView>
      {city.muted.length > 0 && (
        <Pressable onPress={() => city.muted.forEach((other) => mute(other, false))} accessibilityRole="button">
          <Text style={[ui.muted, { fontSize: 11 }]}>{city.muted.length} muted · unmute all</Text>
        </Pressable>
      )}
      {error && <Text style={[ui.muted, { color: colors.scald }]}>{error}</Text>}
      <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
        <TextInput
          value={draft}
          onChangeText={(text) => setDraft([...text].slice(0, MAX_CHARS).join(""))}
          onSubmitEditing={send}
          placeholder={which === "guild" ? "Say something to the guild" : "Say something to the city"}
          placeholderTextColor={colors.muted}
          accessibilityLabel="Chat message"
          style={[ui.input, { flex: 1, fontFamily: undefined }]}
          blurOnSubmit={false}
        />
        <Pressable onPress={send} accessibilityRole="button" style={[ui.button, { opacity: draft.trim() && !sending ? 1 : 0.5 }]}>
          <Text style={ui.buttonText}>Say</Text>
        </Pressable>
      </View>
      {left <= 40 && <Text style={[ui.number, { fontSize: 11, color: left <= 10 ? colors.scald : colors.muted }]}>{left} left</Text>}
    </View>
  );
}

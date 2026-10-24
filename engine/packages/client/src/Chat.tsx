// City chat (build plan milestone 8; GDD section 7 puts it on the right of the
// desktop screen). History loads once; new messages arrive over the live
// connection. Any message from someone else can be muted, for this account only.

import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { api, type ChatMessage } from "./api";
import { colors, ui } from "./theme";

const MAX_CHARS = 280;
const KEEP = 200;

export interface ChatState {
  messages: ChatMessage[];
  muted: number[];
  unread: number;
  receive: (message: ChatMessage) => void;
  reload: () => void;
  markRead: () => void;
}

/** The chat's state, kept by the workshop so the live connection can feed it. */
export function useChat(tinkerId: number): ChatState {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [muted, setMuted] = useState<number[]>([]);
  const [unread, setUnread] = useState(0);

  const reload = useCallback(() => {
    api
      .chat(tinkerId)
      .then((view) => {
        setMessages(view.messages);
        setMuted(view.muted);
      })
      .catch(() => undefined);
  }, [tinkerId]);

  useEffect(reload, [reload]);

  const receive = useCallback(
    (message: ChatMessage) => {
      setMessages((list) => (list.some((known) => known.id === message.id) ? list : [...list, message].slice(-KEEP)));
      if (message.tinker.id !== tinkerId) setUnread((count) => count + 1);
    },
    [tinkerId],
  );

  return { messages, muted, unread, receive, reload, markRead: useCallback(() => setUnread(0), []) };
}

function clockTime(at: string): string {
  const time = new Date(at);
  return `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
}

export function Chat({ tinkerId, chat, connected }: { tinkerId: number; chat: ChatState; connected: boolean }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const { markRead } = chat;

  useEffect(() => {
    markRead();
    scroll.current?.scrollToEnd({ animated: true });
  }, [chat.messages.length, markRead]);

  const send = () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    api
      .say(tinkerId, text)
      .then(({ message }) => {
        chat.receive(message);
        setDraft("");
        setError(null);
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setSending(false));
  };

  const mute = (other: number, on: boolean) =>
    (on ? api.mute(tinkerId, other) : api.unmute(tinkerId, other)).then(chat.reload).catch((reason: Error) => setError(reason.message));

  const left = MAX_CHARS - [...draft].length;

  return (
    <View style={[ui.panel, { flex: 1, minHeight: 320 }]}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={ui.heading}>Kettleport</Text>
        <Text style={[ui.muted, { fontSize: 11, color: connected ? colors.verdigris : colors.scald }]}>{connected ? "● on the wire" : "○ reconnecting…"}</Text>
      </View>
      <ScrollView ref={scroll} style={{ flex: 1, maxHeight: 520 }} contentContainerStyle={{ gap: 6 }}>
        {chat.messages.length === 0 && <Text style={ui.muted}>The city is quiet. Say something.</Text>}
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
              </View>
              <Text style={ui.text} selectable>
                {message.text}
              </Text>
            </View>
          );
        })}
      </ScrollView>
      {chat.muted.length > 0 && (
        <Pressable onPress={() => chat.muted.forEach((other) => mute(other, false))} accessibilityRole="button">
          <Text style={[ui.muted, { fontSize: 11 }]}>
            {chat.muted.length} muted · unmute all
          </Text>
        </Pressable>
      )}
      {error && <Text style={[ui.muted, { color: colors.scald }]}>{error}</Text>}
      <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
        <TextInput
          value={draft}
          onChangeText={(text) => setDraft([...text].slice(0, MAX_CHARS).join(""))}
          onSubmitEditing={send}
          placeholder="Say something to the city"
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

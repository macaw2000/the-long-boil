// Chat (build plan milestones 8 and 10). On desktop it is docked along the
// foot of the screen, as in Milky Way Idle, with a handle to drag it taller
// or shorter and a button to fold it down to its tabs; on a phone it is a
// place of its own. Five tabs: Kettleport for general talk, Trade for
// buying and selling, Help for new Tinkers' questions, the guild's own channel
// for members, and Whispers, private conversations between two Tinkers.
// History loads once per channel; new messages arrive over the live
// connection. Tapping a name offers whisper, mute and invite. Anyone else's
// messages can be muted, for this account only.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
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

export interface ChatProps {
  tinkerId: number;
  /** The rooms this Tinker reads; guild is null outside a guild. */
  rooms: { city: ChatState; trade: ChatState; help: ChatState; guild: ChatState | null };
  whispers: WhisperState;
  guildName?: string;
  connected: boolean;
  /** Set when this Tinker may invite to its guild. */
  onInvite?: (other: number) => void;
  /** Opens another Tinker's inspect card. */
  onInspect?: (other: number) => void;
}

export function Chat({
  tinkerId,
  rooms,
  whispers,
  guildName,
  connected,
  onInvite,
  onInspect,
  docked,
}: ChatProps & {
  /** Docked along the foot of the desktop screen, where it may be folded down to its tabs. */
  docked?: { folded: boolean; onFold: (folded: boolean) => void };
}) {
  const [which, setWhich] = useState<ChatChannel>("city");
  const [picked, setPicked] = useState<number | null>(null);
  const folded = docked?.folded ?? false;
  const room = which === "whisper" ? null : which === "guild" ? rooms.guild : rooms[which];
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const scroll = useRef<ScrollView>(null);

  // A whisper opened from elsewhere (an inspect card) brings the Whispers tab forward, and opens a folded dock.
  useEffect(() => {
    if (whispers.open === null) return;
    setWhich("whisper");
    docked?.onFold(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whispers.open]);

  // A guild room that has gone (left or disbanded) falls back to the city.
  useEffect(() => {
    if (which === "guild" && !rooms.guild) setWhich("city");
  }, [which, rooms.guild]);

  const shown = which === "whisper" ? (whispers.open !== null ? whispers.thread : []) : (room?.messages ?? []);
  // A folded dock reads nothing: its unread counts stay until it opens.
  const markRead = folded ? undefined : room?.markRead;
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
    setPicked(null);
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

  const choose = (channel: ChatChannel) => {
    setWhich(channel);
    setPicked(null);
    // Leaving the Whispers tab closes the thread, so a whisper asked for from elsewhere always brings it back.
    if (channel !== "whisper") whispers.close();
    if (folded) docked?.onFold(false);
  };
  const wire = <Text style={[ui.muted, { fontSize: 11, color: connected ? colors.verdigris : colors.scald }]}>{connected ? "● on the wire" : "○ reconnecting…"}</Text>;
  const tabBar = (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, flexShrink: 1 }} accessibilityRole="tablist">
      {tabs.map((tab) => (
        <Pressable
          key={tab.channel}
          onPress={() => choose(tab.channel)}
          accessibilityRole="tab"
          accessibilityState={{ selected: which === tab.channel }}
          style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4, borderWidth: 1, borderColor: which === tab.channel ? colors.brass : colors.panelEdge }}
        >
          <Text style={[ui.muted, { fontSize: 12, color: which === tab.channel ? colors.brass : colors.muted }]}>
            {tab.label}
            {(which !== tab.channel || folded) && tab.unread > 0 ? <Text style={{ color: colors.verdigris }}> {tab.unread}</Text> : null}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  if (docked) {
    // The dock's head: tabs on the left, the wire and the fold on the right.
    const head = (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={[ui.heading, { fontSize: 15 }]}>Chat</Text>
        {tabBar}
        <View style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 10 }}>
          {wire}
          <Pressable onPress={() => docked.onFold(!folded)} accessibilityRole="button" accessibilityLabel={folded ? "Open chat" : "Fold chat away"} hitSlop={8}>
            <Text style={[ui.text, { color: colors.brass, fontSize: 20, lineHeight: 20 }]}>{folded ? "▴" : "▾"}</Text>
          </Pressable>
        </View>
      </View>
    );
    if (folded) return <View style={{ paddingHorizontal: 12, paddingVertical: 6 }}>{head}</View>;
    return <View style={{ flex: 1, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 8, gap: 6 }}>{head}{body()}</View>;
  }

  return (
    <View style={[ui.panel, { flex: 1, minHeight: 320 }]}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <Text style={ui.heading}>Chat</Text>
        {wire}
      </View>
      {tabBar}
      {body()}
    </View>
  );

  function body() {
    return (
      <>
        {which === "whisper" && whispers.open !== null && (
          <Pressable onPress={whispers.close} accessibilityRole="button">
            <Text style={[ui.muted, { fontSize: 12 }]}>‹ All whispers · with <Text style={{ color: colors.brass }}>{openName}</Text></Text>
          </Pressable>
        )}

        <ScrollView ref={scroll} style={{ flex: 1, maxHeight: docked ? undefined : 520 }} contentContainerStyle={{ gap: 3 }}>
          {inInbox ? (
            whispers.conversations.length === 0 ? (
              <Text style={ui.muted}>No whispers yet. Tap a name in any room to whisper to them.</Text>
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
                const open = picked === message.id;
                const actions = [
                ...(onInspect ? [{ label: "inspect", tone: colors.ink, act: () => (setPicked(null), onInspect(message.tinker.id)) }] : []),
                  ...(which !== "whisper" ? [{ label: "whisper", tone: colors.brass, act: () => whisperTo(message.tinker.id, message.tinker.name) }] : []),
                  ...(onInvite && which !== "guild" && which !== "whisper" ? [{ label: "invite to guild", tone: colors.verdigris, act: () => (setPicked(null), onInvite(message.tinker.id)) }] : []),
                  { label: "mute", tone: colors.scald, act: () => (setPicked(null), mute(message.tinker.id, true)) },
                ];
                return (
                  <View key={message.id} style={{ gap: 2 }}>
                    <Text style={[ui.text, { lineHeight: 19 }]} selectable>
                      <Text style={[ui.number, { fontSize: 11, color: colors.muted }]}>{clockTime(message.at)} </Text>
                      <Text
                        onPress={mine ? undefined : () => setPicked(open ? null : message.id)}
                        accessibilityRole={mine ? undefined : "button"}
                        accessibilityLabel={mine ? undefined : `${message.tinker.name}: inspect, whisper, invite or mute`}
                        style={{ color: mine ? colors.brass : colors.copper, fontWeight: "700" }}
                      >
                        {message.tinker.name}
                      </Text>
                      <Text style={{ color: colors.muted }}>: </Text>
                      {message.text}
                    </Text>
                    {open && !mine && (
                      <View style={{ flexDirection: "row", gap: 6, paddingLeft: 40 }}>
                        {actions.map((action) => (
                          <Pressable
                            key={action.label}
                            onPress={action.act}
                            accessibilityRole="button"
                            accessibilityLabel={`${action.label} ${message.tinker.name}`}
                            style={{ borderWidth: 1, borderColor: action.tone, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 }}
                          >
                            <Text style={[ui.muted, { fontSize: 11, color: action.tone }]}>{action.label}</Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
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
      </>
    );
  }
}

const DOCK_KEY = "long-boil.chat.dock";
const DOCK_MIN = 140;

function loadDock(): { height: number; folded: boolean } {
  try {
    const saved = globalThis.localStorage?.getItem(DOCK_KEY);
    if (saved) return JSON.parse(saved) as { height: number; folded: boolean };
  } catch {
    // Fall through to the default.
  }
  return { height: 240, folded: false };
}

/** Chat docked along the foot of the desktop screen: drag the handle to size it, fold it to its tabs. This browser remembers both. */
export function ChatDock(props: ChatProps) {
  const [dock, setDock] = useState(loadDock);
  const max = Math.max(DOCK_MIN, Math.round(useWindowDimensions().height * 0.6));
  const height = Math.min(max, Math.max(DOCK_MIN, dock.height));
  const live = useRef({ height, max });
  live.current = { height, max };
  const from = useRef(height);

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(DOCK_KEY, JSON.stringify(dock));
    } catch {
      // Without storage the dock opens at its default next time.
    }
  }, [dock]);

  const handle = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          from.current = live.current.height;
        },
        onPanResponderMove: (_, drag) =>
          setDock((was) => ({ ...was, height: Math.min(live.current.max, Math.max(DOCK_MIN, from.current - drag.dy)) })),
      }),
    [],
  );

  return (
    <View style={{ height: dock.folded ? undefined : height, borderTopWidth: 1, borderTopColor: colors.brassDim, backgroundColor: "rgba(20, 16, 12, 0.94)" }}>
      {!dock.folded && (
        <View
          {...handle.panHandlers}
          accessibilityLabel="Drag to resize chat"
          // cursor and userSelect are react-native-web's, missing from the native types.
          style={[{ height: 10, marginTop: -5, alignItems: "center", justifyContent: "center" }, { cursor: "ns-resize", userSelect: "none" } as object]}
        >
          <View style={{ width: 48, height: 4, borderRadius: 2, backgroundColor: colors.brassDim }} />
        </View>
      )}
      <Chat {...props} docked={{ folded: dock.folded, onFold: (folded) => setDock((was) => ({ ...was, folded })) }} />
    </View>
  );
}

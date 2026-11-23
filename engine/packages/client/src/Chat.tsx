// Chat (build plan milestones 8 and 10). On desktop it is docked along the
// foot of the screen, as in Milky Way Idle, with a handle to drag it taller
// or shorter and a button to fold it down to its tabs; on a phone it is a
// place of its own. Five tabs: Kettleport for general talk, Trade for
// buying and selling, Help for new Tinkers' questions, the guild's own channel
// for members, and Whispers, private conversations between two Tinkers.
// History loads once per channel; new messages arrive over the live
// connection. Tapping a name offers whisper, mute and invite. Anyone else's
// messages can be muted, for this account only. Typed commands do the same
// by name: /w name message whispers, /r message replies to the last
// whisper, /profile name inspects, /invite name asks them into the guild,
// and /help (or the ? by Say) lists them;
// "//" sends a message that starts with a slash.

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
  /** Who /r replies to: the last Tinker to whisper this one. */
  replyTo: { id: number; name: string } | null;
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
  const [lastFrom, setLastFrom] = useState<{ id: number; name: string } | null>(null);
  const openRef = useRef<number | null>(null);
  openRef.current = open;

  const reload = useCallback(() => {
    api
      .whispers(tinkerId)
      .then(({ conversations }: { conversations: WhisperConversation[] }) => {
        // Before any whisper arrives live, /r goes to the latest who whispered last, else the latest conversation.
        const latest = conversations.find((conversation) => conversation.last.tinker.id !== tinkerId) ?? conversations[0];
        if (latest) setLastFrom((known) => known ?? latest.with);
        setInbox((known) =>
          conversations.map((conversation) => ({
            id: conversation.with.id,
            name: conversation.with.name,
            last: conversation.last,
            unread: known.find((entry) => entry.id === conversation.with.id)?.unread ?? 0,
          })),
        );
      })
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
      if (!mine) setLastFrom({ id: other, name: message.tinker.name });
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
    replyTo: lastFrom,
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

/** The chat commands, as /help and the ? by Say list them. */
const COMMANDS: { usage: string; does: string }[] = [
  { usage: "/w name message", does: "Whisper to a Tinker. Leave out the message to open the conversation." },
  { usage: "/r message", does: "Reply to whoever whispered you last." },
  { usage: "/profile name", does: "Look a Tinker over: guild, skills and gear." },
  { usage: "/invite name", does: "Invite a Tinker to your guild, if you lead it or are an officer." },
  { usage: "/help", does: "Show this list." },
];
const HINT = "/w name message · /r message · /profile name · /invite name · /help";

/** A typed command split into its word and the rest, or null for an ordinary message. */
function commandIn(text: string): { word: string; rest: string } | null {
  if (!text.startsWith("/") || text.startsWith("//")) return null;
  const [, word = "", rest = ""] = /^\/(\S*)\s*([\s\S]*)$/.exec(text) ?? [];
  return { word: word.toLowerCase(), rest };
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
  help: "No questions yet. New here? Ask anything. Type /help for chat commands.",
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
  /** Set when this Tinker may invite to its guild. Says whether the other joined at once; rejects with the refusal. */
  onInvite?: (other: number) => Promise<boolean>;
  /** Opens another Tinker's inspect card. */
  onInspect?: (other: number) => void;
  /** Asks for a tab from outside (the ledger's "Read guild chat"); a new `ask` brings it forward. */
  focus?: { channel: ChatChannel; ask: number };
}

export function Chat({
  tinkerId,
  rooms,
  whispers,
  guildName,
  connected,
  onInvite,
  onInspect,
  focus,
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
  /** What a command or a name's button just did, until the next thing typed or tapped. */
  const [done, setDone] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [helping, setHelping] = useState(false);
  const scroll = useRef<ScrollView>(null);

  // A whisper opened from elsewhere (an inspect card) brings the Whispers tab forward, and opens a folded dock.
  useEffect(() => {
    if (whispers.open === null) return;
    setWhich("whisper");
    docked?.onFold(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whispers.open]);

  useEffect(() => {
    if (!focus) return;
    setWhich(focus.channel);
    docked?.onFold(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.ask]);

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

  /** Whispers a Tinker, or with no words just opens the conversation. */
  const whisperWith = async (other: { id: number; name: string }, text: string) => {
    if (other.id === tinkerId) throw new Error("You cannot whisper to yourself");
    if (text) await api.say(tinkerId, text, "whisper", other.id);
    whisperTo(other.id, other.name);
  };

  const invite = async (other: { id: number; name: string }) => {
    if (!rooms.guild) throw new Error("You are not in a guild. Found or join one on the Guild tab.");
    if (!onInvite) throw new Error("Only the guild's leader and officers can invite.");
    if (other.id === tinkerId) throw new Error("You are already in your guild");
    const joined = await onInvite(other.id);
    setError(null);
    setDone(joined ? `${other.name} had applied, and has joined the guild.` : `Invited ${other.name}. The invitation waits on their Guild tab.`);
  };

  /** Runs a typed command: /help, /r, or /w, /profile and /invite, which find the Tinker named first. */
  const runCommand = async ({ word, rest }: { word: string; rest: string }) => {
    if (word === "help" || word === "?") {
      setHelping(true);
      return;
    }
    if (word === "r" || word === "reply") {
      if (!whispers.replyTo) throw new Error("No one has whispered you yet");
      return whisperWith(whispers.replyTo, rest);
    }
    const whisper = word === "w" || word === "whisper";
    if (!whisper && word !== "profile" && word !== "invite") throw new Error(`No /${word} command. Type /help for the list.`);
    if (!rest) throw new Error(whisper ? "/w name message" : `/${word} name`);
    const found = await api.named(tinkerId, rest);
    if (found.shared > 1) throw new Error(`${found.shared} Tinkers share that name. Tap theirs in chat instead.`);
    if (!found.tinker) throw new Error("No Tinker by that name. Use their whole name, as chat shows it.");
    const other = found.tinker;
    if (word === "invite") {
      // A whole name and nothing after it, so a slip never invites someone else.
      if (found.rest) throw new Error("/invite takes only a name. No Tinker has that whole name.");
      return invite(other);
    }
    if (!whisper) {
      if (!onInspect) throw new Error("Profiles cannot be opened here");
      onInspect(other.id);
      return;
    }
    await whisperWith(other, found.rest);
  };

  const send = () => {
    const typed = draft.trim();
    if (!typed || sending) return;
    setDone(null);
    const command = commandIn(typed);
    if (command) {
      setSending(true);
      runCommand(command)
        .then(() => {
          setDraft("");
          setError(null);
          // The list gives way to what the command opened, unless the command was asking for it.
          if (command.word !== "help" && command.word !== "?") setHelping(false);
        })
        .catch((reason: Error) => setError(reason.message))
        .finally(() => setSending(false));
      return;
    }
    const text = typed.startsWith("//") ? typed.slice(1) : typed;
    if (which === "whisper" && whispers.open === null) return;
    setSending(true);
    const call = which === "whisper" ? api.say(tinkerId, text, "whisper", whispers.open!) : api.say(tinkerId, text, which);
    call
      .then(({ message }) => {
        if (which === "whisper") whispers.receive(message);
        else room?.receive(message);
        setDraft("");
        setError(null);
        setHelping(false);
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
    setDone(null);
    setError(null);
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
              <Text style={ui.muted}>No whispers yet. Tap a name in any room to whisper to them, or type /w and their name in any room.</Text>
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
                  ...(onInvite && which !== "guild" && which !== "whisper" ? [{ label: "invite to guild", tone: colors.verdigris, act: () => (setPicked(null), setDone(null), void invite(message.tinker).catch((reason: Error) => setError(reason.message))) }] : []),
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
        {helping && (
          <View style={{ borderWidth: 1, borderColor: colors.brassDim, borderRadius: 4, padding: 8, gap: 3 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={[ui.text, { fontWeight: "700", color: colors.brass }]}>Chat commands</Text>
              <Pressable onPress={() => setHelping(false)} accessibilityRole="button" accessibilityLabel="Close chat commands" hitSlop={8}>
                <Text style={[ui.text, { color: colors.muted }]}>×</Text>
              </Pressable>
            </View>
            {COMMANDS.map((command) => (
              <Text key={command.usage} style={[ui.text, { fontSize: 13 }]}>
                <Text style={{ color: colors.copper, fontWeight: "700" }}>{command.usage}</Text>
                <Text style={{ color: colors.muted }}> {command.does}</Text>
              </Text>
            ))}
            <Text style={[ui.muted, { fontSize: 12 }]}>Names are whole names, as chat shows them. Or tap a name in chat to inspect, whisper, invite or mute.</Text>
          </View>
        )}
        {error ? (
          <Text style={[ui.muted, { color: colors.scald }]}>{error}</Text>
        ) : done ? (
          <Text style={[ui.muted, { color: colors.verdigris }]} accessibilityLiveRegion="polite">{done}</Text>
        ) : (
          !helping && draft.startsWith("/") && !draft.startsWith("//") && <Text style={[ui.muted, { fontSize: 11 }]}>{HINT}</Text>
        )}
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
            <Pressable
              onPress={() => setHelping((open) => !open)}
              accessibilityRole="button"
              accessibilityLabel={helping ? "Hide chat commands" : "Show chat commands"}
              style={{ borderWidth: 1, borderColor: helping ? colors.brass : colors.panelEdge, borderRadius: 4, width: 28, alignSelf: "stretch", alignItems: "center", justifyContent: "center" }}
            >
              <Text style={[ui.text, { color: helping ? colors.brass : colors.muted, fontWeight: "700" }]}>?</Text>
            </Pressable>
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

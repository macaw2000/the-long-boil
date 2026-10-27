// The Workshop (GDD section 7, what the screen shows): skills on the left,
// the Tinker at work in the centre, the stores on the right, and the Boiler
// and Nerve gauges on the top bar, the four Needles beside the name. Narrow
// screens stack the three columns. Further tabs hold the Story and the Exchange.
// City chat sits on the right of every tab on wide screens, and is its own tab
// on narrow ones; the live connection feeds it and says when to look again.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { ActionBar } from "./ActionBar";
import { api, gameNow, setClockOffset, type Content, type GuildView, type Ledger as LedgerData, type Notice, type Outcome, type QueueEntry, type Tinker, type TradeNote } from "./api";
import { Backdrop } from "./Backdrop";
import { Chat, channelOf, useChat, useWhispers } from "./Chat";
import { Bills, Exchange } from "./Exchange";
import { duration, namer, titleCase, tradeLine } from "./format";
import { Glow } from "./Glow";
import { currentStep, GuideCard, nudges, type GuideState, type Target } from "./Guide";
import { Guild } from "./Guild";
import { skillOf } from "./jobs";
import { CanisterDrop, Floaters, ScaldVignette, useFloaters } from "./Juice";
import { Ledger, STALL_REASONS } from "./Ledger";
import { useLive } from "./live";
import { Loadout } from "./Loadout";
import { NewGear } from "./NewGear";
import { BottomBar, SideNav, SkillStrip, type Place, type PlaceBadge } from "./SideNav";
import { Shop } from "./Shop";
import { SkillView } from "./SkillView";
import { ItemIcon, Scene } from "./Sprite";
import { Stores } from "./Stores";
import { Story } from "./Story";
import { colors, ui } from "./theme";
import { WorkOrders } from "./WorkOrders";

const LOOK_EVERY_MS = 5_000;
const BOILER_MS = 12 * 3_600_000;

export function Workshop({ content, tinkerId, admin, onLeave }: { content: Content; tinkerId: number; admin: boolean; onLeave: () => void }) {
  const [tinker, setTinker] = useState<Tinker | null>(null);
  const [away, setAway] = useState<{ ledger: LedgerData; trades: TradeNote[] } | null>(null);
  const [place, setPlace] = useState<Place>("skill:prospecting");
  const [recent, setRecent] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(gameNow());
  // Dev only: the story controls, and a key that remounts the Story tab after them.
  const [devQuality, setDevQuality] = useState("needle.scald");
  const [devValue, setDevValue] = useState("8");
  const [storyKey, setStoryKey] = useState(0);
  const name = useMemo(() => namer(content), [content]);
  const wide = useWindowDimensions().width >= 900;
  const [guide, setGuideState] = useState<GuideState>(() => loadGuide(tinkerId));
  const setGuide = (next: GuideState) => {
    setGuideState(next);
    saveGuide(tinkerId, next);
  };

  const [floaters, addFloater, removeFloater] = useFloaters();
  const [skillBursts, setSkillBursts] = useState<Record<string, number>>({});
  const [canisters, setCanisters] = useState(0);
  // A weapon seen in the stores for the first time, shown off until equipped or put aside.
  const [newGear, setNewGear] = useState<string | null>(null);
  const previous = useRef<Tinker | null>(null);

  // What changed since the last look, as things the player can watch arrive.
  const celebrate = useCallback(
    (next: Tinker) => {
      const before = previous.current;
      previous.current = next;
      if (!before) return;
      const count = (tinker: Tinker) => {
        const totals = new Map<string, number>();
        for (const stack of tinker.inventory) totals.set(stack.item, (totals.get(stack.item) ?? 0) + stack.qty);
        return totals;
      };
      const was = count(before);
      for (const [item, qty] of count(next)) {
        const gained = qty - (was.get(item) ?? 0);
        if (gained > 0) addFloater(`+${gained.toLocaleString()} ${name(item)}`, colors.brass, item);
        if (gained > 0 && !was.get(item) && content.weapons.some((weapon) => weapon.item === item)) setNewGear(item);
      }
      const gainedCrowns = next.crowns - before.crowns;
      if (gainedCrowns > 0) addFloater(`+${gainedCrowns.toLocaleString()} Crowns`, colors.brass);
      for (const skill of next.skills) {
        const old = before.skills.find((entry) => entry.skill === skill.skill)?.level ?? 1;
        if (skill.level > old) {
          addFloater(`${titleCase(skill.skill)} ${skill.level}!`, colors.verdigris);
          setSkillBursts((bursts) => ({ ...bursts, [skill.skill]: (bursts[skill.skill] ?? 0) + 1 }));
        }
      }
      if (next.story.letters > before.story.letters) setCanisters((drops) => drops + 1);
    },
    // addFloater is stable in effect: it only appends to state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [name],
  );

  const noteRecent = useCallback(
    (ledger: LedgerData, trades: TradeNote[]) => {
      const lines = ledger.lines.map((line) =>
        line.id.startsWith("monster.")
          ? `${line.count} × ${name(line.id)}${line.crowns ? `, ${line.crowns} Crowns` : ""}`
          : `${name(line.id)} × ${line.count}`,
      );
      const ups = ledger.levelUps.map((up) => `${titleCase(up.skill)} reached ${up.level}`);
      const fills = trades.map((note) => tradeLine(note, name));
      // A job that cannot run is taken off the queue; say so, or it seems to vanish.
      const stalls = ledger.stalls.map(
        (stall) => `${name(stall.actionId)} was taken off the queue: it ${STALL_REASONS[stall.reason] ?? stall.reason}.`,
      );
      if (stalls.length || lines.length || ups.length || fills.length) {
        setRecent((previous) => [...stalls, ...fills, ...ups, ...lines, ...previous].slice(0, 8));
      }
    },
    [name],
  );

  // Opening the workshop goes to whatever the Tinker is busy at, once; after that the player moves.
  const placed = useRef(false);
  const apply = useCallback(
    (outcome: Outcome) => {
      celebrate(outcome.tinker);
      setTinker(outcome.tinker);
      setError(null);
      if (!placed.current) {
        placed.current = true;
        const busy = outcome.tinker.queue[0];
        if (busy) setPlace(`skill:${skillOf(content, busy.actionId)}`);
      }
    },
    [celebrate, content],
  );

  // Opening the workshop is a check-in: it resolves the time away and refills the Boiler.
  const checkIn = useCallback(
    () =>
      api
        .checkIn(tinkerId)
        .then((outcome) => {
          apply(outcome);
          const { ledger, trades } = outcome;
          if (ledger.lines.length || ledger.stalls.length || ledger.boilerDryAt !== null || trades.length) {
            setAway({ ledger, trades });
          }
        })
        .catch((reason: Error) => setError(reason.message)),
    [tinkerId, apply],
  );

  useEffect(() => {
    checkIn();
  }, [checkIn]);

  /** Dev only: move the game's clock on, then come back as a fresh visit would. */
  const skip = (hours: number) =>
    api
      .devSkip(hours)
      .then(({ offsetMs }) => {
        setClockOffset(offsetMs);
        setNow(gameNow());
        return checkIn();
      })
      .catch((reason: Error) => setError(reason.message));

  /** Dev only: set story qualities or fill Nerve, then show the result everywhere. */
  const devStory = (change: { qualities?: Record<string, number>; fillNerve?: boolean }) =>
    api
      .devStory(tinkerId, change)
      .then((outcome) => {
        apply(outcome);
        setStoryKey((key) => key + 1);
        setError(null);
      })
      .catch((reason: Error) => setError(reason.message));

  const lookAgain = useCallback(
    () =>
      api
        .look(tinkerId)
        .then((outcome) => {
          apply(outcome);
          noteRecent(outcome.ledger, outcome.trades);
        })
        .catch((reason: Error) => setError(reason.message)),
    [tinkerId, apply, noteRecent],
  );

  // The server says when something changed (a fill, another session's action);
  // chat arrives the same way.
  const chat = useChat(tinkerId);
  const trade = useChat(tinkerId, "trade");
  const help = useChat(tinkerId, "help");
  const whispers = useWhispers(tinkerId);
  const { receive: receiveChat, reload: reloadChat } = chat;
  const { receive: receiveTrade, reload: reloadTrade } = trade;
  const { receive: receiveHelp, reload: reloadHelp } = help;
  const { receive: receiveWhisper, reload: reloadWhispers } = whispers;

  // The guild: its view feeds the Guild tab, and membership decides whether guild chat exists.
  const [guildView, setGuildView] = useState<GuildView | null>(null);
  const loadGuild = useCallback(() => {
    api
      .guild(tinkerId)
      .then(setGuildView)
      .catch(() => undefined);
  }, [tinkerId]);
  useEffect(loadGuild, [loadGuild]);
  const guildChat = useChat(tinkerId, "guild", Boolean(guildView?.guild));
  const { receive: receiveGuildChat } = guildChat;
  const inviteToGuild =
    guildView?.guild && guildView.guild.rank !== "member"
      ? (other: number) =>
          api
            .invite(tinkerId, other)
            .then(setGuildView)
            .catch((reason: Error) => setError(reason.message))
      : undefined;

  const connected = useLive(
    tinkerId,
    useCallback(
      (notice: Notice) => {
        if (notice.type === "changed") lookAgain();
        else if (notice.type === "chat") {
          const into = { city: receiveChat, trade: receiveTrade, help: receiveHelp, guild: receiveGuildChat, whisper: receiveWhisper };
          into[channelOf(notice.message)](notice.message);
        } else if (notice.type === "mutes") {
          reloadChat();
          reloadTrade();
          reloadHelp();
          reloadWhispers();
        }
        else if (notice.type === "guild") {
          loadGuild();
          lookAgain();
        }
      },
      [lookAgain, receiveChat, receiveTrade, receiveHelp, receiveGuildChat, receiveWhisper, reloadChat, reloadTrade, reloadHelp, reloadWhispers, loadGuild],
    ),
  );

  // While the workshop is open, still look in every few seconds: work lands on
  // the Boiler's clock, which nothing pushes.
  useEffect(() => {
    const look = setInterval(lookAgain, LOOK_EVERY_MS);
    const tick = setInterval(() => setNow(gameNow()), 250);
    return () => {
      clearInterval(look);
      clearInterval(tick);
    };
  }, [lookAgain]);

  const run = (call: Promise<Outcome>) =>
    call
      .then((outcome) => {
        apply(outcome);
        noteRecent({ ...outcome.ledger, lines: [], levelUps: [] }, outcome.trades);
      })
      .catch((reason: Error) => setError(reason.message));
  const setQueue = (queue: QueueEntry[]) => run(api.setQueue(tinkerId, queue));

  if (!tinker) {
    return (
      <View style={{ padding: 24, gap: 12 }}>
        <Text style={ui.muted}>{error ?? "Unlocking the workshop…"}</Text>
        {error && (
          <Pressable onPress={onLeave} accessibilityRole="button">
            <Text style={[ui.text, { color: colors.brass }]}>Back to sign-in</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const steamLeft = new Date(tinker.steamUntil).getTime() - now;
  // The guide points at one thing at a time; after it, the nudges point at whatever is ready.
  const step = currentStep(tinker, guide);
  const lit: Set<Target> = step ? new Set([step.target]) : nudges(tinker, content, now);
  // Each guide target lights the place that holds it.
  const placeOf = (target: Target): Place | null =>
    target === "story" ? "story" : target === "exchange" ? "exchange" : null;
  const litPlaces = new Set<Place>([...lit].map(placeOf).filter((value): value is Place => value !== null && value !== place));

  // Where the guide's queueing steps want the player: spanners at Tinkering, rats at the fights.
  const guidedPlace: Place | null = step?.id === "queue_spanners" ? "skill:tinkering" : step?.id === "rats" ? "skill:fight" : null;
  if (guidedPlace && lit.has("queue") && place !== guidedPlace) litPlaces.add(guidedPlace);

  const head = tinker.queue[0];
  const headSeconds = head
    ? (content.actions.find((action) => action.id === head.actionId)?.seconds ??
      content.monsters.find((monster) => monster.id === head.actionId)?.seconds_per_kill ??
      0)
    : 0;
  const working = head && steamLeft > 0;
  // Where Work leads: the skill the Tinker is busy at, or the first skill when idle.
  const workPlace: Place = head ? `skill:${skillOf(content, head.actionId)}` : "skill:prospecting";
  const elapsed = working ? tinker.progressMs + Math.max(0, now - new Date(tinker.resolvedTo).getTime()) : tinker.progressMs;
  // The server's time for one go, since a kill takes as long as the Tinker's fighting does.
  const goMs = tinker.headMs ?? headSeconds * 1000;
  // Between looks, goes still to come carry on from the start, so each kill shows as one.
  const headProgress = goMs <= 0 ? 0 : head && head.remaining > 1 ? (elapsed % goMs) / goMs : Math.min(1, elapsed / goMs);

  const equipWeapon = (item: string) => {
    setNewGear(null);
    return run(api.equip(tinkerId, item));
  };

  const badges: Partial<Record<Place, PlaceBadge>> = {
    story: {
      count: tinker.story.letters + (tinker.story.openScenes > 0 && tinker.story.nerve > 0 ? 1 : 0),
      label: tinker.story.letters > 0 ? String(tinker.story.letters) : tinker.story.openScenes > 0 && tinker.story.nerve > 0 ? "•" : undefined,
    },
    exchange: tinker.story.debts.some((debt) => tinker.crowns >= debt.crowns)
      ? { count: 1, label: "!", tone: colors.copper }
      : { count: tinker.workOrders, tone: colors.verdigris },
    guild: {
      count: (guildView?.invites.length ?? 0) + (guildView?.guild?.requests.filter((request) => request.kind === "application").length ?? 0),
      tone: colors.verdigris,
    },
    chat: place === "chat" ? undefined : { count: chat.unread + trade.unread + help.unread + guildChat.unread + whispers.unread, tone: colors.verdigris },
  };

  const scene = (
    <View>
      <Scene tinker={tinker} content={content} progress={headProgress} working={Boolean(working)} />
      <Floaters floaters={floaters} onDone={removeFloater} icon={(item) => <ItemIcon item={item} size={22} />} />
    </View>
  );

  const loadout = (
    <Glow active={lit.has("loadout")}>
      <Loadout content={content} tinker={tinker} name={name} onEquip={equipWeapon} portrait={wide ? 128 : 192} />
    </Glow>
  );

  const chatPanel = (
    <Chat
      tinkerId={tinkerId}
      rooms={{ city: chat, trade, help, guild: guildView?.guild ? guildChat : null }}
      whispers={whispers}
      guildName={guildView?.guild?.name}
      connected={connected}
      onInvite={inviteToGuild}
    />
  );

  const skillPlace = place.startsWith("skill:") ? place.slice("skill:".length) : null;
  const page =
    skillPlace !== null ? (
      <SkillView
        key={skillPlace}
        skill={skillPlace}
        content={content}
        tinker={tinker}
        name={name}
        scene={scene}
        queueLit={lit.has("queue")}
        onStart={(entry) => setQueue([entry, ...tinker.queue.slice(1)])}
        onQueue={(entry) => setQueue([...tinker.queue, entry].slice(0, tinker.upgrades.queueSlots))}
        onGrocer={() => setPlace("exchange")}
      />
    ) : place === "shop" ? (
      <Shop tinker={tinker} now={now} onOutcome={apply} />
    ) : place === "story" ? (
      <Story key={storyKey} tinkerId={tinkerId} onOutcome={apply} />
    ) : place === "guild" ? (
      <Guild tinkerId={tinkerId} view={guildView} setView={setGuildView} crownsHeld={tinker.crowns} />
    ) : place === "exchange" ? (
      <View style={{ gap: 12 }}>
        {tinker.story.debts.length > 0 && <Bills tinker={tinker} act={run} />}
        <WorkOrders content={content} tinker={tinker} name={name} onOutcome={apply} />
        <Exchange content={content} tinker={tinker} name={name} run={run} />
      </View>
    ) : place === "stores" ? (
      <View style={{ gap: 12 }}>
        <Stores tinker={tinker} name={name} />
        {loadout}
      </View>
    ) : (
      <View style={{ height: 520 }}>{chatPanel}</View>
    );

  return (
    <View style={{ flex: 1 }}>
      <Backdrop place={place} />
      <ScaldVignette scald={tinker.story.needles["needle.scald"] ?? 0} />
      <ActionBar
        content={content}
        tinker={tinker}
        name={name}
        now={now}
        wide={wide}
        elapsedMs={headProgress * goMs}
        headSeconds={goMs / 1000}
        lit={lit}
        onRemove={(slot) => setQueue(tinker.queue.filter((_, index) => index !== slot))}
        onAdd={() => setPlace(guidedPlace ?? (place.startsWith("skill:") ? place : workPlace))}
        onShop={() => setPlace("shop")}
        onLeave={onLeave}
      />
      {/* The dev tools: wherever the server runs a dev clock, for admins only (everyone under the dev login). */}
      {content.dev && admin && (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 16,
            paddingVertical: 6,
            backgroundColor: "#3a2a1a",
            borderBottomWidth: 1,
            borderBottomColor: colors.copper,
          }}
        >
          <Text style={[ui.muted, { color: colors.copper }]}>Dev clock · come back after</Text>
          {[1, 2, 6, 12, 24].map((hours) => (
            <Pressable key={hours} onPress={() => skip(hours)} accessibilityRole="button" style={devButton}>
              <Text style={[ui.number, { color: colors.copper }]}>{hours}h</Text>
            </Pressable>
          ))}
          <Text style={ui.muted}>· ahead by {duration(content.dev ? gameNow() - Date.now() : 0)}</Text>
          <Text style={[ui.muted, { color: colors.copper, marginLeft: 12 }]}>Story</Text>
          {[
            { label: "Scald 8", change: { qualities: { "needle.scald": 8 } } },
            { label: "Scald 0", change: { qualities: { "needle.scald": 0 } } },
            { label: "Fill Nerve", change: { fillNerve: true } },
          ].map(({ label, change }) => (
            <Pressable key={label} onPress={() => devStory(change)} accessibilityRole="button" style={devButton}>
              <Text style={[ui.number, { color: colors.copper }]}>{label}</Text>
            </Pressable>
          ))}
          <Text style={[ui.muted, { color: colors.copper, marginLeft: 12 }]}>Shop</Text>
          {[
            { label: "+3 crates", locked: false },
            { label: "+1 locked", locked: true },
          ].map(({ label, locked }) => (
            <Pressable
              key={label}
              onPress={() =>
                api
                  .devCrates(tinkerId, locked ? 1 : 3, locked)
                  .then(apply)
                  .catch((reason: Error) => setError(reason.message))
              }
              accessibilityRole="button"
              style={devButton}
            >
              <Text style={[ui.number, { color: colors.copper }]}>{label}</Text>
            </Pressable>
          ))}
          <TextInput
            value={devQuality}
            onChangeText={setDevQuality}
            accessibilityLabel="Dev quality name"
            autoCapitalize="none"
            style={[ui.input, { width: 170, paddingVertical: 2, fontSize: 12 }]}
          />
          <TextInput
            value={devValue}
            onChangeText={setDevValue}
            accessibilityLabel="Dev quality value"
            keyboardType="number-pad"
            style={[ui.input, { width: 48, paddingVertical: 2, fontSize: 12 }]}
          />
          <Pressable onPress={() => devStory({ qualities: { [devQuality.trim()]: Number(devValue) } })} accessibilityRole="button" style={devButton}>
            <Text style={[ui.number, { color: colors.copper }]}>Set</Text>
          </Pressable>
        </View>
      )}
      {!wide && skillPlace !== null && <SkillStrip content={content} tinker={tinker} place={place} onPlace={setPlace} />}
      <View style={{ flex: 1, flexDirection: "row" }}>
        {wide && (
          <View style={{ borderRightWidth: 1, borderRightColor: colors.panelEdge, backgroundColor: "rgba(20, 16, 12, 0.6)" }}>
            <SideNav content={content} tinker={tinker} place={place} onPlace={setPlace} badges={badges} lit={litPlaces} />
            <CanisterDrop drops={canisters} />
          </View>
        )}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 900, width: "100%", alignSelf: "center" }}>
          {step && (
            <GuideCard
              step={step}
              content={content}
              onAcknowledge={() => setGuide({ ...guide, acknowledged: [...guide.acknowledged, step.id] })}
              onSkip={() => setGuide({ ...guide, skipped: true })}
            />
          )}
          {error && <Text style={[ui.text, { color: colors.scald }]}>{error}</Text>}
          {away && <Ledger ledger={away.ledger} trades={away.trades} name={name} onClose={() => setAway(null)} />}
          {page}
          {recent.length > 0 && skillPlace !== null && (
            <View style={ui.panel}>
              <Text style={ui.heading}>Just now</Text>
              {recent.map((line, index) => (
                <Text key={index} style={[ui.muted, index === 0 && { color: colors.ink }]}>
                  {line}
                </Text>
              ))}
            </View>
          )}
        </ScrollView>
        {wide && (
          <ScrollView style={{ width: 330, flexGrow: 0 }} contentContainerStyle={{ padding: 16, paddingLeft: 0, gap: 12 }}>
            <Stores tinker={tinker} name={name} />
            {loadout}
            <View style={{ height: 460 }}>{chatPanel}</View>
          </ScrollView>
        )}
      </View>
      {!wide && <BottomBar place={place} workPlace={workPlace} onPlace={setPlace} badges={badges} lit={litPlaces} />}
      {newGear && (
        <NewGear item={newGear} content={content} tinker={tinker} name={name} onEquip={equipWeapon} onClose={() => setNewGear(null)} />
      )}
    </View>
  );
}

const devButton = { borderWidth: 1, borderColor: colors.copper, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 };

// The guide's progress is a per-browser convenience; without storage it simply starts again.
function guideKey(tinkerId: number) {
  return `long-boil.guide.${tinkerId}`;
}

function loadGuide(tinkerId: number): GuideState {
  try {
    const saved = globalThis.localStorage?.getItem(guideKey(tinkerId));
    if (saved) return JSON.parse(saved) as GuideState;
  } catch {
    // Fall through to a fresh guide.
  }
  return { acknowledged: [], skipped: false };
}

function saveGuide(tinkerId: number, state: GuideState) {
  try {
    globalThis.localStorage?.setItem(guideKey(tinkerId), JSON.stringify(state));
  } catch {
    // Storage is a convenience only.
  }
}

function Bar({ fraction, color }: { fraction: number; color: string }) {
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.soot, overflow: "hidden" }}>
      <View style={{ width: `${Math.round(Math.max(0, Math.min(1, fraction)) * 1000) / 10}%`, height: "100%", backgroundColor: color }} />
    </View>
  );
}


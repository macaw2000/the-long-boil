// The Workshop (GDD section 7, what the screen shows): skills on the left,
// the Tinker at work in the centre, the stores on the right, and the Boiler
// and Nerve gauges on the top bar, the four Needles beside the name. Narrow
// screens stack the three columns. Further tabs hold the Story and the Exchange.
// City chat sits on the right of every tab on wide screens, and is its own tab
// on narrow ones; the live connection feeds it and says when to look again.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { api, gameNow, setClockOffset, type Content, type Ledger as LedgerData, type Notice, type Outcome, type QueueEntry, type Tinker, type TradeNote } from "./api";
import { Chat, useChat } from "./Chat";
import { Exchange } from "./Exchange";
import { Glow } from "./Glow";
import { ItemIcon, Scene } from "./Sprite";
import { Badge, CanisterDrop, CountUp, Floaters, Gauge, ScaldVignette, Sparks, SteamTube, useFloaters } from "./Juice";
import { currentStep, GuideCard, nudges, type GuideState, type Target } from "./Guide";
import { Story } from "./Story";
import { duration, levelProgress, namer, seconds, titleCase, tradeLine } from "./format";
import { Ledger, STALL_REASONS } from "./Ledger";
import { QueuePicker } from "./QueuePicker";
import { useLive } from "./live";
import { colors, ui } from "./theme";

const LOOK_EVERY_MS = 5_000;
const BOILER_MS = 12 * 3_600_000;

export function Workshop({ content, tinkerId, onLeave }: { content: Content; tinkerId: number; onLeave: () => void }) {
  const [tinker, setTinker] = useState<Tinker | null>(null);
  const [away, setAway] = useState<{ ledger: LedgerData; trades: TradeNote[] } | null>(null);
  const [tab, setTab] = useState<"workshop" | "story" | "exchange" | "chat">("workshop");
  const [recent, setRecent] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
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

  const apply = useCallback(
    (outcome: Outcome) => {
      celebrate(outcome.tinker);
      setTinker(outcome.tinker);
      setError(null);
    },
    [celebrate],
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
  const { receive: receiveChat, reload: reloadChat } = chat;
  const connected = useLive(
    tinkerId,
    useCallback(
      (notice: Notice) => {
        if (notice.type === "changed") lookAgain();
        else if (notice.type === "chat") receiveChat(notice.message);
        else if (notice.type === "mutes") reloadChat();
      },
      [lookAgain, receiveChat, reloadChat],
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
  const tabFor = (target: Target) => (target === "story" || target === "exchange" ? target : "workshop");
  const tabLit = (choice: "workshop" | "story" | "exchange" | "chat") => [...lit].some((target) => tabFor(target) === choice) && tab !== choice;

  const skills = (
    <View style={ui.panel}>
      <Text style={ui.heading}>Skills</Text>
      {tinker.skills.length === 0 && <Text style={ui.muted}>Every skill at 1. Queue some work.</Text>}
      {tinker.skills.map((skill) => {
        const progress = levelProgress(content, skill.xp, skill.level);
        return (
          <View key={skill.skill} style={{ gap: 3 }}>
            <Sparks bursts={skillBursts[skill.skill] ?? 0}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={ui.text}>{titleCase(skill.skill)}</Text>
                <Text style={ui.number}>{skill.level}</Text>
              </View>
            </Sparks>
            {progress && <Bar fraction={progress.into / progress.span} color={colors.verdigris} />}
            <Text style={[ui.muted, { fontSize: 11 }]}>
              {skill.xp.toLocaleString()} XP{progress ? ` · ${(progress.span - progress.into).toLocaleString()} to go` : ""}
            </Text>
          </View>
        );
      })}
    </View>
  );

  const head = tinker.queue[0];
  const headSeconds = head
    ? (content.actions.find((action) => action.id === head.actionId)?.seconds ??
      content.monsters.find((monster) => monster.id === head.actionId)?.seconds_per_kill ??
      0)
    : 0;
  const working = head && steamLeft > 0;
  const elapsed = working ? tinker.progressMs + Math.max(0, now - new Date(tinker.resolvedTo).getTime()) : tinker.progressMs;

  const centre = (
    <View style={{ gap: 12 }}>
      <Scene tinker={tinker} content={content} progress={headSeconds > 0 ? Math.min(1, elapsed / (headSeconds * 1000)) : 0} working={Boolean(working)} />
      <Floaters floaters={floaters} onDone={removeFloater} icon={(item) => <ItemIcon item={item} size={22} />} />
      {away && <Ledger ledger={away.ledger} trades={away.trades} name={name} onClose={() => setAway(null)} />}
      <Glow active={lit.has("bench")}>
      <View style={ui.panel}>
        <Text style={ui.heading}>At the bench</Text>
        {tinker.queue.length === 0 && <Text style={ui.muted}>The bench is idle. Queue up to two jobs.</Text>}
        {tinker.queue.map((entry, slot) => {
          const fight = content.monsters.some((monster) => monster.id === entry.actionId);
          return (
            <View key={`${slot}-${entry.actionId}`} style={{ gap: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={ui.text}>
                  {slot === 0 ? (fight ? "Fighting " : "Now: ") : "Then: "}
                  {name(entry.actionId)}
                </Text>
                <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                  <Text style={ui.number}>{entry.remaining.toLocaleString()} left</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${name(entry.actionId)}`}
                    onPress={() => setQueue(tinker.queue.filter((_, index) => index !== slot))}
                  >
                    <Text style={[ui.muted, { color: colors.scald }]}>remove</Text>
                  </Pressable>
                </View>
              </View>
              {slot === 0 && headSeconds > 0 && (
                <>
                  <SteamTube fraction={Math.min(1, elapsed / (headSeconds * 1000))} working={Boolean(working)} />
                  <Text style={[ui.muted, { fontSize: 11 }]}>
                    {working
                      ? `${fight ? "about " : ""}${seconds(Math.max(0, headSeconds - elapsed / 1000))} until the next ${fight ? "kill" : "one"}`
                      : "Stopped: the Boiler is dry."}
                  </Text>
                </>
              )}
            </View>
          );
        })}
        {tinker.queue.length < 2 && !picking && (
          <Glow active={lit.has("queue")} style={{ alignSelf: "flex-start" }}>
            <Pressable style={ui.button} onPress={() => setPicking(true)} accessibilityRole="button">
              <Text style={ui.buttonText}>Queue work</Text>
            </Pressable>
          </Glow>
        )}
      </View>
      </Glow>
      {picking && (
        <QueuePicker
          content={content}
          tinker={tinker}
          name={name}
          onCancel={() => setPicking(false)}
          onPick={(entry) => {
            setPicking(false);
            setQueue([...tinker.queue, entry]);
          }}
        />
      )}
      {recent.length > 0 && (
        <View style={ui.panel}>
          <Text style={ui.heading}>Just now</Text>
          {recent.map((line, index) => (
            <Text key={index} style={[ui.muted, index === 0 && { color: colors.ink }]}>
              {line}
            </Text>
          ))}
        </View>
      )}
    </View>
  );

  const weapons = content.weapons.filter((weapon) => tinker.inventory.some((stack) => stack.item === weapon.item));
  const levelOf = (skill: string) => tinker.skills.find((entry) => entry.skill === skill)?.level ?? 1;

  const stores = (
    <View style={{ gap: 12 }}>
      <Glow active={lit.has("loadout")}>
      <View style={ui.panel}>
        <Text style={ui.heading}>Loadout</Text>
        <Text style={ui.text}>{tinker.weapon ? name(tinker.weapon) : "Bare hands. Equip a weapon to fight."}</Text>
        {weapons
          .filter((weapon) => weapon.item !== tinker.weapon)
          .map((weapon) => {
            const usable = levelOf(weapon.style) >= weapon.level_required;
            return (
              <View key={weapon.item} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={ui.muted}>
                  {name(weapon.item)} · {weapon.style} {weapon.level_required}
                </Text>
                <Pressable
                  disabled={!usable}
                  style={[ui.button, { paddingVertical: 4 }, !usable && { opacity: 0.4 }]}
                  onPress={() => run(api.equip(tinkerId, weapon.item))}
                  accessibilityRole="button"
                >
                  <Text style={ui.buttonText}>Equip</Text>
                </Pressable>
              </View>
            );
          })}
      </View>
      </Glow>
      <View style={ui.panel}>
        <Text style={ui.heading}>Stores</Text>
        {tinker.inventory.length === 0 && <Text style={ui.muted}>Empty shelves.</Text>}
        {tinker.inventory.map((stack) => (
          <View key={`${stack.item}-${stack.bound}`} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
              <ItemIcon item={stack.item} size={28} />
              <Text style={ui.text}>
                {name(stack.item)}
                {stack.bound ? <Text style={ui.muted}> (bound)</Text> : null}
              </Text>
            </View>
            <CountUp value={stack.qty} style={ui.number} />
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <ScaldVignette scald={tinker.story.needles["needle.scald"] ?? 0} />
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 16,
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: colors.panelEdge,
        }}
      >
        <Text style={[ui.heading, { fontSize: 20 }]}>No. 9 Sprocket Row</Text>
        <Text style={ui.muted}>{tinker.name}</Text>
        <Glow active={lit.has("boiler")}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Gauge fraction={Math.max(0, steamLeft) / BOILER_MS} />
            <View>
              <Text style={ui.muted}>Boiler</Text>
              <Text style={[ui.number, { color: steamLeft > 2 * 3_600_000 ? colors.ink : colors.scald }]}>
                {steamLeft > 0 ? duration(steamLeft) : "dry"}
              </Text>
            </View>
          </View>
        </Glow>
        <View style={{ minWidth: 140, maxWidth: 200, flex: 1, gap: 3 }}>
          <Text style={ui.muted}>
            Nerve · {tinker.story.nerve}/{tinker.story.nerveCap}
          </Text>
          <Bar fraction={tinker.story.nerve / tinker.story.nerveCap} color={colors.verdigris} />
        </View>
        <CountUp value={tinker.crowns} suffix=" Crowns" style={[ui.number, { color: colors.brass, fontSize: 15 }]} />
        {tinker.story.inInfirmary && <Badge count={1} label="St. Pinion's" tone={colors.scald} />}
        <View style={{ flexDirection: "row", gap: 8 }} accessibilityLabel="The four Needles">
          {Object.entries(tinker.story.needles).map(([needle, value]) => (
            <Text key={needle} style={[ui.number, { color: value >= 8 ? colors.scald : value > 0 ? colors.copper : colors.muted }]}>
              {titleCase(needle.split(".")[1] ?? needle)} {value}
            </Text>
          ))}
        </View>
        <Pressable onPress={onLeave} accessibilityRole="button">
          <Text style={ui.muted}>Leave</Text>
        </Pressable>
      </View>
      {content.dev && (
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
      <View style={{ flexDirection: "row", gap: 4, paddingHorizontal: 16, paddingTop: 10 }}>
        {(wide ? (["workshop", "story", "exchange"] as const) : (["workshop", "story", "exchange", "chat"] as const)).map((choice) => (
          <Glow key={choice} active={tabLit(choice)}>
          <Pressable
            onPress={() => setTab(choice)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === choice }}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 14,
              borderBottomWidth: 2,
              borderBottomColor: tab === choice ? colors.brass : "transparent",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[ui.text, { color: tab === choice ? colors.brass : colors.muted }]}>{titleCase(choice)}</Text>
              {choice === "story" && <Badge count={tinker.story.letters + (tinker.story.openScenes > 0 && tinker.story.nerve > 0 ? 1 : 0)} label={tinker.story.letters > 0 ? String(tinker.story.letters) : tinker.story.openScenes > 0 && tinker.story.nerve > 0 ? "•" : undefined} />}
              {choice === "exchange" && tinker.story.debts.some((debt) => tinker.crowns >= debt.crowns) && <Badge count={1} label="!" tone={colors.copper} />}
              {choice === "workshop" && tinker.queue.length === 0 && <Badge count={1} label="idle" tone={colors.scald} />}
              {choice === "chat" && tab !== "chat" && <Badge count={chat.unread} tone={colors.verdigris} />}
            </View>
            {choice === "story" && <CanisterDrop drops={canisters} />}
          </Pressable>
          </Glow>
        ))}
      </View>
      {step && (
        <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
          <GuideCard
            step={step}
            content={content}
            onAcknowledge={() => setGuide({ ...guide, acknowledged: [...guide.acknowledged, step.id] })}
            onSkip={() => setGuide({ ...guide, skipped: true })}
          />
        </View>
      )}
      {error && <Text style={[ui.text, { color: colors.scald, paddingHorizontal: 16, paddingTop: 8 }]}>{error}</Text>}
      <View style={{ flex: 1, flexDirection: "row" }}>
        <View style={{ flex: 1 }}>
          {tab === "workshop" || (tab === "chat" && wide) ? (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12, flexDirection: wide ? "row" : "column", alignItems: "flex-start" }}>
              <View style={{ width: wide ? 240 : "100%" }}>{skills}</View>
              <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : "100%" }}>{centre}</View>
              <View style={{ width: wide ? 300 : "100%" }}>{stores}</View>
            </ScrollView>
          ) : tab === "chat" && !wide ? (
            <View style={{ flex: 1, padding: 16 }}>
              <Chat tinkerId={tinkerId} chat={chat} connected={connected} />
            </View>
          ) : tab === "story" ? (
            <ScrollView contentContainerStyle={{ padding: 16, alignItems: "center" }}>
              <Story key={storyKey} tinkerId={tinkerId} onOutcome={apply} />
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <Exchange content={content} tinker={tinker} name={name} run={run} />
            </ScrollView>
          )}
        </View>
        {wide && (
          <View style={{ width: 300, padding: 16, paddingLeft: 0 }}>
            <Chat tinkerId={tinkerId} chat={chat} connected={connected} />
          </View>
        )}
      </View>
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


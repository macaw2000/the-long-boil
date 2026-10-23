// The Workshop (GDD section 7, what the screen shows): skills on the left,
// the Tinker at work in the centre, the stores on the right, and the Boiler
// and Nerve gauges on the top bar, the four Needles beside the name. Narrow
// screens stack the three columns. Further tabs hold the Story and the Exchange.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { api, type Content, type Ledger as LedgerData, type Outcome, type QueueEntry, type Tinker, type TradeNote } from "./api";
import { Exchange } from "./Exchange";
import { Story } from "./Story";
import { duration, levelProgress, namer, seconds, titleCase, tradeLine } from "./format";
import { Ledger } from "./Ledger";
import { QueuePicker } from "./QueuePicker";
import { colors, ui } from "./theme";

const LOOK_EVERY_MS = 5_000;
const BOILER_MS = 12 * 3_600_000;

export function Workshop({ content, tinkerId, onLeave }: { content: Content; tinkerId: number; onLeave: () => void }) {
  const [tinker, setTinker] = useState<Tinker | null>(null);
  const [away, setAway] = useState<{ ledger: LedgerData; trades: TradeNote[] } | null>(null);
  const [tab, setTab] = useState<"workshop" | "story" | "exchange">("workshop");
  const [recent, setRecent] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const name = useMemo(() => namer(content), [content]);
  const wide = useWindowDimensions().width >= 900;

  const noteRecent = useCallback(
    (ledger: LedgerData, trades: TradeNote[]) => {
      const lines = ledger.lines.map((line) =>
        line.id.startsWith("monster.")
          ? `${line.count} × ${name(line.id)}${line.crowns ? `, ${line.crowns} Crowns` : ""}`
          : `${name(line.id)} × ${line.count}`,
      );
      const ups = ledger.levelUps.map((up) => `${titleCase(up.skill)} reached ${up.level}`);
      const fills = trades.map((note) => tradeLine(note, name));
      if (lines.length || ups.length || fills.length) setRecent((previous) => [...fills, ...ups, ...lines, ...previous].slice(0, 8));
    },
    [name],
  );

  const apply = useCallback((outcome: Outcome) => {
    setTinker(outcome.tinker);
    setError(null);
  }, []);

  // Opening the workshop is a check-in: it resolves the time away and refills the Boiler.
  useEffect(() => {
    api
      .checkIn(tinkerId)
      .then((outcome) => {
        apply(outcome);
        const { ledger, trades } = outcome;
        if (ledger.lines.length || ledger.stalls.length || ledger.boilerDryAt !== null || trades.length) {
          setAway({ ledger, trades });
        }
      })
      .catch((reason: Error) => setError(reason.message));
  }, [tinkerId, apply]);

  // While the workshop is open, look in every few seconds to watch work land.
  useEffect(() => {
    const look = setInterval(() => {
      api
        .look(tinkerId)
        .then((outcome) => {
          apply(outcome);
          noteRecent(outcome.ledger, outcome.trades);
        })
        .catch((reason: Error) => setError(reason.message));
    }, LOOK_EVERY_MS);
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => {
      clearInterval(look);
      clearInterval(tick);
    };
  }, [tinkerId, apply, noteRecent]);

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

  const skills = (
    <View style={ui.panel}>
      <Text style={ui.heading}>Skills</Text>
      {tinker.skills.length === 0 && <Text style={ui.muted}>Every skill at 1. Queue some work.</Text>}
      {tinker.skills.map((skill) => {
        const progress = levelProgress(content, skill.xp, skill.level);
        return (
          <View key={skill.skill} style={{ gap: 3 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={ui.text}>{titleCase(skill.skill)}</Text>
              <Text style={ui.number}>{skill.level}</Text>
            </View>
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
      {away && <Ledger ledger={away.ledger} trades={away.trades} name={name} onClose={() => setAway(null)} />}
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
                  <Bar fraction={Math.min(1, elapsed / (headSeconds * 1000))} color={colors.copper} />
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
          <Pressable style={[ui.button, { alignSelf: "flex-start" }]} onPress={() => setPicking(true)} accessibilityRole="button">
            <Text style={ui.buttonText}>Queue work</Text>
          </Pressable>
        )}
      </View>
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
      <View style={ui.panel}>
        <Text style={ui.heading}>Stores</Text>
        {tinker.inventory.length === 0 && <Text style={ui.muted}>Empty shelves.</Text>}
        {tinker.inventory.map((stack) => (
          <View key={`${stack.item}-${stack.bound}`} style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={ui.text}>
              {name(stack.item)}
              {stack.bound ? <Text style={ui.muted}> (bound)</Text> : null}
            </Text>
            <Text style={ui.number}>{stack.qty.toLocaleString()}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
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
        <View style={{ flex: 1, minWidth: 180, maxWidth: 320, gap: 3 }}>
          <Text style={ui.muted}>Boiler · {steamLeft > 0 ? `${duration(steamLeft)} of steam` : "dry"}</Text>
          <Bar fraction={Math.max(0, steamLeft) / BOILER_MS} color={colors.brass} />
        </View>
        <View style={{ minWidth: 140, maxWidth: 200, flex: 1, gap: 3 }}>
          <Text style={ui.muted}>
            Nerve · {tinker.story.nerve}/{tinker.story.nerveCap}
          </Text>
          <Bar fraction={tinker.story.nerve / tinker.story.nerveCap} color={colors.verdigris} />
        </View>
        <Text style={[ui.number, { color: colors.brass, fontSize: 15 }]}>{tinker.crowns.toLocaleString()} Crowns</Text>
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
      <View style={{ flexDirection: "row", gap: 4, paddingHorizontal: 16, paddingTop: 10 }}>
        {(["workshop", "story", "exchange"] as const).map((choice) => (
          <Pressable
            key={choice}
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
            <Text style={[ui.text, { color: tab === choice ? colors.brass : colors.muted }]}>
              {titleCase(choice)}
              {choice === "story" && tinker.story.letters > 0 ? ` (${tinker.story.letters})` : ""}
            </Text>
          </Pressable>
        ))}
      </View>
      {error && <Text style={[ui.text, { color: colors.scald, paddingHorizontal: 16, paddingTop: 8 }]}>{error}</Text>}
      {tab === "workshop" ? (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, flexDirection: wide ? "row" : "column", alignItems: "flex-start" }}>
          <View style={{ width: wide ? 240 : "100%" }}>{skills}</View>
          <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : "100%" }}>{centre}</View>
          <View style={{ width: wide ? 300 : "100%" }}>{stores}</View>
        </ScrollView>
      ) : tab === "story" ? (
        <ScrollView contentContainerStyle={{ padding: 16, alignItems: "center" }}>
          <Story tinkerId={tinkerId} onOutcome={apply} />
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Exchange content={content} tinker={tinker} name={name} run={run} />
        </ScrollView>
      )}
    </View>
  );
}

function Bar({ fraction, color }: { fraction: number; color: string }) {
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.soot, overflow: "hidden" }}>
      <View style={{ width: `${Math.round(Math.max(0, Math.min(1, fraction)) * 1000) / 10}%`, height: "100%", backgroundColor: color }} />
    </View>
  );
}


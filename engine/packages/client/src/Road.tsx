// The road on the Story tab (work order 038): how far along the story a
// player has come. A stop's name is earned, so the server sends none for a
// stop ahead, and the next stop shows only what it waits on. Attention goes to
// it only when there is a scene to play now.

import { Pressable, Text, View } from "react-native";
import type { RoadView, StoryView } from "./api";
import { titleCase } from "./format";
import { GOLD, GoalMeter } from "./Guide";
import { Sparks } from "./Juice";
import type { Place } from "./SideNav";
import { GlossedText } from "./Term";
import { colors, ui } from "./theme";

const isVisit = (name: string) => name === "record.check_ins" || name === "record.visits_since_prologue";

function Mark({ reached, next, gate }: { reached: boolean; next: boolean; gate: boolean }) {
  const size = gate ? 16 : 14;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: gate ? 3 : size / 2,
        borderWidth: 2,
        borderColor: reached ? colors.brass : next ? GOLD : colors.panelEdge,
        backgroundColor: reached ? colors.brass : colors.soot,
        transform: gate ? [{ rotate: "45deg" }] : [],
      }}
    />
  );
}

export function Road({
  road,
  arrived,
  arrivals,
  nextNerveAt,
  visitLine,
  onGo,
}: {
  road: RoadView;
  /** The stop just reached, in this look at the tab. */
  arrived: string | null;
  arrivals: number;
  nextNerveAt: StoryView["nextNerveAt"];
  /** The line for a next scene waiting on visits, from the Story tab, which words them. */
  visitLine: (needs: [string, string, number][]) => string;
  /** To the skill the next scene waits on. */
  onGo: (place: Place) => void;
}) {
  const nextIndex = road.stops.findIndex((stop) => !stop.reached);
  const next = road.next;
  const ready = next?.state === "open";
  const needs = next?.state === "waiting" ? next.needs : [];
  const skills = needs.filter(([name]) => !name.includes("."));
  const visits = needs.filter(([name]) => isVisit(name));
  const others = needs.filter(([name]) => name.includes(".") && !isVisit(name));
  return (
    <Sparks bursts={arrivals}>
      <View style={[ui.panel, { gap: 10 }]}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <Text style={[ui.heading, { fontSize: 15 }]}>{road.title}</Text>
          {road.goal && <GlossedText text={road.goal} style={ui.muted} />}
        </View>
        <View accessibilityLabel={`${road.stops.filter((stop) => stop.reached).length} of ${road.stops.length} stops reached`}>
          <View style={{ position: "absolute", top: 7, left: `${50 / road.stops.length}%`, right: `${50 / road.stops.length}%`, height: 2, backgroundColor: colors.panelEdge }} />
          <View style={{ flexDirection: "row" }}>
            {road.stops.map((stop, index) => (
              <View key={index} style={{ flex: 1, alignItems: "center", gap: 6 }}>
                <View style={{ height: 16, justifyContent: "center" }}>
                  <Mark reached={stop.reached} next={index === nextIndex && next?.state === "open" && next.reaches} gate={Boolean(road.goal) && index === road.stops.length - 1} />
                </View>
                <Text style={[ui.muted, { fontSize: 11, textAlign: "center", paddingHorizontal: 2 }]}>{stop.label ?? " "}</Text>
              </View>
            ))}
          </View>
        </View>
        {arrived && <Text style={[ui.text, { color: GOLD }]}>You reached: {arrived}</Text>}
        {ready && <Text style={[ui.text, { color: GOLD }]}>▶ The next scene is open. Play it below.</Text>}
        {next?.state === "nerve" && (
          <Text style={ui.muted}>
            The next scene is open.
            {nextNerveAt ? ` You have the Nerve for it from ${new Date(nextNerveAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.` : ""}
          </Text>
        )}
        {skills.map(([name, condition, value]) => (
          <View key={name} style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <Text style={[ui.muted, { flex: 1 }]}>The next scene waits on your {titleCase(name.replace(/_/g, " "))}.</Text>
              <Pressable onPress={() => onGo(`skill:${name}`)} accessibilityRole="button" style={[ui.button, { paddingHorizontal: 12, paddingVertical: 4 }]}>
                <Text style={ui.buttonText}>Go</Text>
              </Pressable>
            </View>
            <GoalMeter label={titleCase(name.replace(/_/g, " "))} have={value} need={Number(condition.replace(/[^0-9]/g, ""))} unit="" />
          </View>
        ))}
        {visits.length > 0 && <Text style={ui.muted}>{visitLine(visits)}</Text>}
        {others.length > 0 && next?.state === "waiting" && next.hint && <GlossedText text={next.hint} style={ui.muted} />}
      </View>
    </Sparks>
  );
}

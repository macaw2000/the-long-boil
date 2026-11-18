// The leaderboards (GDD section 6, Leaderboards): total level, each of the
// sixteen skills, net worth, and guilds. There is no story board, by design.
// A place in the workshop like the Guild's, opened from the side list, or from
// the Guild tab on a phone. It opens with the rest of the city, after the
// Prologue, so the first session has nothing more to learn.

import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { api, type LeaderboardRow, type LeaderboardView } from "./api";
import { titleCase } from "./format";
import { colors, ui } from "./theme";

const FIRST_BOARDS = ["total", "net_worth", "guilds"];

function boardName(board: string): string {
  if (board === "total") return "Total level";
  if (board === "net_worth") return "Net worth";
  if (board === "guilds") return "Guilds";
  return titleCase(board.replace(/_/g, " "));
}

function noteOf(board: string): string {
  if (board === "total") return "Every skill's level added together. A tie goes to the Tinker with more XP.";
  if (board === "net_worth") return "Crowns held and Crowns in open buy orders, plus goods at the collectors' price. Gilded Cogs do not count.";
  if (board === "guilds") return "Formed guilds, by their members' total levels added together.";
  return "Ranked by XP in this skill.";
}

function valueText(board: string, row: LeaderboardRow): string {
  if (board === "net_worth") return `${row.value.toLocaleString()} Crowns`;
  if (board === "total" || board === "guilds") return `Total ${row.value.toLocaleString()}`;
  return `Level ${row.value}`;
}

function detailText(board: string, row: LeaderboardRow): string | null {
  if (row.detail === null) return null;
  if (board === "guilds") return row.detail === 1 ? "1 member" : `${row.detail} members`;
  return `${Math.floor(row.detail).toLocaleString()} XP`;
}

function Row({ board, row, onInspect }: { board: string; row: LeaderboardRow; onInspect: (other: number) => void }) {
  const detail = detailText(board, row);
  // A Tinker's row opens their inspect card; the guild board's rows are guilds.
  return (
    <Pressable
      onPress={board === "guilds" ? undefined : () => onInspect(row.id)}
      accessibilityRole={board === "guilds" ? undefined : "button"}
      style={{ flexDirection: "row", alignItems: "baseline", gap: 10, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.panelEdge }}
    >
      <Text style={[ui.number, { width: 40, textAlign: "right" }]}>{row.rank}</Text>
      <Text numberOfLines={1} style={[ui.text, { flex: 1, fontWeight: "700", color: row.you ? colors.brass : colors.ink }]}>
        {row.name}
        {row.you ? (board === "guilds" ? " (your guild)" : " (you)") : ""}
      </Text>
      <Text style={ui.number}>{valueText(board, row)}</Text>
      {detail !== null && <Text style={[ui.muted, { fontSize: 12, width: 120, textAlign: "right" }]}>{detail}</Text>}
    </Pressable>
  );
}

export function Leaderboards({ tinkerId, onInspect }: { tinkerId: number; onInspect: (other: number) => void }) {
  const [board, setBoard] = useState("total");
  const [view, setView] = useState<LeaderboardView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api
      .leaderboard(tinkerId, board)
      .then((next) => {
        if (!live) return;
        setView(next);
        setError(null);
      })
      .catch((reason: Error) => live && setError(reason.message));
    return () => {
      live = false;
    };
  }, [tinkerId, board]);

  const boards = view?.boards ?? FIRST_BOARDS;
  const shown = view?.board === board ? view : null;
  const youBelow = shown?.you && !shown.rows.some((row) => row.you) ? shown.you : null;

  return (
    <View style={{ gap: 12, width: "100%", maxWidth: 720 }}>
      <View>
        <Text style={[ui.heading, { fontSize: 22 }]}>Leaderboards</Text>
      </View>
      <Find tinkerId={tinkerId} onInspect={onInspect} />

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {boards.map((choice) => {
            const active = choice === board;
            return (
              <Pressable
                key={choice}
                onPress={() => setBoard(choice)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={{
                  borderWidth: 1,
                  borderColor: active ? colors.brass : colors.panelEdge,
                  backgroundColor: active ? "rgba(201, 162, 90, 0.12)" : colors.panel,
                  borderRadius: 4,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                }}
              >
                <Text style={[ui.muted, { fontSize: 13, color: active ? colors.brass : colors.ink }]}>{boardName(choice)}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={[ui.panel, { gap: 6 }]}>
          <Text style={ui.heading}>{boardName(board)}</Text>
          <Text style={ui.muted}>{noteOf(board)} Each Tinker counts as of their last visit.</Text>
          {error && <Text style={[ui.muted, { color: colors.scald }]}>{error}</Text>}
          {!shown && !error && <Text style={ui.muted}>Tallying the boards…</Text>}
          {shown && shown.rows.length === 0 && (
            <Text style={ui.muted}>{board === "guilds" ? "No guild has formed yet." : "Nobody has trained this yet."}</Text>
          )}
          {shown?.rows.map((row) => <Row key={row.id} board={board} row={row} onInspect={onInspect} />)}
          {youBelow && (
            <>
              <Text style={[ui.muted, { textAlign: "center" }]}>…</Text>
              <Row board={board} row={youBelow} onInspect={onInspect} />
            </>
          )}
        </View>
    </View>
  );
}

/** Looking a Tinker up by name, to see their profile (work order 042). */
function Find({ tinkerId, onInspect }: { tinkerId: number; onInspect: (other: number) => void }) {
  const [name, setName] = useState("");
  const [found, setFound] = useState<{ id: number; name: string; totalLevel: number }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wanted = name.trim();

  // Ask a moment after the typing stops, and only for the name as it now stands.
  useEffect(() => {
    if (wanted.length < 2) {
      setFound(null);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      api
        .find(tinkerId, wanted)
        .then((result) => {
          if (!live) return;
          setFound(result.found);
          setError(null);
        })
        .catch((reason: Error) => live && setError(reason.message));
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [tinkerId, wanted]);

  return (
    <View style={[ui.panel, { gap: 6 }]}>
      <Text style={ui.muted}>Look a Tinker up by name to see how they look, what they wear and what they have trained.</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="A Tinker's name"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={40}
        accessibilityLabel="Find a Tinker by name"
        style={ui.input}
      />
      {error && <Text style={[ui.muted, { color: colors.scald }]}>{error}</Text>}
      {found && found.length === 0 && <Text style={ui.muted}>No Tinker's name starts with that.</Text>}
      {found?.map((tinker) => (
        <Pressable
          key={tinker.id}
          onPress={() => onInspect(tinker.id)}
          accessibilityRole="button"
          accessibilityLabel={`Inspect ${tinker.name}`}
          style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, paddingVertical: 4 }}
        >
          <Text style={[ui.text, { color: colors.copper, fontWeight: "700" }]}>{tinker.name}</Text>
          <Text style={ui.number}>Total {tinker.totalLevel}</Text>
        </Pressable>
      ))}
    </View>
  );
}

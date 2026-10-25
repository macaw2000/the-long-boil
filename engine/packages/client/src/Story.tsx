// The Story tab (GDD section 7, what the screen shows): letters from the
// Pneumatic Post first, then the storylets open to this Tinker. A storylet
// is a card: the description and up to four options, each showing its
// Nerve cost and, for a challenge, its odds before the player commits.
// Hester's Ledger closes the tab: the pages found, each readable once held.

import { useCallback, useEffect, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { api, type LedgerPage, type Outcome, type SceneView, type StoryOutcome, type StoryView } from "./api";
import { titleCase } from "./format";
import { OddsDial } from "./Juice";
import { vignetteSource } from "./Sprite";
import type { GlossaryTerm } from "./glossary";
import { Term } from "./Term";
import { colors, ui } from "./theme";

const REFRESH_MS = 10_000;

function qualityName(name: string): string {
  const last = name.split(".").pop() ?? name;
  if (name.endsWith(".progress")) return `${titleCase(name.split(".")[0] ?? name)} progress`;
  return titleCase(last.replace(/_/g, " "));
}

/** A locked beat's gate in player terms: a skill level, an item count, or more visits. */
function needText(name: string, condition: string, value: number): string {
  const target = Number(condition.replace(/[^0-9]/g, ""));
  if (name === "record.check_ins") return target - value === 1 ? "another visit" : `${target - value} more visits`;
  if (name.startsWith("item.")) return `${qualityName(name)} in hand`;
  return `${titleCase(name.replace(/_/g, " "))} ${target} (you have ${value})`;
}

export function Story({ tinkerId, onOutcome }: { tinkerId: number; onOutcome: (outcome: Outcome) => void }) {
  const [view, setView] = useState<StoryView | null>(null);
  const [pages, setPages] = useState<LedgerPage[]>([]);
  const [played, setPlayed] = useState<StoryOutcome["played"]>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const take = useCallback(
    (result: StoryOutcome) => {
      setView(result.view);
      onOutcome(result);
      setError(null);
      return result;
    },
    [onOutcome],
  );

  const refresh = useCallback(() => {
    // Pages arrive from fights on the Workshop tab, so they are looked for with the story.
    api.pages(tinkerId).then((result) => setPages(result.pages), () => undefined);
    return api.story(tinkerId).then(take).catch((reason: Error) => setError(reason.message));
  }, [tinkerId, take]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const act = (call: Promise<StoryOutcome>) => {
    setBusy(true);
    return call
      .then((result) => {
        take(result);
        if (result.played) setPlayed(result.played);
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setBusy(false));
  };

  if (!view) return <Text style={ui.muted}>{error ?? "Sorting the post…"}</Text>;

  const progress = Object.entries(view.qualities).filter(([name]) => !name.startsWith("needle."));

  return (
    <View style={{ gap: 12, maxWidth: 720, width: "100%" }}>
      {error && <Text style={[ui.text, { color: colors.scald }]}>{error}</Text>}
      {played && (
        <View style={[ui.panel, { borderColor: played.success ? colors.verdigris : colors.scald }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={[ui.heading, { color: played.success ? colors.verdigris : colors.scald }]}>
              {played.odds === null ? "Done" : played.success ? "Success" : "Failure"}
              {played.odds !== null ? ` · ${Math.round(played.odds * 100)}% odds` : ""}
            </Text>
            <Pressable onPress={() => setPlayed(null)} accessibilityRole="button">
              <Text style={ui.muted}>Put it aside</Text>
            </Pressable>
          </View>
          {played.odds !== null && played.roll !== null && (
            <View style={{ alignItems: "center" }}>
              <OddsDial odds={played.odds} roll={played.roll} success={played.success} />
            </View>
          )}
          <Text style={[ui.text, { lineHeight: 21 }]}>{played.text}</Text>
        </View>
      )}

      <View style={[ui.panel, { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 16, zIndex: 10 }]}>
        <Term term="nerve">
          <Text style={ui.text}>
            Nerve {view.nerve}/{view.nerveCap}
            {view.nextNerveAt ? <Text style={ui.muted}> · next at {new Date(view.nextNerveAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text> : null}
          </Text>
        </Term>
        <Term term="needles">
          <Text style={ui.muted}>Needles:</Text>
        </Term>
        {Object.entries(view.needles).map(([needle, value]) => (
          <Term key={needle} term={needle as GlossaryTerm}>
            <Text style={[ui.text, { color: value >= 8 ? colors.scald : value > 0 ? colors.copper : colors.muted }]}>
              {qualityName(needle)} {value}/8
            </Text>
          </Term>
        ))}
      </View>

      {view.inInfirmary && (
        <View style={[ui.panel, { borderColor: colors.scald }]}>
          <Text style={[ui.heading, { color: colors.scald }]}>At the Infirmary of St. Pinion</Text>
          <Text style={ui.muted}>
            Scald redlined. Until you are discharged, the story waits here and Scald will not ease on its own. Your workshop carries on.
          </Text>
        </View>
      )}
      {view.debts.map((debt) => (
        <Text key={debt.id} style={ui.muted}>
          {debt.label}: {debt.crowns} Crowns, payable at the Counting-House window on the Exchange tab.
        </Text>
      ))}

      {view.letters.length > 0 && <Text style={ui.heading}>The Pneumatic Post</Text>}
      {view.letters.map((letter) => (
        <Card
          key={letter.id}
          scene={letter}
          nerve={view.nerve}
          busy={busy}
          onPlay={(option) => act(api.play(tinkerId, "letter", letter.id, option))}
          onDiscard={() => act(api.discard(tinkerId, letter.id))}
        />
      ))}

      <Text style={ui.heading}>Open to you</Text>
      {view.storylets.length === 0 && (
        <Text style={ui.muted}>Nothing waits for you just now. Work the bench, and come back when the city has moved.</Text>
      )}
      {view.storylets.map((scene) => (
        <Card key={scene.id} scene={scene} nerve={view.nerve} busy={busy} onPlay={(option) => act(api.play(tinkerId, "storylet", scene.id, option))} />
      ))}

      <HestersLedger pages={pages} />

      {(view.upcoming.length > 0 || view.cooling.length > 0) && (
        <View style={ui.panel}>
          <Text style={[ui.heading, { fontSize: 15 }]}>Coming up</Text>
          {view.cooling.map((scene) => (
            <Text key={scene.id} style={ui.muted}>
              {titleCase(scene.location.replace(/_/g, " "))} again from{" "}
              {new Date(scene.opensAt).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}.
            </Text>
          ))}
          {view.upcoming.map((scene) => (
            <Text key={scene.id} style={ui.muted}>
              Something waits in {titleCase(scene.location.replace(/_/g, " "))}: needs{" "}
              {scene.needs.map(([name, condition, value]) => needText(name, condition, value)).join(", ")}.
            </Text>
          ))}
        </View>
      )}

      {progress.length > 0 && (
        <View style={ui.panel}>
          <Text style={[ui.heading, { fontSize: 15 }]}>Your record</Text>
          <Text style={ui.muted}>{progress.map(([name, value]) => `${qualityName(name)} ${value}`).join(" · ")}</Text>
        </View>
      )}
    </View>
  );
}

function Card({
  scene,
  nerve,
  busy,
  onPlay,
  onDiscard,
}: {
  scene: SceneView;
  nerve: number;
  busy: boolean;
  onPlay: (option: number) => void;
  onDiscard?: () => void;
}) {
  const affordable = nerve >= scene.nerve;
  return (
    <View style={ui.panel}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        {/* The 96x96 vignette of the scene's place (GDD section 7); a brass plate with its name where none is drawn. */}
        {vignetteSource(scene.location) !== undefined ? (
          <Image
            source={vignetteSource(scene.location)!}
            style={{ width: 96, height: 96, borderRadius: 4, borderWidth: 1, borderColor: colors.brassDim }}
            accessibilityLabel={titleCase(scene.location.replace(/_/g, " "))}
          />
        ) : (
          <View
            style={{ width: 96, height: 96, borderRadius: 4, backgroundColor: colors.soot, borderWidth: 1, borderColor: colors.brassDim, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={[ui.muted, { fontSize: 11, textAlign: "center" }]}>{titleCase(scene.location.replace(/_/g, " "))}</Text>
          </View>
        )}
        <View style={{ flex: 1, gap: 6 }}>
          {scene.sender && <Text style={[ui.muted, { color: colors.brass }]}>From {scene.sender}</Text>}
          <Text style={[ui.text, { lineHeight: 21 }]}>{scene.description}</Text>
        </View>
      </View>
      {scene.options.map((option, index) => {
        const enabled = option.available && affordable && !busy;
        return (
          <Pressable
            key={index}
            disabled={!enabled}
            onPress={() => onPlay(index)}
            accessibilityRole="button"
            style={{ borderWidth: 1, borderColor: enabled ? colors.brassDim : colors.panelEdge, borderRadius: 4, padding: 10, gap: 3, opacity: enabled ? 1 : 0.5 }}
          >
            <Text style={ui.text}>{option.label}</Text>
            <Text style={ui.muted}>
              {scene.nerve} Nerve
              {option.challenge
                ? ` · ${titleCase(option.challenge.quality)} ${option.challenge.level} against ${option.challenge.difficulty}: ${Math.round(option.challenge.odds * 100)}%`
                : " · certain"}
              {!option.available ? ` · needs ${option.locked.map(([name, condition]) => `${qualityName(name)} ${condition}`).join(", ")}` : ""}
              {option.available && !affordable ? " · not enough Nerve" : ""}
            </Text>
          </Pressable>
        );
      })}
      {onDiscard && (
        <Pressable onPress={onDiscard} disabled={busy} accessibilityRole="button" style={{ alignSelf: "flex-end" }}>
          <Text style={ui.muted}>Discard (free)</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Hester Vane's notebook, a page at a time: found pages open to their text; the rest are only counted. */
function HestersLedger({ pages }: { pages: LedgerPage[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (pages.length === 0) return null;
  const found = pages.filter((page) => page.held);
  return (
    <View style={{ gap: 8 }}>
      <Text style={ui.heading}>Hester's Ledger</Text>
      <Text style={ui.muted}>
        {found.length === 0
          ? "Not a page of it yet. Hester's notebook came apart somewhere in the city."
          : `${found.length} of ${pages.length} pages found.`}
      </Text>
      {found.map((page) => {
        const shown = open === page.item;
        return (
          <Pressable
            key={page.item}
            onPress={() => setOpen(shown ? null : page.item)}
            accessibilityRole="button"
            accessibilityState={{ expanded: shown }}
            style={[ui.panel, { gap: 6 }]}
          >
            <Text style={[ui.text, { color: colors.brass }]}>{page.title ?? page.name}</Text>
            {shown &&
              (page.text ? (
                <Text style={[ui.text, { lineHeight: 21, fontStyle: "italic" }]}>{page.text}</Text>
              ) : (
                <Text style={ui.muted}>Hester's hand, too cramped to make out yet. (Not yet transcribed.)</Text>
              ))}
          </Pressable>
        );
      })}
    </View>
  );
}

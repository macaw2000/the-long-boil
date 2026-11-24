// The wardrobe (work order 042): the Tinker's body, outfit and backdrop. The
// bodies are free picks. An outfit or backdrop is free, bought with Cogs, or
// bought with Guild Tokens, or opened by a faction's Favour, and each tile says which and what it would
// take. Looks change the picture and nothing else. It sits on the Cog Shop's
// page, and opens over the screen from the Loadout's "Change look".

import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Image, Pressable, Text, View } from "react-native";
import { api, type Content, type Look, type LookOffer, type Outcome, type Tinker, type WardrobeOutcome, type WardrobeView, type Wearing } from "./api";
import { Portrait } from "./Loadout";
import { backdropUrl, drawnBodies } from "./looks";
import { UiIcon } from "./Sprite";
import { colors, ui } from "./theme";
import { faction } from "./WorkOrders";

const TILE = 136;
const PICTURE = 96;

export function Wardrobe({ content, tinker, onOutcome }: { content: Content; tinker: Tinker; onOutcome: (outcome: Outcome) => void }) {
  const looks = content.looks;
  const [wardrobe, setWardrobe] = useState<WardrobeView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const still = useRef(new Animated.Value(0)).current;

  const take = useCallback(
    (call: Promise<WardrobeOutcome>) => {
      setBusy(true);
      return call
        .then((outcome) => {
          setWardrobe(outcome.wardrobe);
          setError(null);
          onOutcome(outcome);
        })
        .catch((reason: Error) => setError(reason.message))
        .finally(() => setBusy(false));
    },
    [onOutcome],
  );

  // Look again when Cogs or Favour change elsewhere: a crate opened, a Work Order turned in.
  const favour = Object.entries(tinker.story.qualities)
    .filter(([name]) => name.startsWith("favour."))
    .map(([name, value]) => `${name}${value}`)
    .join();
  useEffect(() => {
    take(api.wardrobe(tinker.id));
  }, [take, tinker.id, tinker.cogs, favour]);

  if (!looks) return null;
  if (!wardrobe) return <Text style={error ? [ui.text, { color: colors.scald }] : ui.muted}>{error ?? "Opening the wardrobe…"}</Text>;

  const wearing = tinker.look;
  const bodies = drawnBodies(looks);
  const picture = (look: Partial<Wearing>) => (
    <Portrait weapon={null} flash={still} size={PICTURE} looks={looks} look={{ ...wearing, backdrop: null, ...look }} />
  );

  const tile = (slot: "outfit" | "backdrop", look: Look | null, offer: LookOffer | null, plain: { name: string; description: string }, shown: React.ReactNode) => {
    const id = look?.id ?? null;
    const on = wearing[slot] === id;
    const held = offer?.held ?? true;
    const short = offer?.favour && !held ? `${faction(offer.favour.quality)} Favour ${offer.favour.level}; yours is ${offer.favour.have}` : null;
    return (
      <View
        key={id ?? "plain"}
        style={{
          width: TILE,
          alignItems: "center",
          gap: 4,
          padding: 8,
          borderRadius: 8,
          borderWidth: on ? 2 : 1,
          borderColor: on ? colors.brass : colors.panelEdge,
          backgroundColor: "rgba(20, 16, 12, 0.6)",
        }}
      >
        {shown}
        <Text numberOfLines={1} style={[ui.text, { fontSize: 13, color: colors.brass }]}>
          {look?.name ?? plain.name}
        </Text>
        <Text style={[ui.muted, { fontSize: 11, textAlign: "center", flexGrow: 1 }]}>{look?.description ?? plain.description}</Text>
        {on ? (
          <Text style={[ui.muted, { fontSize: 12, color: colors.verdigris }]}>Wearing</Text>
        ) : held ? (
          <Button label="Wear" disabled={busy} onPress={() => take(api.wearLook(tinker.id, { [slot]: id }))} />
        ) : offer?.cogs != null ? (
          <Button label={`Buy · ${offer.cogs} Cogs`} disabled={busy || wardrobe.cogs < offer.cogs} onPress={() => take(api.buyLook(tinker.id, offer.id))} />
        ) : offer?.tokens != null ? (
          <Button label={`${offer.tokens} Tokens`} disabled={busy || wardrobe.tokens < offer.tokens} onPress={() => take(api.buyLook(tinker.id, offer.id))} />
        ) : (
          <Text style={[ui.muted, { fontSize: 11, textAlign: "center" }]}>{short}</Text>
        )}
      </View>
    );
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <Text style={ui.heading}>Looks</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <UiIcon name="cogs" size={20} />
          <Text style={[ui.number, { color: colors.brass }]}>{wardrobe.cogs.toLocaleString()} Cogs</Text>
          <UiIcon name="guild" size={20} />
          <Text style={[ui.number, { color: colors.brass }]}>{wardrobe.tokens.toLocaleString()} Guild {wardrobe.tokens === 1 ? "Token" : "Tokens"}</Text>
        </View>
      </View>
      <Text style={ui.muted}>How other Tinkers see you when they look you up. Looks change the picture and nothing else.</Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: 16 }}>
        <View style={{ gap: 6 }}>
          <Text style={[ui.muted, { fontSize: 11 }]}>As you are seen</Text>
          <View style={{ borderRadius: 8, backgroundColor: "#211b15" }}>
            <Portrait weapon={tinker.weapon} flash={still} size={144} looks={looks} look={wearing} />
          </View>
        </View>
        {bodies.length > 1 && (
          <View style={{ gap: 6 }}>
            <Text style={[ui.muted, { fontSize: 11 }]}>Your Tinker · free to change</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {bodies.map((body, index) => {
                const on = wearing.body === body.id;
                return (
                  <Pressable
                    key={body.id}
                    onPress={() => take(api.wearLook(tinker.id, { body: body.id }))}
                    disabled={busy || on}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`Tinker ${index + 1}`}
                    style={{ borderRadius: 8, borderWidth: on ? 2 : 1, borderColor: on ? colors.brass : colors.panelEdge, backgroundColor: "rgba(20, 16, 12, 0.6)" }}
                  >
                    {picture({ body: body.id })}
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </View>

      <View style={{ gap: 6 }}>
        <Text style={[ui.muted, { fontSize: 11 }]}>Outfits</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {tile("outfit", null, null, { name: "Work Leathers", description: "The apron you were handed with the keys. Brown, mostly." }, picture({ outfit: null }))}
          {looks.outfits.map((outfit) =>
            tile("outfit", outfit, wardrobe.outfits.find((offer) => offer.id === outfit.id) ?? null, { name: "", description: "" }, picture({ outfit: outfit.id })),
          )}
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <Text style={[ui.muted, { fontSize: 11 }]}>Backdrops</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {tile(
            "backdrop",
            null,
            null,
            { name: "Plain Wall", description: "Nothing behind you. Some people prefer it." },
            <View style={{ width: PICTURE, height: PICTURE, borderRadius: 8, borderWidth: 1, borderColor: colors.panelEdge, backgroundColor: "#211b15" }} />,
          )}
          {looks.backdrops.map((backdrop) =>
            tile(
              "backdrop",
              backdrop,
              wardrobe.backdrops.find((offer) => offer.id === backdrop.id) ?? null,
              { name: "", description: "" },
              <Image
                source={{ uri: backdropUrl(looks, backdrop.id)! }}
                resizeMode="cover"
                style={{ width: PICTURE, height: PICTURE, borderRadius: 8, borderWidth: 1, borderColor: colors.panelEdge }}
                accessibilityIgnoresInvertColors
              />,
            ),
          )}
        </View>
      </View>
      {error && <Text style={[ui.text, { color: colors.scald }]}>{error}</Text>}
    </View>
  );
}

/** The first visit's pick (and any visit until it is made): which Tinker are you? One tap, and free to change after. */
export function BodyPick({ content, tinker, onOutcome }: { content: Content; tinker: Tinker; onOutcome: (outcome: Outcome) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const still = useRef(new Animated.Value(0)).current;
  const bodies = drawnBodies(content.looks);
  const pick = (body: string) => {
    setBusy(true);
    api
      .wearLook(tinker.id, { body })
      .then(onOutcome)
      .catch((reason: Error) => {
        setError(reason.message);
        setBusy(false);
      });
  };
  return (
    <View
      style={{ position: "absolute", inset: 0, backgroundColor: "rgba(10,8,6,0.82)", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 }}
      accessibilityViewIsModal
    >
      <View style={[ui.panel, { maxWidth: "100%", gap: 12, alignItems: "center" }]}>
        <Text style={[ui.heading, { fontSize: 22 }]}>Which Tinker are you?</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
          {bodies.map((body, index) => (
            <Pressable
              key={body.id}
              onPress={() => pick(body.id)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`Tinker ${index + 1}`}
              style={{ borderRadius: 8, borderWidth: 2, borderColor: colors.brass, backgroundColor: "#211b15", opacity: busy ? 0.6 : 1 }}
            >
              <Portrait weapon={null} flash={still} size={160} looks={content.looks} look={{ body: body.id, outfit: null, backdrop: null }} />
            </Pressable>
          ))}
        </View>
        <Text style={ui.muted}>You can change this any time, for nothing, from your Loadout.</Text>
        {error && <Text style={[ui.muted, { color: colors.scald }]}>{error}</Text>}
      </View>
    </View>
  );
}

function Button({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={[ui.button, { paddingVertical: 4, paddingHorizontal: 10 }, disabled && { opacity: 0.45 }]}
    >
      <Text style={[ui.buttonText, { fontSize: 12 }]}>{label}</Text>
    </Pressable>
  );
}

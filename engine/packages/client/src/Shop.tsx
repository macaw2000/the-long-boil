// The Cog Shop (GDD section 8): Cog Crates to open, crates still locked, and
// the four time savers Cogs buy. Nothing here buys story, Nerve or power;
// the page says so, because the promise is the point.

import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api, type Outcome, type Purchase, type ShopOutcome, type ShopView, type Tinker } from "./api";
import { duration } from "./format";
import { ItemIcon } from "./Sprite";
import { colors, ui } from "./theme";

export function Shop({ tinker, now, onOutcome }: { tinker: Tinker; now: number; onOutcome: (outcome: Outcome) => void }) {
  const tinkerId = tinker.id;
  const [shop, setShop] = useState<ShopView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const take = useCallback(
    (call: Promise<ShopOutcome>) => {
      setBusy(true);
      return call
        .then((outcome) => {
          setShop(outcome.shop);
          setError(null);
          onOutcome(outcome);
        })
        .catch((reason: Error) => setError(reason.message))
        .finally(() => setBusy(false));
    },
    [onOutcome],
  );

  // Look again whenever crates, Cogs or upgrades change elsewhere: a dev grant, an Exchange fill, a crate unlocking.
  const crates = tinker.inventory.filter((stack) => stack.item === shop?.crate.item).reduce((sum, stack) => sum + stack.qty, 0);
  const changed = `${tinker.cogs}:${crates}:${tinker.upgrades.queueSlots}:${tinker.upgrades.boilerHours}:${tinker.upgrades.boostUntil}:${tinker.story.nerveCap}`;
  useEffect(() => {
    take(api.shop(tinkerId));
  }, [take, tinkerId, changed]);

  if (!shop) return <Text style={error ? [ui.text, { color: colors.scald }] : ui.muted}>{error ?? "Opening the shop…"}</Text>;

  const { terms, upgrades } = shop;
  const boostLeft = upgrades.boostUntil ? new Date(upgrades.boostUntil).getTime() - now : 0;
  const cards: { id: Purchase; title: string; does: string; state: string }[] = [
    {
      id: "queue_slot",
      title: "Extra queue slot",
      does: `Queue ${terms.queueSlot.slots} jobs instead of 2, so the bench runs longer between visits.`,
      state: `${upgrades.queueSlots} of ${terms.queueSlot.slots} slots`,
    },
    {
      id: "boiler_upgrade",
      title: "Boiler upgrade",
      does: `${terms.boilerUpgrade.hours} more hours of steam, up to ${terms.boilerUpgrade.maxHours}, for players who sleep or work long shifts.`,
      state: `${upgrades.boilerHours} hours now`,
    },
    {
      id: "night_lamp",
      title: "Night Lamp",
      does: `Raises the Nerve cap to ${terms.nightLamp.nerveCap}, so twice-a-day players keep pace. It buys no Nerve.`,
      state: `Nerve cap ${upgrades.nerveCap}`,
    },
    {
      id: "boiler_boost",
      title: "Boiler Boost",
      does: `Work runs ${terms.boost.percent}% faster for ${terms.boost.hours} hours. Another adds ${terms.boost.hours} more.`,
      state: boostLeft > 0 ? `Burning for ${duration(boostLeft)}` : "Not burning",
    },
  ];

  return (
    <View style={{ gap: 12 }}>
      <View style={[ui.panel, { gap: 10 }]}>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <Text style={ui.heading}>Cog Shop</Text>
          <Text style={[ui.number, { fontSize: 16, color: colors.brass }]}>{shop.cogs.toLocaleString()} Cogs</Text>
        </View>
        <Text style={ui.muted}>Gilded Cogs buy time savers. They never buy Nerve, story, Favour or gear with stats.</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <ItemIcon item={shop.crate.item} size={40} />
          <View style={{ flex: 1, minWidth: 180, gap: 2 }}>
            <Text style={ui.text}>
              {shop.crates.toLocaleString()} Cog {shop.crates === 1 ? "Crate" : "Crates"} · {shop.crate.cogs} Cogs each
            </Text>
            <Text style={[ui.muted, { fontSize: 12 }]}>
              Crates trade on the Exchange for Crowns ({Math.round(shop.crate.exchangeTax * 100)}% tax), so anyone can earn Cogs by playing.
            </Text>
          </View>
          <Button label="Open one" disabled={busy || shop.crates < 1} onPress={() => take(api.openCrates(tinkerId, 1))} />
          {shop.crates > 1 && <Button label="Open all" disabled={busy} onPress={() => take(api.openCrates(tinkerId, shop.crates))} />}
        </View>
        {shop.arriving.map((delivery, index) => (
          <Text key={index} style={[ui.muted, { fontSize: 12 }]}>
            {delivery.qty} {delivery.qty === 1 ? "crate" : "crates"} unlock in {duration(Math.max(0, new Date(delivery.unlocksAt).getTime() - now))}. A bought crate is held{" "}
            {shop.crate.lockHours} hours before it can be opened or sold.
          </Text>
        ))}
        <Text style={[ui.muted, { fontSize: 12 }]}>Buying crates for ${(shop.crate.priceCents / 100).toFixed(2)} opens soon.</Text>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {cards.map((card) => {
          const price = shop.offers.find((offer) => offer.id === card.id)?.cogs ?? null;
          return (
            <View key={card.id} style={[ui.panel, { flexBasis: 300, flexGrow: 1, gap: 6 }]}>
              <Text style={[ui.text, { fontSize: 15, color: colors.brass }]}>{card.title}</Text>
              <Text style={ui.muted}>{card.does}</Text>
              <Text style={[ui.number, { fontSize: 12 }]}>{card.state}</Text>
              {price === null ? (
                <Text style={[ui.muted, { color: colors.verdigris }]}>Bought in full</Text>
              ) : (
                <Button
                  label={`Buy · ${price} Cogs`}
                  disabled={busy || shop.cogs < price}
                  onPress={() => take(api.buy(tinkerId, card.id))}
                />
              )}
            </View>
          );
        })}
      </View>
      {error && <Text style={[ui.text, { color: colors.scald }]}>{error}</Text>}
    </View>
  );
}

function Button({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }} style={[ui.button, disabled && { opacity: 0.45 }]}>
      <Text style={ui.buttonText}>{label}</Text>
    </Pressable>
  );
}

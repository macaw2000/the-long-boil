// The Work Order desk (GDD section 6; work order 022): up to 3 orders wait,
// a new one every 8 hours once trading opens. Each offers two seals; the
// Tinker picks one, gathers the goods and turns it in for Crowns and the
// faction's Favour. Only unbound goods count, so the starter crate does not.

import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api, gameNow, type Content, type DeskOutcome, type Outcome, type Tinker, type WorkOrderChoice, type WorkOrderDesk } from "./api";
import { ItemIcon } from "./Sprite";
import { duration } from "./format";
import { colors, ui } from "./theme";

const FACTIONS: Record<string, string> = {
  "favour.board": "The Board of Gauges",
  "favour.stokers": "The Stokers' Fellowship",
  "favour.counting_house": "The Counting-House",
  "favour.gaugers": "The Gaugers",
};

const faction = (seal: string) => FACTIONS[seal] ?? seal;

function unboundHeld(tinker: Tinker, item: string): number {
  return tinker.inventory.filter((stack) => stack.item === item && !stack.bound).reduce((sum, stack) => sum + stack.qty, 0);
}

export function WorkOrders({
  content: _content,
  tinker,
  name,
  onOutcome,
}: {
  content: Content;
  tinker: Tinker;
  name: (item: string) => string;
  onOutcome: (outcome: Outcome) => void;
}) {
  const [desk, setDesk] = useState<WorkOrderDesk | null>(null);
  const [error, setError] = useState<string | null>(null);

  const take = useCallback(
    (call: Promise<DeskOutcome>) =>
      call
        .then((outcome) => {
          setDesk(outcome.desk);
          onOutcome(outcome);
          setError(null);
        })
        .catch((reason: Error) => setError(reason.message)),
    [onOutcome],
  );

  // Reload when the count on the desk changes (an arrival seen by a look).
  useEffect(() => {
    take(api.desk(tinker.id));
  }, [take, tinker.id, tinker.workOrders]);

  if (!desk) return null;

  const choiceCard = (offer: number, order: WorkOrderChoice, chosen: boolean) => {
    const ready = order.asks.every((ask) => unboundHeld(tinker, ask.item) >= ask.qty);
    return (
      <View key={order.id} style={{ flex: 1, minWidth: 220, gap: 6, borderWidth: 1, borderColor: chosen ? colors.brass : colors.panelEdge, borderRadius: 6, padding: 10 }}>
        <Text style={[ui.text, { color: colors.brass, fontWeight: "700" }]}>{faction(order.seal)}</Text>
        <Text style={[ui.text, { fontStyle: "italic" }]}>{order.request}</Text>
        {order.asks.map((ask) => {
          const held = unboundHeld(tinker, ask.item);
          return (
            <View key={ask.item} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <ItemIcon item={ask.item} size={20} />
              <Text style={[ui.number, { color: chosen && held >= ask.qty ? colors.verdigris : colors.ink }]}>
                {chosen ? `${Math.min(held, ask.qty).toLocaleString()} / ` : ""}
                {ask.qty.toLocaleString()} {name(ask.item)}
              </Text>
            </View>
          );
        })}
        <Text style={ui.muted}>
          Pays {order.reward.crowns.toLocaleString()} Crowns and {order.reward.favour} Favour
          {(desk.favour[order.seal] ?? 0) >= desk.favourCap ? " (Favour already at its height for now)" : ""}
        </Text>
        {chosen ? (
          <Pressable onPress={() => take(api.turnIn(tinker.id, offer))} accessibilityRole="button" style={[ui.button, { opacity: ready ? 1 : 0.5 }]}>
            <Text style={ui.buttonText}>{ready ? "Turn it in" : "Gathering…"}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => take(api.chooseSeal(tinker.id, offer, order.id))} accessibilityRole="button" style={ui.button}>
            <Text style={ui.buttonText}>Take this seal</Text>
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <View style={[ui.panel, { marginBottom: 12 }]}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <Text style={ui.heading}>Work Orders</Text>
        <Text style={ui.muted}>
          {Object.entries(desk.favour)
            .map(([seal, value]) => `${faction(seal).replace(/^The /, "")} ${value}`)
            .join(" · ")}
        </Text>
      </View>
      {desk.locked ? (
        <Text style={ui.muted}>The desk opens with trading: {desk.locked}.</Text>
      ) : (
        <>
          {desk.offers.length === 0 && <Text style={ui.muted}>No orders waiting.</Text>}
          {desk.offers.map((offer) => {
            const shown = offer.chosen ? offer.choices.filter((choice) => choice.id === offer.chosen) : offer.choices;
            return (
              <View key={offer.id} style={{ gap: 6 }}>
                {!offer.chosen && <Text style={ui.muted}>Two seals on offer. Take one.</Text>}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{shown.map((choice) => choiceCard(offer.id, choice, Boolean(offer.chosen)))}</View>
                <Pressable onPress={() => take(api.discardOrder(tinker.id, offer.id))} accessibilityRole="button">
                  <Text style={[ui.muted, { fontSize: 12 }]}>Discard this order</Text>
                </Pressable>
              </View>
            );
          })}
          <Text style={[ui.muted, { fontSize: 12 }]}>
            {desk.offers.length >= desk.held
              ? `The desk is full (${desk.held}). The next order comes 8 hours after one goes.`
              : desk.nextAt
                ? `Next order in ${duration(Math.max(0, new Date(desk.nextAt).getTime() - gameNow()))}.`
                : ""}
          </Text>
        </>
      )}
      {error && <Text style={[ui.muted, { color: colors.scald }]}>{error}</Text>}
    </View>
  );
}

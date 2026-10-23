// The Brass Exchange tab (GDD section 6): the Counting-House window, never
// locked, and the trading floor, which opens at total level 50.

import { ladderFloor, onLadder, stepDown, stepUp } from "@long-boil/rules";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, useWindowDimensions, View } from "react-native";
import { api, type BookLevel, type Content, type MarketView, type Outcome, type Side, type Tinker } from "./api";
import { colors, ui } from "./theme";

const REFRESH_MS = 5_000;

function heldUnbound(tinker: Tinker, item: string): number {
  return tinker.inventory.filter((stack) => stack.item === item && !stack.bound).reduce((sum, stack) => sum + stack.qty, 0);
}

export function Exchange({
  content,
  tinker,
  name,
  run,
}: {
  content: Content;
  tinker: Tinker;
  name: (id: string) => string;
  run: (call: Promise<Outcome>) => Promise<unknown>;
}) {
  const [market, setMarket] = useState<MarketView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wide = useWindowDimensions().width >= 900;

  const refresh = useCallback(
    () =>
      api
        .market(tinker.id)
        .then((view) => {
          setMarket(view);
          setError(null);
        })
        .catch((reason: Error) => setError(reason.message)),
    [tinker.id],
  );

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const act = (call: Promise<Outcome>) => run(call).then(refresh);

  return (
    <View style={{ flexDirection: wide ? "row" : "column", gap: 12, alignItems: "flex-start" }}>
      <View style={{ width: wide ? 380 : "100%", gap: 12 }}>
        <Window content={content} tinker={tinker} market={market} name={name} act={act} />
      </View>
      <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : "100%", gap: 12 }}>
        {error && <Text style={[ui.text, { color: colors.scald }]}>{error}</Text>}
        <Floor content={content} tinker={tinker} market={market} name={name} act={act} />
      </View>
    </View>
  );
}

type Act = (call: Promise<Outcome>) => Promise<unknown>;

/** The Counting-House window: the collectors and the grocer's counter. */
function Window({ content, tinker, market, name, act }: { content: Content; tinker: Tinker; market: MarketView | null; name: (id: string) => string; act: Act }) {
  const collected = Object.entries(content.economy).filter(([, terms]) => terms.collectorPrice !== null);
  const groceries = Object.entries(content.economy).filter(([, terms]) => terms.grocerPrice !== null);
  return (
    <View style={ui.panel}>
      <Text style={ui.heading}>The Counting-House window</Text>
      <Text style={ui.muted}>
        Collectors buy a capped amount each week
        {market ? `, until ${new Date(market.weekEnds).toUTCString().slice(0, 16)}` : ""}.
      </Text>
      {collected.map(([item, terms]) => {
        const held = heldUnbound(tinker, item);
        const left = market?.collectorLeft[item] ?? terms.collectorWeeklyCap ?? 0;
        return (
          <CountRow
            key={item}
            title={name(item)}
            detail={`${terms.collectorPrice} each · you hold ${held} · they take ${left} more`}
            max={Math.min(held, left)}
            verb="Sell"
            onSubmit={(qty) => act(api.sellToCollector(tinker.id, item, qty))}
          />
        );
      })}
      {tinker.story.backRent > 0 && (
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 6 }}>
          <Text style={[ui.text, { flex: 1 }]}>Pip's bill for the back rent: {tinker.story.backRent} Crowns</Text>
          <Pressable
            style={[ui.button, { paddingVertical: 4 }, tinker.crowns < tinker.story.backRent && { opacity: 0.4 }]}
            disabled={tinker.crowns < tinker.story.backRent}
            onPress={() => act(api.payRent(tinker.id))}
            accessibilityRole="button"
          >
            <Text style={ui.buttonText}>Pay</Text>
          </Pressable>
        </View>
      )}
      <Text style={[ui.heading, { fontSize: 15, marginTop: 6 }]}>The grocer's counter</Text>
      {groceries.map(([item, terms]) => (
        <CountRow
          key={item}
          title={name(item)}
          detail={`${terms.grocerPrice} each · you hold ${heldUnbound(tinker, item)}`}
          max={Math.floor(tinker.crowns / (terms.grocerPrice ?? 1))}
          verb="Buy"
          onSubmit={(qty) => act(api.buyFromGrocer(tinker.id, item, qty))}
        />
      ))}
    </View>
  );
}

function CountRow({ title, detail, max, verb, onSubmit }: { title: string; detail: string; max: number; verb: string; onSubmit: (qty: number) => void }) {
  const [count, setCount] = useState("");
  const qty = count === "" ? max : Number(count);
  const valid = Number.isInteger(qty) && qty >= 1 && qty <= max;
  return (
    <View style={{ gap: 4 }}>
      <Text style={ui.text}>{title}</Text>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <Text style={[ui.muted, { flex: 1 }]}>{detail}</Text>
        <TextInput
          style={[ui.input, { width: 72, paddingVertical: 4 }]}
          value={count}
          onChangeText={setCount}
          placeholder={String(max)}
          placeholderTextColor={colors.muted}
          inputMode="numeric"
          accessibilityLabel={`${verb} how many ${title}`}
        />
        <Pressable
          style={[ui.button, { paddingVertical: 4 }, !valid && { opacity: 0.4 }]}
          disabled={!valid}
          onPress={() => {
            onSubmit(qty);
            setCount("");
          }}
          accessibilityRole="button"
        >
          <Text style={ui.buttonText}>{verb}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** The trading floor: one item's book, an order ticket, and this Tinker's open orders. */
function Floor({ content, tinker, market, name, act }: { content: Content; tinker: Tinker; market: MarketView | null; name: (id: string) => string; act: Act }) {
  const tradable = useMemo(
    () =>
      Object.entries(content.economy)
        .filter(([, terms]) => !terms.bound)
        .map(([item]) => item)
        .sort((a, b) => name(a).localeCompare(name(b))),
    [content.economy, name],
  );
  const [item, setItem] = useState<string>(() => tradable.find((id) => heldUnbound(tinker, id) > 0) ?? tradable[0] ?? "");
  const [book, setBook] = useState<{ bids: BookLevel[]; asks: BookLevel[] } | null>(null);
  const [side, setSide] = useState<Side>("sell");
  const [price, setPrice] = useState(10);
  const [count, setCount] = useState("1");

  const loadBook = useCallback(() => {
    if (item) api.book(item).then(setBook).catch(() => setBook(null));
  }, [item]);

  useEffect(() => {
    loadBook();
    const timer = setInterval(loadBook, REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadBook]);

  const qty = Number(count);
  const held = heldUnbound(tinker, item);
  const validQty = Number.isInteger(qty) && qty >= 1 && (side === "sell" ? qty <= held : qty * price <= tinker.crowns);
  const canPlace = market?.canTrade === true && onLadder(price) && validQty;

  return (
    <View style={{ gap: 12 }}>
      <View style={ui.panel}>
        <Text style={ui.heading}>The trading floor</Text>
        {market && !market.canTrade && (
          <Text style={[ui.text, { color: colors.copper }]}>
            {market.refusal ? market.refusal.charAt(0).toUpperCase() + market.refusal.slice(1) : "Trading is closed"}. The
            Counting-House window is always open.
          </Text>
        )}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {tradable.map((id) => (
            <Pressable
              key={id}
              onPress={() => setItem(id)}
              accessibilityRole="button"
              style={{
                paddingVertical: 4,
                paddingHorizontal: 8,
                borderRadius: 4,
                borderWidth: 1,
                borderColor: id === item ? colors.brass : colors.panelEdge,
              }}
            >
              <Text style={[ui.muted, id === item && { color: colors.ink }]}>{name(id)}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={ui.panel}>
        <Text style={ui.heading}>{name(item)}</Text>
        <View style={{ flexDirection: "row", gap: 16 }}>
          <BookSide title="Bids" levels={book?.bids ?? []} color={colors.verdigris} onPick={(p) => setPrice(p)} />
          <BookSide title="Asks" levels={book?.asks ?? []} color={colors.copper} onPick={(p) => setPrice(p)} />
        </View>
        <Text style={ui.muted}>You hold {held} unbound. 2% tax on every sale; orders last 30 days.</Text>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {(["sell", "buy"] as const).map((choice) => (
            <Pressable
              key={choice}
              onPress={() => setSide(choice)}
              accessibilityRole="button"
              style={[ui.button, { paddingVertical: 4 }, side !== choice && { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.panelEdge }]}
            >
              <Text style={[ui.buttonText, side !== choice && { color: colors.muted }]}>{choice === "sell" ? "Sell" : "Buy"}</Text>
            </Pressable>
          ))}
          <TextInput
            style={[ui.input, { width: 72, paddingVertical: 4 }]}
            value={count}
            onChangeText={setCount}
            inputMode="numeric"
            accessibilityLabel="How many"
          />
          <Text style={ui.muted}>at</Text>
          <Pressable onPress={() => setPrice(stepDown(price))} accessibilityRole="button" accessibilityLabel="One step cheaper">
            <Text style={[ui.heading, { paddingHorizontal: 6 }]}>−</Text>
          </Pressable>
          <TextInput
            style={[ui.input, { width: 72, paddingVertical: 4 }]}
            value={String(price)}
            onChangeText={(text) => setPrice(Number(text) || 1)}
            onBlur={() => setPrice(ladderFloor(price))}
            inputMode="numeric"
            accessibilityLabel="Price in Crowns"
          />
          <Pressable onPress={() => setPrice(stepUp(price))} accessibilityRole="button" accessibilityLabel="One step dearer">
            <Text style={[ui.heading, { paddingHorizontal: 6 }]}>+</Text>
          </Pressable>
          <Pressable
            style={[ui.button, { paddingVertical: 4 }, !canPlace && { opacity: 0.4 }]}
            disabled={!canPlace}
            onPress={() => act(api.placeOrder(tinker.id, { item, side, price, qty })).then(loadBook)}
            accessibilityRole="button"
          >
            <Text style={ui.buttonText}>Place order</Text>
          </Pressable>
        </View>
        <Text style={ui.muted}>
          {side === "buy" ? `Holds ${(qty * price || 0).toLocaleString()} Crowns until it fills.` : `Holds the ${name(item)} until it fills.`}
          {!onLadder(price) ? ` ${price} is between price steps; it will round to ${ladderFloor(price)}.` : ""}
        </Text>
      </View>

      {market && market.orders.length > 0 && (
        <View style={ui.panel}>
          <Text style={ui.heading}>Your open orders</Text>
          {market.orders.map((order) => (
            <View key={order.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <Text style={[ui.text, { flex: 1 }]}>
                {order.side === "sell" ? "Selling" : "Buying"} {order.qtyOpen} of {order.qtyTotal} {name(order.item)} at {order.price}
              </Text>
              <Text style={ui.muted}>until {new Date(order.expiresAt).toUTCString().slice(5, 16)}</Text>
              <Pressable onPress={() => act(api.cancelOrder(tinker.id, order.id)).then(loadBook)} accessibilityRole="button">
                <Text style={[ui.muted, { color: colors.scald }]}>cancel</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function BookSide({ title, levels, color, onPick }: { title: string; levels: BookLevel[]; color: string; onPick: (price: number) => void }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={[ui.muted, { color }]}>{title}</Text>
      {levels.length === 0 && <Text style={ui.muted}>none</Text>}
      {levels.map((level) => (
        <Pressable key={level.price} onPress={() => onPick(level.price)} accessibilityRole="button" style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={ui.number}>{level.price}</Text>
          <Text style={[ui.number, { color: colors.muted }]}>{level.qty.toLocaleString()}</Text>
        </Pressable>
      ))}
    </View>
  );
}

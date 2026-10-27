// The stores as a grid of icons with counts, after Milky Way Idle's
// inventory: the name shows on hover or tap, and bound items carry a small
// padlock, from the interface sheet. The padlock means "not for sale", not
// "not for use", so the name line says so. The chosen item's flavour shows
// beneath, and for a Ration how it is used, since nothing is eaten by hand.

import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { Content, Tinker } from "./api";
import { ItemIcon, UiIcon } from "./Sprite";
import { colors, ui } from "./theme";

function short(qty: number): string {
  if (qty >= 1_000_000) return `${Math.floor(qty / 100_000) / 10}M`;
  if (qty >= 10_000) return `${Math.floor(qty / 1_000)}k`;
  return qty.toLocaleString();
}

export function Stores({ content, tinker, name }: { content: Content; tinker: Tinker; name: (id: string) => string }) {
  const [shown, setShown] = useState<string | null>(null);
  const label = (stack: Tinker["inventory"][number]) =>
    `${name(stack.item)}: ${stack.qty.toLocaleString()}${stack.bound ? ". Bound: yours to use, but not to sell or trade" : ""}`;
  const current = tinker.inventory.find((stack) => `${stack.item}-${stack.bound}` === shown);
  return (
    <View style={[ui.panel, { gap: 10 }]}>
      <Text style={ui.heading}>Stores</Text>
      {tinker.inventory.length === 0 && <Text style={ui.muted}>Empty shelves.</Text>}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {tinker.inventory.map((stack) => {
          const key = `${stack.item}-${stack.bound}`;
          return (
            <Pressable
              key={key}
              onHoverIn={() => setShown(key)}
              onHoverOut={() => setShown((value) => (value === key ? null : value))}
              onPress={() => setShown((value) => (value === key ? null : key))}
              accessibilityRole="button"
              accessibilityLabel={label(stack)}
              style={{
                width: 52,
                height: 52,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 6,
                borderWidth: 1,
                borderColor: shown === key ? colors.brass : colors.panelEdge,
                backgroundColor: colors.soot,
              }}
            >
              <ItemIcon item={stack.item} size={32} />
              <Text style={[ui.number, { position: "absolute", right: 3, bottom: 1, fontSize: 11, color: colors.ink }]}>{short(stack.qty)}</Text>
              {stack.bound && (
                <View style={{ position: "absolute", left: 2, top: 2 }}>
                  <UiIcon name="locked" size={13} />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
      <Text style={[ui.muted, { minHeight: 18 }]}>{current ? label(current) : tinker.inventory.length ? "Point at an item for its name." : ""}</Text>
      {current && <Text style={[ui.muted, { fontStyle: "italic" }]}>{content.items.find((item) => item.id === current.item)?.flavour}</Text>}
      {current?.item === content.ration.item && (
        <Text style={[ui.muted, { color: colors.verdigris }]}>
          Eaten on its own in a fight as you get hurt; you never eat one by hand. Keep some in the stores before you fight. A boss attempt takes at most{" "}
          {content.ration.bossCap}.
        </Text>
      )}
    </View>
  );
}

// A quiet painting behind each place in the workshop, from the art synced to
// /art/bg/ (art.ts): the workshop for the skills, Rustmoor for the fights, the
// Exchange floor, and so on. It sits far back under a dark wash, so it gives
// the screen a sense of place without fighting the text. Until a painting
// exists, the plain soot background shows.

import { Image, View } from "react-native";
import { art } from "./art";
import type { Place } from "./SideNav";
import { colors } from "./theme";

const PAINTINGS: Record<string, string> = {
  skill: "bg/workshop.jpg",
  "skill:fight": "bg/rustmoor.jpg",
  story: "bg/sprocket_row.jpg",
  exchange: "bg/brass_exchange.jpg",
  guild: "bg/guildhall.jpg",
  stores: "bg/workshop.jpg",
  chat: "bg/sprocket_row.jpg",
};

function paintingFor(place: Place): string {
  return PAINTINGS[place] ?? (place.startsWith("skill:") ? PAINTINGS.skill! : PAINTINGS.story!);
}

export function Backdrop({ place }: { place: Place }) {
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.soot }}>
      <Image source={{ uri: art(paintingFor(place)) }} resizeMode="cover" style={{ width: "100%", height: "100%", opacity: 0.22 }} />
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(27, 23, 18, 0.55)" }} />
    </View>
  );
}

// A comment may say knock: comments never reach the screen.
/* knock, in a block comment too. */
import { knock } from "./knock";
import type { Thing } from "./knock";
const art = require("../assets/knock.png");
export type Kind = "knock" | "other";
const knock_ID = "item.rustmoor.knock";
const place = `job:${knock}`;
const table = { knock: 1, "knock": 2, id: "knock", kind: "knock" };
function knock(x: Kind): number {
  if (x === "knock") return table["knock"];
  switch (x) {
    case "knock":
      return 1 < 2 ? 3 : 4;
  }
  return x.replace(/"knock/g, "").length;
}
export function Quiet() {
  return (
    <View key="knock" className="knock knock" testID="knock" style={{ fontFamily: knock_ID }}>
      {/* knock, in a JSX comment. */}
      <Text>{knock("other")}</Text>
    </View>
  );
}

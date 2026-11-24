// The Guild tab's contracts (work order 043): five bars the whole guild fills
// by working as usual. There is nothing to accept, hand in or claim, so
// nothing here is a button, and nothing badges.

import { Text, View } from "react-native";
import { gameNow, type ContractsView } from "./api";
import { duration, titleCase } from "./format";
import { FIGHT } from "./jobs";
import { SkillIcon } from "./SkillView";
import { colors, ui } from "./theme";

export function contractName(kind: string): string {
  return kind === FIGHT ? "Fighting" : titleCase(kind.replace("_", " "));
}

/** Hours to one place, dropping a bare .0; always rounded down, so a bar never claims a mark it has not reached. */
function hours(seconds: number): string {
  const tenths = Math.floor(seconds / 360) / 10;
  return `${tenths.toLocaleString()}h`;
}

/** Up to a target, which is rounded up instead, for the same reason. */
function targetHours(seconds: number): string {
  return `${(Math.ceil(seconds / 360) / 10).toLocaleString()}h`;
}

function left(ms: number): string {
  const days = Math.floor(ms / 86_400_000);
  return days >= 1 ? `${days} ${days === 1 ? "day" : "days"}` : duration(ms);
}

export function Contracts({ view }: { view: ContractsView }) {
  const tiers = view.contracts.reduce((sum, contract) => sum + contract.reached, 0);
  const paid = view.mine >= view.needed;
  return (
    <View style={[ui.panel, { gap: 8 }]}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <Text style={ui.heading}>This week's contracts</Text>
        <Text style={ui.muted}>
          ends in {left(new Date(view.endsAt).getTime() - gameNow())} · you hold {view.tokens} Guild {view.tokens === 1 ? "Token" : "Tokens"}
        </Text>
      </View>
      <Text style={ui.muted}>Work as you always do, and it counts for the guild. Each mark passed earns a Guild Token.</Text>
      {view.contracts.map((contract) => {
        const most = contract.targets[contract.targets.length - 1]!;
        const next = contract.targets[contract.reached];
        return (
          <View key={contract.kind} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <SkillIcon skill={contract.kind} size={30} />
            <View style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                <Text style={[ui.text, { fontWeight: "700" }]}>{contractName(contract.kind)}</Text>
                <Text style={[ui.muted, { fontSize: 12 }]}>
                  {next === undefined ? `${hours(contract.seconds)}, all done` : `${hours(contract.seconds)} of ${targetHours(next)}`} · yours {hours(contract.mine)}
                </Text>
              </View>
              <View
                accessibilityLabel={`${contractName(contract.kind)}: ${contract.reached} of ${contract.targets.length} marks`}
                style={{ height: 10, borderRadius: 5, backgroundColor: "#15110d", borderWidth: 1, borderColor: colors.panelEdge, overflow: "hidden" }}
              >
                <View style={{ height: "100%", width: `${Math.min(100, (contract.seconds / most) * 100)}%`, backgroundColor: next === undefined ? colors.verdigris : colors.brass }} />
                {contract.targets.slice(0, -1).map((target) => (
                  <View key={target} style={{ position: "absolute", left: `${(target / most) * 100}%`, top: 0, bottom: 0, width: 2, backgroundColor: colors.panelEdge }} />
                ))}
              </View>
            </View>
            <Text style={[ui.number, { width: 34, textAlign: "right", color: contract.reached ? colors.verdigris : colors.muted }]}>
              {contract.reached}/{contract.targets.length}
            </Text>
          </View>
        );
      })}
      <Text style={[ui.muted, { fontSize: 12 }]}>
        {paid
          ? `You have done your part: ${tiers} ${tiers === 1 ? "token" : "tokens"} so far, paid two days after the week ends.`
          : `Put in ${targetHours(view.needed)} across these to be paid; you have ${hours(view.mine)}.`}
      </Text>
    </View>
  );
}

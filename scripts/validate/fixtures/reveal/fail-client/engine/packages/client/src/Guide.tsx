export const goal = "Answer the knock.";
export const hint = (n: number) => `Listen for ${n} knock sounds`;
export const label = "knock";
export const pick = (a: boolean) => (a ? "knock" : "quiet");
export function Guide() {
  return (
    <Text title="A knock" aria-label={"knock now"}>
      Mind the
      knock below
      <Text>{"knock"}</Text>
    </Text>
  );
}

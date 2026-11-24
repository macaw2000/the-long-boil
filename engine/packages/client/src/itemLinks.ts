// Item links in chat: an item's whole name in square brackets, as typed, such
// as [Brass Ingot]. A message keeps the plain words; they become a link only
// where they are shown, so nothing is stored that a later name could break.

export interface Named {
  id: string;
  name: string;
}

export type Piece = { text: string } | { item: string; name: string };

/** A message cut into plain text and the items it names. Brackets round anything else stay as typed. */
export function pieces(text: string, items: readonly Named[]): Piece[] {
  const out: Piece[] = [];
  let from = 0;
  for (const match of text.matchAll(/\[([^[\]]+)\]/g)) {
    const wanted = match[1]!.trim().toLowerCase();
    const item = items.find((known) => known.name.toLowerCase() === wanted);
    if (!item) continue;
    if (match.index > from) out.push({ text: text.slice(from, match.index) });
    out.push({ item: item.id, name: item.name });
    from = match.index + match[0].length;
  }
  if (from < text.length) out.push({ text: text.slice(from) });
  return out;
}

/** What has been typed after a bracket not yet closed, at the end of a draft; null when there is none. */
export function openLink(draft: string): string | null {
  return /\[([^[\]]*)$/.exec(draft)?.[1] ?? null;
}

/** Items to offer for an open bracket: names starting with what was typed, then names holding it. */
export function suggest(typed: string, items: readonly Named[], most: number): Named[] {
  const wanted = typed.trim().toLowerCase();
  const starts = items.filter((item) => item.name.toLowerCase().startsWith(wanted));
  const holds = items.filter((item) => !item.name.toLowerCase().startsWith(wanted) && item.name.toLowerCase().includes(wanted));
  return [...starts, ...holds].slice(0, most);
}

/** The draft with its open bracket finished as this item. */
export function finishLink(draft: string, name: string): string {
  return draft.replace(/\[[^[\]]*$/, () => `[${name}] `);
}

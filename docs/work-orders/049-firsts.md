# Work order 049: Firsts

**Agents:** the lead session for the rules, server, client and tests. `draftsman` to review the list and its Crowns; `assayer` to confirm the Crowns are noise against the bill and the week; `educator`. Still to come: Jeremy to play it.
**Status:** built and tested (27 November 2026). Not reviewed by the crew.
**Blocks:** nothing.

## Why this one

A player who stays needs an agenda of their own, not only the guide's. Approved by Jeremy, 27 November 2026.

## What changed

**Twenty-two one-off goals** (`engine/packages/rules/src/firsts.ts`), in the order a new Tinker meets them: the first thing made, why No. 9 is yours, a weapon in hand, the first rat, a first level 2, the tube, 25 things, a fighting style to 3, armour worn, 100 Crowns held, three benches, 100 things, a tool held, a guild, a first level 5, all six benches, total level 30, the end of Your First Day, a Scrounger beaten, two skills at 5, 500 things, Pip's bill cleared. They pay 5 to 40 Crowns each, **325 in all**.

Each is read from the state as it stands, so nothing new is counted, and a Tinker already playing finds the ones they have earned waiting to be claimed.

**Claiming** (`POST /tinkers/:id/firsts/:first/claim`): pays once, logs a `first_claimed` event, and is refused for one not done or already paid. Claimed ids are kept in `firsts` (migration 028).

**The panel** (`engine/packages/client/src/Firsts.tsx`): under the Stores, from the end of the first sitting's guide (with the Guild), so it is never one more thing on a screen that teaches. Ready ones glow with a Claim button; the next three still open show beneath; the claimed fold into "N of 22"; the panel goes when all are done. Claiming plays its sound and throws sparks.

## Measured

Played: six were ready at the end of the first sitting, and claiming worked. 325 Crowns in all is under a quarter of Pip's bill, spread over the first days.

## For Jeremy

1. **Rewards in Crowns.** Small enough not to bend the bill; Guild Tokens or a look are the other choices.
2. **Six ready at once** at the end of sitting 1 makes a pleasant claiming moment. If it reads as a chore, the first five could pay as they happen instead.

## Hand back

- Rules: `firsts.ts`, `index.ts`; tests `firsts.test.ts`.
- Server: `tinkers.ts` (`claimFirst`, `firstsContext`, `view` gives `firsts`), `api.ts`, migration 028; `server.test.ts` ("pays a first once, when it is done").
- Client: `Firsts.tsx`, `Workshop.tsx`, `api.ts`, `sound.ts`.

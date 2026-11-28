# Work order 044: how the first hour feels

**Agents:** the lead session for the client. `educator` to walk the first sitting after. Still to come: Jeremy to play it.
**Status:** built and played in a browser at 1400×900 and 390×844 (27 November 2026). Not reviewed by the crew.
**Blocks:** nothing. Follows work order 041, which it must not undo.

## Why this one

Jeremy, 27 November 2026, after a first-hour review (`claude/first-hour-fun-review.md` in the project): playtesters are not coming back, and the first minutes need "juice and accomplishment". The review found the moments that should reward were small or silent: a hit floated "-1" twice a second, the picked job's Start sat under twenty tiles, and nothing named what the next level would give.

## What changed

Nothing in the rules, the economy or the tuning. Client only.

- **Blows read as blows** (`Sprite.tsx`). A number rises about every second and a half, not every half-second, sized to the share of the monster's health the bar lost, with a little spread. About one blow in eight is a telling blow: bigger, gold, with a shake. A blow just after a kill counts both sides of the wrap.
- **New sounds** (`sound.ts`), made in the browser, nothing fetched: a soft blow, a telling blow, a rare find, a first claimed. Like the rest, they stop while the tab is hidden and follow the sound switch.
- **The workshop's breath** (`sound.ts`, `useAmbient`): a low bed of steam under everything, faded in and out, about a fiftieth of full volume. It follows the sound switch and stops while the tab is hidden.
- **The Stores answer** (`Stores.tsx`): a tile swells and its rim goes green when its count rises.
- **The top bar names the next level** (`ActionBar.tsx`, `SkillProgress`): the working skill's level, a thin bar, "level 3 in 16 goes", and the next thing it opens.
- **The picked job sits above the tiles** (`SkillView.tsx`), so Start is on the screen.
- **The workshop scenes show the workshop** (`Story.tsx`, `sprites.ts`): `who_you_are`, `rats_in_the_workshop` and `the_first_haul` use the workshop backdrop as their vignette instead of the street. No new art.
- **The send-off offers the reminder** (`Guide.tsx`, `ReminderOffer`): one line saying the email reminder is on, with a press to turn it off.

## Not done, on purpose

- **A sound for every swing.** The soft blow is every second and a half, and only while the fight is on screen.
- **New vignette art for No. 9.** The backdrop crop reads as the workshop. A drawn 96×96 workshop vignette would be better; it is a line for `docs/art-requests.md` if wanted.

## For Jeremy, after playing it

1. Is the steam bed welcome, or should it wait for the family's recordings?
2. Telling blows are shown only, not rolled: the fight still resolves from expected values. Fine as decoration?

## Hand back

- Changed: `engine/packages/client/src/Sprite.tsx`, `sound.ts`, `Stores.tsx`, `ActionBar.tsx`, `SkillView.tsx`, `Story.tsx`, `sprites.ts`, `Guide.tsx`.
- Checked: the typecheck; the first sitting played at desktop and phone widths. Not checked: the sounds by ear (the browser used has no speakers).

# Handoff to Claude Code — 《哎呀，又月底了呀》

Updated: 2026-09-23

## Current rules, as of 2026-09-23

A seven-month run. Each month you must work, eat and make one ROI investment
before you can sleep; sleeping is what refills energy. Running the tank to zero
collapses you outdoors instead, which ends the month and costs 25 energy off the
next one. A night out is optional and once a month.

Energy is only spent on walking, work, part-time shifts and shop purchases.
Banking, trading and investing are free -- they are paperwork, not a day's work.
Every counter that does charge energy refuses the action when you cannot afford
it, rather than taking it and collapsing you mid-transaction.

Rent is cash, handed to the landlord at home, and climbs $50 a month ($220 in
month 1, $520 in month 7). Only the wallet counts, so leaving money in the bank
is a real gamble; the bank's rate is re-rolled between 3% and 9% each month.
Miss rent three months running and you are bankrupt. If you never pay, the
landlord takes what is in your wallet at month end and the rest becomes debt.

Work is the biggest single earner but only for the first shift of a month: the
falloff is [1, 0.5, 0.25, 0.1], so a second hard shift pays $440 for 50 energy
against the first one's $880. That is deliberate -- before it, two shifts paid
$1,496 a month while the best possible month on the exchange paid $158, and the
whole investing half of the game was decoration.

The exchange lists all five stocks. Both this month's and next month's moves are
rolled at the start of the month and applied unchanged, so the part-time tip
(money plus two months of inside word on one stock) is always true and always
actionable. ROI takes a typed amount capped at $1,000 for every project, and
anything still invested when month seven ends settles in the final report.

A position is capped at 30 shares of one stock, which is $810-$1,980 -- more
than you start with, so the market only opens up once you have earned something.

The shop has two shelves: three permanent goods (backpack, sell back at half
price) and four one-shots, of which you may buy one of each kind per month.

Thieves: one from month 3, two from month 6, exactly one of which is the runner
(0.58/0.66/0.74 of player speed by time of day) and the other a 0.45 slowpoke.
Going indoors clears the street; the first respawns after 20s, any second after 7.

## Test suite

Offline (no browser): `check-layout` `check-stock-tips` `check-endings`.
Browser (needs playwright and a server on 8934): `check-month-rules` `check-market`
`check-thieves` `check-low-energy` `check-card-shape`.

`scripts/nav.js` plans a walk over the game's own collision mask, so browser tests
steer from the live player position. Do not go back to recorded key sequences --
they go stale the moment a door or walking speed changes.

`?debug=1` exposes a read-only `window.__peek()` snapshot. Tests may also edit the
month inside the game's own checkpoint (`aiyaMonthEndGame_checkpoint_v1`) and resume,
which is how the month-7 thief case is reached without playing seven months.

## Codex illustrated title-cover pass (2026-09-20)

### Readability correction after user review

The user found the first illustrated cover tiring to look at and specifically
said `哎呀` was unclear. Preserve this corrective pass:

- Removed the dotted/halftone overlay and disabled decorative sparkles.
- Reduced cover-art saturation and contrast, then added a calmer cream reading
  gradient behind only the title area.
- Removed the `WALLET · WORK · LUCK` kicker.
- Simplified the badge to `12个月 · 别破产`.
- Changed `哎呀！` into a small, solid coral sticker with navy text and a thin
  edge. The main title is about 15% smaller, has looser tracking and only one
  subtle light edge instead of multiple competing shadows.
- Unified both secondary buttons to cream; only the primary action stays yellow.
  Button shadows and hover movement are lighter.
- Adjusted the same hierarchy separately for portrait and short landscape.

Do not restore the halftone texture, English kicker, green save button, giant
main title or layered title shadows without explicit user approval.

- Replaced only the title-screen presentation. Gameplay, map geometry, balance,
  save format, card logic and `game.js` are unchanged.
- Added `assets/art/title-cover-desktop.png` (1672x941) and
  `assets/art/title-cover-mobile.png` (941x1672). Both deliberately contain no
  baked text or UI; desktop and portrait use separate compositions so the
  protagonist is not lost to responsive cropping.
- Rebuilt the `#title-screen` markup in `index.html` while preserving the three
  existing button IDs and their original handlers: `#new-game-btn`,
  `#resume-btn`, and `#collection-btn`.
- Added an isolated cover section at the end of `styles.css`: cinematic town
  art, readable title lockup, full-width primary action, save/collection
  secondary actions, portrait and short-landscape layouts, entrance motion,
  hover/press feedback, focus states and reduced-motion support.
- Added `title-cover.js`, which only provides subtle pointer parallax and a
  local button ripple. It does not read or mutate game state.
- Verified at the default desktop viewport, 390x844 portrait and 844x390
  landscape. All buttons are in-bounds, the collection opens correctly, both
  scripts pass `node --check`, `scripts/check-layout.js` passes, and the browser
  console has no warnings/errors.

## Codex card-art delivery (2026-09-20)

Codex generated the 64 missing card illustrations as four new 4x4 atlases:

- `assets/art/card-art-extra-1.png`
- `assets/art/card-art-extra-2.png`
- `assets/art/card-art-extra-3.png`
- `assets/art/card-art-extra-4.png`

The exact zero-based row-major card order is in
`assets/art/card-art-extra-manifest.json`. Use the manifest as the source of
truth when adding the 64 `CARD_ART` entries. All four sheets are 4 columns by
4 rows, so `cardMarkup()` needs per-sheet column/row metadata instead of the
current `items ? 6x3 : 6x6` branch.

The new sheets cover exactly: 36 additional fate cards, 8 food cards, 7 fun
cards, 5 tools, 7 part-time jobs, and `luck:spray`. Do not remap or replace the
existing `main` and `items` atlas cells. The unused legacy mappings
`parttime:board` and `parttime:mystery` are not part of this delivery.

## Read first

- This is a **new standalone game** in `aiya-month-end-game/`. Do not edit or merge it with any older game in the parent folder.
- Read `HANDOFF_TO_CODEX.md` completely before changing code. It records the collision, sprite-repack, mobile-camera and asset-atlas traps already fixed.
- Keep the game dependency-free: plain `index.html`, `styles.css` and `game.js`.
- There is only **one home**, `你的小窝`. Do not restore the old three-home choice.

## Current user feedback and latest fix

The user reported that text on the `$900工作` card was crowded and crossed by the footer divider. Codex has already added a dedicated `work-card` layout:

- Work art is shorter (`40%`) so the text area has more room.
- `效果` and its description use a fixed two-column row.
- Salary is a separate footer with a solid divider and its own background.
- `showWork()` now passes `choice work-card` to `cardMarkup()`.

Do not remove this fix. First visually verify all four work cards at desktop and at **390×844**. Long Chinese text must never touch the divider, salary, border or neighbouring text.

## What Claude should handle next

1. **Card layout QA across every card type.** Check fate, work, part-time, tool, food, entertainment, stock, ROI and lucky-item cards at desktop, 390×844 portrait and 844×390 landscape. Text must stay readable without clipping or overlap.
2. **Use card-specific layout modifiers when needed.** Do not solve one long card by shrinking every card's font. Preserve at least 10px body text on mobile selection cards and 15–16px titles where practical.
3. **Keep collection cards as thumbnails.** Phone collection view is three columns. The thumbnail may omit body copy; clicking an unlocked card must open the full-size card preview.
4. **Preserve the new HUD and cover.** The compact navy HUD, dark-glass cover, proximity-gated centered `Click` button and mobile player-follow camera are intentional.
5. **Only regenerate art when there is a real mismatch.** Existing art is coherent; most remaining problems should be fixed in HTML/CSS first.

## Required image / “photo” style

Use one consistent style for every new or regenerated asset:

- **Modern high-detail pixel-art illustration**, inspired by cozy 16-bit/32-bit management RPGs. It may be described to image models as “8-bit game art”, but it must match the existing detailed assets rather than using very coarse square pixels.
- Warm, cheerful and slightly comedic; not stressful, childish or visually noisy.
- Tropical Malaysian-town atmosphere: lush plants, warm sunlight, shop-houses, food-stall details and a modern city skyline. **No national flag.**
- Palette: deep navy outlines/shadows, warm gold, mint green, coral, sky blue and restrained purple neon.
- Soft cinematic lighting with crisp silhouettes. Avoid muddy filters, realistic photography, glossy 3D, flat corporate vector art and mismatched anime rendering.
- Characters: chibi proportions, expressive face and clear silhouette. Every NPC must have a different body shape, hairstyle, clothes and role-specific prop.
- Buildings and interiors: every building must be visually unique and its interior must clearly match its exterior function. Keep walkable floor areas uncluttered.

### Card illustration rules

- Illustration only—**never bake Chinese/English text, prices, labels, borders or UI into the PNG**. HTML renders all text.
- One clear subject and one readable action per picture; avoid crowded scenes.
- Keep the main face/object inside the centre **70% safe area** so atlas cropping cannot cut it off.
- Compose for the card's wide illustration window (roughly 3:2 inside a 4:5 card), with important content away from all edges.
- Use the same outline weight, lighting direction and character proportions as `assets/art/card-art-main.png`.
- New atlas cells must match the existing grid exactly: `card-art-main.png` is 6×6; `card-art-items.png` is 6×3. Do not change those grids without updating `CARD_ART` and `cardMarkup()` together.

### Map, interior and sprite rules

- `town-map-v2.png`: keep the simple loop-road layout, one home and short travel distances. Art changes must not change gameplay geometry silently.
- `interior-atlas.png`: top-down/isometric dollhouse rooms, warm detailed pixel art, clear entrance and open central interaction area.
- Player sprite: fixed gender-neutral student/young worker, four directions, visible standing and running poses. Never let adjacent animation frames bleed into one another.
- NPC sprites: transparent background, consistent scale/baseline, two poses per NPC. If regenerated, run `scripts/repack-sprites.py` before wiring them into the game.

## Technical guardrails

- After any map/building/door edit, run `node scripts/check-layout.js`. Required result: every interaction point reachable and zero isolated walkable cells.
- After JavaScript edits, run `node --check game.js`.
- Browser-test desktop, 390×844 portrait and 844×390 landscape. Check console warnings/errors.
- On mobile, `Click` stays hidden unless `findNearbyTarget()` returns a target and the game is not paused. It remains centred in the bottom control shelf.
- Do not put persistent labels, controls or warnings over the player sprite.
- Do not remove Claude's previous collision, standing-spot, sprite-mask, toast or single-home fixes.

## Acceptance checklist for the next pass

- Four work cards: no overlap at any supported size.
- Longest title and longest effect text tested for every card category.
- Collection thumbnail remains small; unlocked thumbnail opens readable full card.
- Player remains visible above phone controls.
- All buildings reachable and every building/interior/NPC stays visually distinct.
- No console warning/error and no regression to other games in the parent folder.

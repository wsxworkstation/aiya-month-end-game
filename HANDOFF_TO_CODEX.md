# Handoff: art wiring + single-home simplification (Claude, 2026-09-16)

## Codex UI polish pass (2026-09-17)

- Rebuilt the title screen as a compact dark-glass cover laid over the town art, with a stronger title hierarchy, cleaner rounded buttons and a single-column mobile layout.
- Rebuilt the in-game HUD as a compact navy status bar with color-coded wallet/bank/motivation/luck tiles, a contained timer and smaller action buttons. Desktop and mobile now share one consistent visual system.
- The mobile `Click` action is now 17px, centered in the bottom control shelf and proximity-gated: it is hidden unless `findNearbyTarget()` returns an interactable location and the game is not paused.
- Collection cards are now true thumbnails (three columns on a 390px phone). Unlocked cards have a zoom cursor and open a dedicated full-size illustrated card preview; the preview has a “返回卡片图鉴” button.
- Verified in the in-app browser at desktop and 390x844 portrait. `node --check game.js` and `node scripts/check-layout.js` pass; browser console has zero warnings/errors.
- Work-choice cards now use a dedicated `work-card` layout: shorter art, a fixed two-column effect row and a separated salary footer, preventing the effect text and salary from overlapping on narrow/mobile cards.

## Codex visual/mobile pass (2026-09-16)

- Kept Claude's collision, sprite-repack, interior/NPC, toast and single-home fixes.
- Added `town-map-v2.png`: a much simpler loop-road town with exactly one home, then realigned all building footprints, doors, the notice board and the fountain obstacle. `node scripts/check-layout.js` passes with every destination reachable from every exit and zero isolated cells.
- Added `card-art-main.png` (6x6) and `card-art-items.png` (6x3). Cards use a compact 4:5 rectangular collectible-card layout (shorter and smaller than the earlier 5:7 draft), with a real illustration window, a visible “效果” block and a separate context/meta strip. `cardMarkup()` suppresses the meta strip automatically when it duplicates the effect text. Fate, work, food, fun, stock, ROI, tools, luck items and part-time jobs all map to art cells. The permanent collection uses the same illustrated cards.
- Mobile portrait now uses a horizontal player-following camera instead of shrinking the full 16:9 map into a thin strip. A dedicated bottom control shelf keeps the player and home entrance above the D-pad. Persistent canvas labels are hidden on small screens; the top location chip and action button show the current interaction instead.
- Added movement easing for less abrupt keyboard/touch motion and responsive HUD/card carousel rules for portrait and landscape phones.
- Interaction UI no longer covers the player: desktop reserves a 58px footer below the canvas and shows a compact `E · location` hint there; small screens hide that floating hint and use a 56x46px rectangular `Click` button in the existing bottom control shelf. The large circular “互动” button was removed.
- Browser-tested at desktop, 390x844 portrait and 844x390 landscape with no console warnings/errors.

Context for whoever (Codex or future me) picks this up next.

## What was done this session

1. **Wired the generated art into the renderer.** `game.js` already
   loaded four images via `ART = {...}` (`assets/art/town-map.png`,
   `player-sprites.png`, `interior-atlas.png`, `npc-sprites.png`) but
   only `player-sprites.png` was ever actually drawn — the other three
   were dead weight, and the town/interiors/NPCs were all flat
   `ctx.fillRect` placeholders. Fixed:
   - `drawTown()` now draws `town-map.png` as the background
     (`drawCover()` helper, cover-fit scale to the 960x540 canvas).
     Falls back to the old flat-color town if the image hasn't loaded.
   - `drawBuilding()` no longer paints a solid color box over the art;
     it draws a small label pill (icon + name) above each building's
     door, highlighted yellow + a glow ring when the player is in
     interact range. Falls back to the old colored-box style when art
     isn't loaded.
   - `drawInterior()` draws the matching cell out of
     `interior-atlas.png` (5 cols x 2 rows) using `INTERIOR_PANELS`,
     which was already correctly mapped in the code before this
     session — it just wasn't being read anywhere.
   - `drawNPC()` draws the matching character out of `npc-sprites.png`
     (9 cols x 2 rows, `NPC_COLUMNS`) with a 2-frame idle animation,
     same deal — the mapping already existed, wasn't used.
   - Added two small helpers: `drawCover()` (cover-fit crop, used for
     the town background and interior panels) and `drawSpriteCell()`
     (grid-cell sprite draw with contain-fit sizing, used for NPCs).
   - `ctx.imageSmoothingEnabled` flipped from `false` to `true` — the
     art is painterly/high-res, not literal 1x pixel art, so smoothing
     looks correct when it's scaled down into the canvas.
   - Verified with a Playwright smoke test (headless Chromium):
     background art renders, building labels appear, entering a
     building shows the interior atlas art, zero console errors.

2. **Removed the 3-house choice, per explicit user request** ("我觉得
   房间不用三选一 就一个 不用换地方" — no house selection, just one
   fixed home). Changes:
   - `HOUSES` collapsed from 3 entries (`far`/`center`/`quiet`) to one:
     `{ id: "home", name: "你的小窝", rent: 220, sleep: 20, ... }` —
     kept at the old "center" building's position/rent, sleep bumped
     from 15→20 since there's no longer a trade-off to justify the
     noisy-apartment penalty.
   - `#house-screen` removed from `index.html`, its CSS removed from
     `styles.css`, `renderHouseOptions()` deleted from `game.js`.
   - `restart()` now calls `selectHouse(HOUSES[0].id)` directly instead
     of routing through the house-selection screen — flow is title →
     tutorial → town, no detour.
   - `INTERIOR_PANELS` had three separate house-interior cells
     (`far`/`center`/`quiet` → 3 of the 5 bottom-row atlas panels).
     Collapsed to one `home: [3, 1]` (reused the "center" apartment
     cell, matches the new fixed house's position/art).
   - The other two house illustrations (shabby cabin, garden cottage)
     are still visible in `town-map.png` since it's one static painted
     scene — they're just inert scenery now, not interactive. That's
     harmless but worth knowing if you're ever asked to reduce visual
     clutter or re-theme the town art.

## Round 2: walkability, labels, street lamps

User feedback: "走路不顺 不是每一个地方可以去" (walking is rough, can't
reach every place), "字好小 看不到地方名字" (labels too small to read),
"天黑了 路灯可以亮起来啊" (street lamps should light up at night).

**The walkability bug was real and specific.** The old footprints were
laid out for the pre-art placeholder town and didn't match the painted
one. Worse, `回报研究所`'s door (bottom-center of its box) had the
`包好运杂货铺` box sitting directly beneath it, so there was no open
ground within the 46px interact radius — that door was flat-out
unreachable, plus several near-zero-width gaps elsewhere made movement
feel like threading a needle.

Fixes:

- **Footprints now trace the painted buildings.** I generated a
  coordinate-grid overlay on `town-map.png` (resized to the canvas's
  960x540) to read real positions off the art instead of guessing.
  Boxes are deliberately a bit *shorter* than the painted buildings so
  two clean streets stay open: **lane A at y 177-200** (in front of the
  top row) and **lane B below y 337**. Both run the full width, and
  vertical connectors at x≈210-395, x≈540-600 and x≈787-812 join them.
  If you move any building, re-check those lanes.
- **Reachability is verified by flood-fill, not by eye.** There's a
  throwaway script pattern worth repeating: parse `BASE_BUILDINGS` /
  `HOUSES` / `BOARD` out of `game.js`, replicate `isBlocked()`, BFS the
  walkable grid from the player's spawn, then assert every door is
  within its interact radius of a reachable cell. Current result: all 9
  interaction points OK, and `open cells == reachable cells` (zero
  isolated pockets). Re-run that after any layout change.
- **Labels**: font 12px → 17px, opaque pill with a border, and moved
  from *above* the building to the street *in front of* the door
  (`door.y + 24`). Above didn't work once footprints matched the art —
  the top row starts at y=8, so their labels were clipped off-screen
  and collided with the rent-warning banner.
- **Walk speed** 116 → 152 px/s. The map is 960px wide and a month is
  only 5 real minutes; the old speed made crossing it a chore.
- **Street lamps light up at night** — `LAMP_SPOTS` + `drawLampGlow()`
  paint radial glows at the lamp posts painted into the art (positions
  are eyeballed from the art, roughly right rather than pixel-exact;
  the 26px glow radius is forgiving). Only drawn in the `night` phase,
  on top of the dark tint.

**Also fixed the board mismatch noted below:** `BOARD = {x:572, y:250}`
is now the single source of truth for both the hotspot and the label,
placed at the bulletin board that's actually painted into the art
(previously the hotspot was at (570,286) while the box was drawn at
x≈802-898 — two different places).

## Round 3: the "stuck outside a building" bug

User report: after leaving 摸鱼有限公司 they could not move. Real bug,
and the cause is worth remembering because it is easy to reintroduce.

`leaveInterior()` placed the player at a fixed `door.y + 28`, i.e. 36px
below the building's base. Lane A was only 23px tall, so that offset
overshot the street entirely and landed the player **inside the
collision box of the building on the other side of the lane** —
月底食堂 below 摸鱼有限公司, and 包好运杂货铺 below 回报研究所 (the
only two buildings stacked that way). `movePlayer()` tests each axis
against the *destination*, so from inside a box every direction that
stays inside is rejected: down/left/right did nothing and only "up"
worked. That reads exactly like being stuck.

Fixes:

- `standingSpot(building)` replaces every hardcoded exit/spawn offset.
  It steps outward from the door until it finds a spot that isn't
  blocked, so a layout change can no longer strand the player. Used by
  `leaveInterior()` and by `homeSpawn()` (which now feeds
  `createInitialState()`, `resetMonthlyState()` and `saveCheckpoint()`
  — those three had the same offset copy-pasted).
- Lanes widened so the geometry isn't knife-edge: top row `h` 157→145
  and middle row `y` 210→225, which turns lane A from 23px into
  **y 165-215 (50px)**. Lane B is below y 349.
- `isBlocked()` split into `isTownBlocked()` (pure geometry) plus the
  scene check. `standingSpot()` runs while the initial state is being
  built, before `state` exists, so it must not touch `state.scene` —
  the first version did and crashed the game on load with
  `Cannot read properties of null (reading 'scene')`.
- `buildingList()` now reads `HOUSES[0]` instead of
  `state.houseId`, for the same before-`state`-exists reason.

## Round 4: sprite bleeding, and a tighter wall margin

**"动起来还有别人的手脚"** — stray arms and feet appearing on the
walking character. Real, and it was in the assets, not the code.

Both generated sheets packed their frames edge to edge:

- `player-sprites.png` — the row 2 / row 3 boundary had **zero**
  transparent pixels between frames, and the other boundaries only 2-3.
- `npc-sprites.png` — worse: **all 18** frames touched a cell edge and
  several characters spanned their entire cell, overlapping neighbours.

The game scales a ~222px cell down to 58px, so bilinear sampling at the
cell border reads ~4 source pixels and drags in whatever sits next
door — the neighbouring frame's shoes appear on top of the character's
head.

`scripts/repack-sprites.py` rebuilds both sheets: connected-component
labelling finds each character's true extent (so a prop or an
outstretched arm crossing the grid line stays with its owner, and a
neighbour's arm is excluded), regions that span cells because two
characters actually touch get cut back at the grid line, and every
frame is re-emitted alone in a square cell with a wide transparent
margin, bottom-aligned on a shared baseline (the originals drifted
sideways across a row, which showed as the character sliding while
animating). Originals are preserved as `*-original.png`; re-run it any
time the art is regenerated. Result: 0 of 50 frames touch a cell edge.

While in there: `rows = { down: 0, left: 1, right: 2, up: 3 }` was
checked rather than assumed — measuring where the face sits relative to
the head's centre confirms row 1 really does face left and row 2 right,
so no mirroring is needed. Don't "fix" it by eye; at 58px the two side
views look alike.

**Wall margin 10px → 3px** (`WALL_MARGIN`). The old margin was an
invisible band in the open pavement beside every building, which reads
as an invisible wall — the player stops well short of the wall they can
see. Dropping it grew the walkable area from 72,772 to 80,240 cells
(~10%) with every door still reachable.

`scripts/collision-map.png` renders the solid areas (red), doors
(green) and the board (blue) over the town art — regenerate it when the
layout changes, it answers "why can't I walk here" instantly. Note it
also shows what is *not* solid: the painted cabin and the green cottage
next to 你的小窝 are scenery only, so the player walks straight through
them. Left that way deliberately (the complaint has consistently been
too little walkable space, not too much), but it is inconsistent and
worth a decision if the art is ever revisited.

## Round 5: the repack was wrong twice, and invisible purchase feedback

### Sprite bleeding, properly this time

Round 4's repack did not fix it — the user still saw a stranger's arm and
leg beside the bank clerk. Two separate mistakes, both worth knowing:

1. **Cropping the bounding box copies whatever else is in it.** I found
   each character by connected region, then `crop()`ed its bounding
   *rectangle*. A neighbour's outstretched arm that overlaps that
   rectangle comes along for the ride. `frames_for()` now returns a
   per-cell boolean **mask**, and the extract clears alpha outside it, so
   foreign pixels cannot survive regardless of how the boxes overlap.
2. **"Mostly in one cell" is not a safe test for fused characters.**
   The first rule split any region that wasn't ≥85% inside one cell.
   But these characters are drawn *larger than their cell* (296px art in
   a 241px cell), so one person legitimately sits ~70/30 across a cell
   line — and splitting them handed the 30% offcut to the neighbouring
   frame. That is literally what put an arm and a leg next to the bank
   clerk. A region is now only treated as two fused characters when it is
   more than 1.6x the median character's width or height, which is the
   real signal (the player sheet's rows 2/3 touch and measure ~2x).

Also switched the region labelling to 8-connected; with 4-connectivity a
diagonal join reads as a break, which shatters anti-aliased outlines into
fragments that then get filed under the wrong cell.

Verify with the detached-fragment check rather than by eye: for each
repacked cell, label the regions and flag any region ≥150px whose centre
is far from the main mass. It goes to NONE on the player sheet. The NPC
sheet still reports a few on purpose — those are the characters' own
props (the chef's flying food, the wizard's orb, the kid's cards), so
read the rendered sheet before "fixing" them.

### Purchases gave no feedback

"购买的时候记得提示，我都不懂我买了道具没有". The confirmation already
existed — `buyLuckItem()` has always called `showToast()`. It was just
**invisible**: `.toast` sat at `z-index: 70` under `.modal-layer`'s 100,
and every purchase, deposit, sale and tool use happens inside a modal.

Raising the z-index alone did **not** work, which is the interesting
part: `#toast` lived inside `#game-screen`, and `.screen` is
`position: fixed`, which creates its own stacking context — so the
toast's z-index only ever competed with its siblings inside that
context, never with the modal layer. The element had to move out to be a
sibling of `#modal-layer` in `index.html`. It only *looked* like it
worked at `top: 94px` because the toast happened to sit above the
modal's top edge; moving it down revealed it was behind the whole time.
If you ever need something to paint over a modal, put it outside
`#game-screen`.

The shop also now states the situation instead of leaving the player to
infer it: a status strip (wallet / backpack slots used / current luck)
and per-card states — `已拥有` for owned items, dimmed `钱不够` for ones
you cannot afford.

## Testing notes

**Run `node scripts/check-layout.js` after any layout change.** It
parses the real coordinates out of `game.js`, replicates `isBlocked()`
and the axis-separated stepping from `movePlayer()`, and asserts that
no spawn sits inside a box, that every interaction point is walkable-to
from every spawn, and that there are no isolated pockets.

Note its limitation: it reimplements the collision rules rather than
importing them, so it will happily pass while the real game crashes —
that is exactly what happened with the `state.scene` null bug above.
Pair it with a browser run. The end-to-end check that actually caught
things used `#interaction-hint` as a position oracle (it reads
`按 E · 建筑名` when you're at a door), so a test can walk to each
building, enter, exit, then assert the hint *clears* when walking away
— that last assertion is the one that catches a stuck player, and it
needs no changes to game code. Drive it with a fresh page per building;
routes that chain from one building to the next drift and give false
failures.

`page.clock.fastForward()` does **not** advance this game's month
timer. The countdown comes from rAF deltas via `performance.now()`,
clamped to 0.04s per frame, so virtual-clock tricks don't move it — to
see sunset/night you have to let it run in real time (sunset at
<=200s left, night at <=100s left, out of 300s).

`page.clock.fastForward()` does **not** advance this game's month
timer. The countdown comes from rAF deltas via `performance.now()`,
clamped to 0.04s per frame, so virtual-clock tricks don't move it — to
see sunset/night you have to let it run in real time (sunset at
<=200s left, night at <=100s left, out of 300s).

## Files touched

- `game.js` — art wiring (drawTown/drawBuilding/drawBoard/drawInterior/
  drawNPC/drawPixelPerson helpers), HOUSES/INTERIOR_PANELS collapse,
  restart()/init() cleanup.
- `index.html` — removed `#house-screen` section.
- `styles.css` — removed `.house-screen`/`.setup-*`/`.house-*` rules.

## Not done / possible next steps

- `art-direction/*.png` (the 8 mood-board images) are still just
  reference art, not used by the game — that's intentional, they were
  never meant to be loaded at runtime.
- No alignment pass was done to nudge `BASE_BUILDINGS`/`HOUSES`
  pixel coordinates to sub-pixel-match the painted buildings in
  `town-map.png` — they already lined up closely enough (see building
  label positions in the screenshots taken during testing) that it
  wasn't necessary, but if you look closely some door/label positions
  sit a little off-center from the painted building. Minor polish, not
  a bug.

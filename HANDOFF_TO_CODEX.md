# Handoff: art wiring + single-home simplification (Claude, 2026-09-16)

## Codex thief sprite pass (2026-09-20)

- Added `assets/art/thief-sprites.png`, a transparent 8×4 sheet (1776×888; exact 222px cells) matching the game's high-detail pixel-art characters.
- Rows are down, left, right, up. Column 0 is alert idle, columns 1–6 are the chase run, and column 7 is a recoiling spotted pose with a red `!` contained in the cell.
- `drawThieves()` now selects all four facing rows, uses column 7 during `spotted`, and no longer darkens the real thief artwork. The old darkened part-time NPC and canvas-drawn `!` remain only as a load/error fallback.

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

## Round 6: card variety and a real draw ceremony (Claude, 2026-09-17)

User feedback: "卡牌的种类太少了 / 抽卡但是玩家没有抽卡的仪式 / 一开始游戏就已经
打开牌 没有期待感 / 多点情景 多点搞笑的".

### The draw had no draw in it

Every pool rendered its result face-up the instant its modal opened, so "抽卡" was
really a receipt. `runCardDraw()` (in `game.js`, just above `cardMarkup`) replaces
that for fate, food, entertainment and the part-time board: three cards face down,
the player picks one blind, it flips, and the two they *didn't* take are shown
dimmed under "差点抽到" — the near miss is most of the fun, so it is displayed
rather than discarded. The pick is genuine: all three candidates are drawn from the
same luck-weighted pool up front, so choosing is real, just blind.

The lucky shop deliberately still shows its three items face-up. It is a purchase
screen, not a draw — you are spending money and must see what you are buying.

### Content

- `FATE_CARDS` 12 -> **48** (16 good / 16 bad / 16 choice)
- `FOODS` 6 -> 14, `FUN_CARDS` 5 -> 12, `PART_TIME` 5 -> 12, `TEMP_TOOLS` 7 -> 12

The original twelve fate ids are untouched — they own the illustrations in
`card-art-main.png` and appear in players' saved collections. **New cards have no
atlas cell and fall back to their emoji** inside the same frame, which reads fine
but is visually distinct from the illustrated ones. If new art is ever generated,
`card-art-main.png` is 6x6 and full; a third sheet plus a `CARD_ART` entry per id is
the path, and the grid rules in `HANDOFF_TO_CLAUDE.md` still apply.

All new effects reuse existing state fields (wallet/bank/debt/motivation/luck/
remainingSec/rentDiscount/bankRate/speedBonus/sleepBonus/freeFood) — no new flags,
so `resetMonthlyState()` and the checkpoint format did not change.

### Layout fallout from longer names, and how it was caught

Longer Chinese names broke two things that only showed up under measurement:

1. **Collection thumbnails.** Nine-character titles wrap to two lines and pushed
   content to 141px inside a 136px card, spilling `.card-meta` outside the frame.
   Fixed by hiding `.card-meta` on `.collection-card` — the handoff already allows
   thumbnails to omit body chrome, and an unlocked card is visibly unlocked without
   a "已收集" footer. Not by shrinking fonts.
2. **The revealed card on a 390px-tall screen.** `aspect-ratio: 4/5` derives height
   from width, so a long effect line has nowhere to go and spills out of the frame.
   Under `@media (max-height: 470px)` the revealed card drops the fixed ratio and
   sizes to its text; that block also hides the blurb and the 差点抽到 row, which
   otherwise push the confirm button below the fold.

**Two QA traps worth repeating.** First, a card-layout check that opens the
collection *without seeding* `aiyaMonthEndGame_collection_v1` renders 115 identical
"尚未发现" placeholders and passes trivially — seed the keys, then assert
`placeholders === 0` before trusting the result. Second, one sample is not enough:
the revealed card is random, so the landscape overflow appeared in roughly three
runs out of five. Loop the draw several times before calling it fixed.

### Verified

`node --check game.js`; `node scripts/check-layout.js` (100% coverage, all
destinations reachable); all four draw points driven end to end in a browser (fate,
food, entertainment, part-time — each showing 3 backs, 0 face-up, a flip, and the
dodged pair); all **115** cards measured for clipping/spill/divider collision at
1280x800, 390x844 and 844x390 — clean; the draw ceremony sampled six times at both
phone sizes with no overflow and the confirm button on screen. No console errors.

### Note on parallel edits

`styles.css` was overwritten twice mid-session, losing the draw-ceremony block both
times. It now lives **at the end of the file** so it survives the cascade. If the
card backs ever render as small plain buttons, that block has been dropped again —
check for `.card-back` in `styles.css` first.

## Round 7: nameplate over the building you're standing at (Claude, 2026-09-17)

User request: "到了一个地方 屋子上就跳出那个屋子的名字".

`drawNameplate()` in `game.js` pops a yellow plate with a downward tail over the
roof of whichever place `findNearbyTarget()` currently returns, easing up into
position over ~190ms. It is drawn dead last in `drawTown()`, after the night tint
and after the player, so it never gets dimmed or covered.

Two things worth keeping:

- **It is the only place label on small screens.** The street signposts are hidden
  under 850px, so before this there was no on-map indication of what you had walked
  up to — only the footer/`Click` affordance. Don't gate the nameplate behind the
  same media query.
- **The active building's street signpost is suppressed** (`!compactMobile && !near`
  in `drawBuilding`/`drawBoard`), otherwise the name renders twice, once above the
  roof and once in the street.

The plate is clamped with `Math.max(target.topY - 18, height / 2 + 10)` so the
top-row buildings (which start at y=8) keep it on canvas instead of drawing it off
the top edge. The mobile camera pans the canvas *element* via CSS `left`, not a
canvas transform, so world coordinates are correct on phones with no extra work.

Verified: `node --check`, `node scripts/check-layout.js`, plate appears over 你的小窝
and 月底食堂 and clears on walking away, at desktop and 390x844; card QA still clean
across all 115 cards at three sizes; no console errors.

## Round 8: rent banner removed, duplicate place names collapsed (Claude, 2026-09-17)

User: "这个不用展示出来了 挡住了" about the red `银行余额不足以支付本月房租`
banner, which was `position: fixed` at the top of the map and sat right on top of the
稳稳银行 / 涨跌交易所 labels.

The banner element, its CSS and the `#rent-warning` toggle are gone. The warning
itself still matters — rent is deducted from the **bank**, not the wallet, and a
shortfall turns into debt — so it moved into the HUD where it costs no space:
`.hud-stat.bank` gets a `short` class (red border//icon/value) and `#bank-label`
gets a title tooltip naming the amount. Don't reintroduce a floating banner.

While verifying, the place name was rendering **three times** at once: Codex's top
location chip mirrored `nearbyTarget.label`, the new roof nameplate showed it, and
the footer hint showed `E · name`. The chip now stays on `月底小镇` outdoors and
hides entirely while a nameplate is up; indoors it still names the room (there is no
roof to hang a plate on in an interior). The chip element and its styling are
otherwise untouched.

Verified at desktop and 390x844: banner absent from the DOM, bank tile flags the
shortfall, chip hides at a building and returns to 月底小镇 when you walk off, names
the room indoors. `node --check`, `check-layout`, the fate draw, the 115-card layout
QA and the phone draw sampling all still pass with no console errors.

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

## 2026-09-20 — 杂货铺改成「永久 / 一次性」两个货架

游戏这边改好了，art 只有一处要你帮忙（见最后）。

**永久物品**（背包 3 格，可半价卖回）：转运项链 $280 幸运+10 · 飞毛腿跑鞋 $300 走路快18% ·
软底舒服袜 $240 走路省30%动力 · 保温饭盒 $260 每餐多回35% · 阿嬷的药油 $220 睡觉多回10 ·
铜钱串 $320 银行利息+3% · 招财猫 $460 每月自动进账$90。

**一次性物品**（买了留到用，不再月底清空）：防身喷雾 $150 · 提神饮料 $90 · 三合一咖啡 $60 ·
巴士票 $70 · 转运手绳 $80 · 幸运硬币 $140 · 计算器 $120 · 免费餐券 $130 ·
市场小道消息 $180 · 超级闹钟 $90 · 抄近路地图 $110。

图鉴分类跟着改名：`工具卡` → `一次性物品`，`幸运物品` → `永久物品`。

**兼职**不再送工具了，改成「钱 + 一只股票的内幕」。内幕是真的：每个月月初先把 5 只股票
这个月的涨跌 roll 出来存进 `state.pendingStock`，月底原样套用，所以工友说「会大涨」它就真的会涨。
`scripts/check-stock-tips.js`（纯逻辑，跑 10000 个 stock-month）和
`scripts/check-shop-flow.js`（真的开浏览器玩一个月）在看着这件事，别绕过它们。

**房租**先扣银行，不够再扣钱包，还不够才变债务。房租每月涨 $35（第12月 $605），
工资砍了约 20%，股票涨跌改成对称的。

**要画的图**（目前借用别人的图凑合）：
- `luck:shoes` — 飞毛腿跑鞋（永久版），现在借 `tool:shoes` 的图
- `luck:lunchbox` — 保温饭盒，现在借 `tool:meal`（免费餐券）的图
- `luck:necklace / socks / potion / coincharm / cat` 已经有图，但名字换了：
  socks 现在叫「软底舒服袜」、potion 叫「阿嬷的药油」、coincharm 叫「铜钱串」、cat 叫「招财猫」，
  如果现有图对不上意思，可以重画。

规矩不变：图上不要写字，不要国旗，沿用原来的色盘。

# Handoff to Claude Code — 《哎呀，又月底了呀》

Updated: 2026-09-17

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

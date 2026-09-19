"""Regenerate ROAD_MASK in game.js from the town art.

Walkability used to be a set of hand-placed rectangles, one per building. They were
drawn around each building *plus* its garden, planters and steps, so every road came
out narrower than it looks and a few gaps between buildings became dead ends you could
walk into but not out of. Reading the art directly removes the guesswork: a cell is
walkable only where the picture actually shows road or plaza paving.

How the classification works:
  * road    - dark asphalt: low saturation, mid brightness
  * paving  - the light tan plaza: low saturation, bright, warm (r >= g >= b)
  * leaves  - greenery. A palm's fronds are overhead, so you walk *under* them; the
              same reads fine for hedges and planters. Blocking canopies made the
              plaza feel like a maze of invisible posts.
  * a morphological close fills the small holes punched by planters, benches and
    manhole covers, so the plaza reads as one continuous surface
  * only the largest connected region is kept, which drops roof tiles and sand that
    happen to match the paving colour but are nowhere near a road
  * finally the top of each solid run is freed: these buildings are drawn with the
    roof rising above the footprint, so blocking the roof as well made it jut up into
    whatever road passes behind the building

Usage:  python scripts/build-road-mask.py           # print the JS literal
        python scripts/build-road-mask.py --check   # report cell counts only

After pasting, ALWAYS run: node scripts/check-layout.js
"""

import os
import sys
from collections import deque

import numpy as np
from PIL import Image

ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "art", "town-map-v2.png")
SCENE_W, SCENE_H = 960, 540
CELL = 6

# The town sits inside a frame of scenery: sky and mountains along the top, sea and
# beach in two corners. Greenery there must not turn walkable just because leaves are,
# so these areas are excluded before anything else is classified.
EDGES = [(0, 0, 960, 108), (0, 376, 232, 164), (876, 0, 84, 208)]

# How many cells of roof to open at the top of each solid run.
ROOF_TRIM = 4


def dilate(mask, k=1):
    out = mask.copy()
    for dy in range(-k, k + 1):
        for dx in range(-k, k + 1):
            out |= np.roll(np.roll(mask, dy, 0), dx, 1)
    return out


def erode(mask, k=1):
    return ~dilate(~mask, k)


def road_mask():
    image = Image.open(ART).convert("RGB").resize((SCENE_W, SCENE_H), Image.LANCZOS)
    pixels = np.array(image).astype(int)
    cols, rows = SCENE_W // CELL, SCENE_H // CELL

    walkable = np.zeros((rows, cols), dtype=bool)
    # Proper ground, as opposed to hedges and roof edges you may pass through but
    # nobody would choose to stand in. Thieves are only ever placed on this.
    paved = np.zeros((rows, cols), dtype=bool)
    for gy in range(rows):
        for gx in range(cols):
            cx, cy = gx * CELL + CELL // 2, gy * CELL + CELL // 2
            if any(ex <= cx < ex + ew and ey <= cy < ey + eh for ex, ey, ew, eh in EDGES):
                continue
            block = pixels[gy * CELL:(gy + 1) * CELL, gx * CELL:(gx + 1) * CELL].reshape(-1, 3)
            r, g, b = np.median(block, axis=0)
            high, low = max(r, g, b), min(r, g, b)
            saturation = 0 if high == 0 else (high - low) / high
            road = saturation < 0.20 and 105 < high < 185
            paving = saturation < 0.34 and high >= 185 and r >= g >= b
            leaves = g > r + 10 and g > b + 10 and 60 < g < 210
            walkable[gy, gx] = road or paving or leaves
            paved[gy, gx] = road or paving

    closed = erode(dilate(walkable, 2), 2)
    for ex, ey, ew, eh in EDGES:
        closed[ey // CELL:(ey + eh + CELL - 1) // CELL, ex // CELL:(ex + ew + CELL - 1) // CELL] = False

    seen = np.zeros_like(closed)
    largest = []
    for sy in range(rows):
        for sx in range(cols):
            if not closed[sy, sx] or seen[sy, sx]:
                continue
            queue = deque([(sy, sx)])
            seen[sy, sx] = True
            region = []
            while queue:
                y, x = queue.popleft()
                region.append((y, x))
                for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                    if 0 <= ny < rows and 0 <= nx < cols and closed[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        queue.append((ny, nx))
            if len(region) > len(largest):
                largest = region

    result = np.zeros_like(closed)
    for y, x in largest:
        result[y, x] = True

    # Free the roof: walk each column, and for every solid run that is not part of the
    # scenery frame, open the first few cells so only the building's body blocks.
    trimmed = result.copy()
    for gx in range(cols):
        gy = 0
        while gy < rows:
            cx, cy = gx * CELL + CELL // 2, gy * CELL + CELL // 2
            framed = any(ex <= cx < ex + ew and ey <= cy < ey + eh for ex, ey, ew, eh in EDGES)
            if result[gy, gx] or framed:
                gy += 1
                continue
            start = gy
            while gy < rows:
                cy = gy * CELL + CELL // 2
                if result[gy, gx] or any(ex <= cx < ex + ew and ey <= cy < ey + eh for ex, ey, ew, eh in EDGES):
                    break
                gy += 1
            run = gy - start
            if run >= 3:
                for k in range(min(ROOF_TRIM, run // 3 + 1)):
                    trimmed[start + k, gx] = True
    # 0 solid, 1 passable but not real ground (hedges, roof edge), 2 road or paving
    return np.where(trimmed, np.where(paved, 2, 1), 0)


if __name__ == "__main__":
    mask = road_mask()
    rows, cols = mask.shape
    print(f"// {cols}x{rows} cells of {CELL}px, {int((mask > 0).sum())} walkable, "
          f"{int((mask == 2).sum())} of them real road", file=sys.stderr)
    if "--check" in sys.argv:
        sys.exit(0)
    print(f"  const ROAD_CELL = {CELL};")
    print("  const ROAD_MASK = [")
    # 0 solid, 1 passable, 2 road or paving
    rowsOut = ["    \"%s\"" % "".join(str(int(mask[y, x])) for x in range(cols)) for y in range(rows)]
    print(",\n".join(rowsOut))
    print("  ];")

"""Regenerate ROAD_MASK in game.js from the town art.

Walkability used to be a set of hand-placed rectangles, one per building. They were
drawn around each building *plus* its garden, planters and steps, so every road came
out narrower than it looks and a few gaps between buildings became dead ends you could
walk into but not out of. Reading the art directly removes the guesswork: a cell is
walkable only where the picture actually shows road or plaza paving.

How the classification works:
  * road    - dark asphalt: low saturation, mid brightness
  * paving  - the light tan plaza: low saturation, bright, warm (r >= g >= b)
  * a morphological close fills the small holes punched by planters, benches and
    manhole covers, so the plaza reads as one continuous surface
  * only the largest connected region is kept, which drops roof tiles and sand that
    happen to match the paving colour but are nowhere near a road

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
    for gy in range(rows):
        for gx in range(cols):
            block = pixels[gy * CELL:(gy + 1) * CELL, gx * CELL:(gx + 1) * CELL].reshape(-1, 3)
            r, g, b = np.median(block, axis=0)
            high, low = max(r, g, b), min(r, g, b)
            saturation = 0 if high == 0 else (high - low) / high
            road = saturation < 0.20 and 105 < high < 185
            paving = saturation < 0.34 and high >= 185 and r >= g >= b
            walkable[gy, gx] = road or paving

    closed = erode(dilate(walkable, 2), 2)

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
    return result


if __name__ == "__main__":
    mask = road_mask()
    rows, cols = mask.shape
    print(f"// {cols}x{rows} cells of {CELL}px, {int(mask.sum())} walkable", file=sys.stderr)
    if "--check" in sys.argv:
        sys.exit(0)
    print(f"  const ROAD_CELL = {CELL};")
    print("  const ROAD_MASK = [")
    print(",\n".join('    "%s"' % "".join("1" if mask[y, x] else "0" for x in range(cols)) for y in range(rows)))
    print("  ];")

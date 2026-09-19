"""Regenerate WATER_MASK in game.js from the town art.

Walkability used to be "anywhere that isn't inside a building box", which let the
player stroll across the sea, the pier and the skyline. This reads the art and marks
every 12px cell whose median colour is water or sky, then prints the literal to paste
into game.js.

Only water/sky is classified. Foliage is deliberately left walkable: planters, hedges
and street trees are scattered right across the plaza, and blocking them riddles the
map with holes and traps the player. The two shorelines and the sky band are brown and
grey rather than blue, so they are handled by OFF_LIMITS rectangles in game.js instead.

Usage:  python scripts/build-water-mask.py          # print the JS literal
        python scripts/build-water-mask.py --check  # just report cell counts

After pasting, ALWAYS run: node scripts/check-layout.js
"""

import os
import sys

import numpy as np
from PIL import Image

ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "art", "town-map-v2.png")
SCENE_W, SCENE_H = 960, 540
CELL = 12


def water_mask():
    image = Image.open(ART).convert("RGB").resize((SCENE_W, SCENE_H), Image.LANCZOS)
    pixels = np.array(image).astype(int)
    cols, rows = SCENE_W // CELL, SCENE_H // CELL
    mask = np.zeros((rows, cols), dtype=bool)
    for gy in range(rows):
        for gx in range(cols):
            block = pixels[gy * CELL:(gy + 1) * CELL, gx * CELL:(gx + 1) * CELL].reshape(-1, 3)
            r, g, b = np.median(block, axis=0)
            # Blue-dominant and bright enough: sea, pool water, sky.
            mask[gy, gx] = b > r + 22 and b > 105
    return mask


if __name__ == "__main__":
    mask = water_mask()
    rows, cols = mask.shape
    print(f"// {cols}x{rows} cells of {CELL}px, {int(mask.sum())} blocked", file=sys.stderr)
    if "--check" in sys.argv:
        sys.exit(0)
    print(f"  const WATER_CELL = {CELL};")
    print("  const WATER_MASK = [")
    lines = ["    \"%s\"" % "".join("1" if mask[y, x] else "0" for x in range(cols)) for y in range(rows)]
    print(",\n".join(lines))
    print("  ];")

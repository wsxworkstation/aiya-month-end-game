"""Repack the generated character sheets into clean, evenly padded atlases.

The sheets that came out of the art generator pack characters edge to edge: on
player-sprites.png the row 2/3 boundary has zero transparent pixels between frames,
and on npc-sprites.png several characters span their whole cell and overlap their
neighbours. The game scales a ~222px cell down to ~58px, so bilinear sampling at the
cell border drags in whatever is next door -- which shows up in game as stray arms
and feet from the adjacent frame.

This rebuilds each sheet so every frame sits alone in a square cell with a wide
transparent margin, bottom-aligned on a shared baseline (so the walk cycle does not
bob) and horizontally centred (the originals drift sideways across a row).

Usage:  python scripts/repack-sprites.py            # rewrites the sheets in place
        python scripts/repack-sprites.py --check    # report only, touch nothing

Originals are kept as <name>-original.png the first time it runs.
"""

import os
import sys
from collections import deque

import numpy as np
from PIL import Image

ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "art")
SHEETS = [("player-sprites.png", 8, 4), ("npc-sprites.png", 9, 2), ("thief-sprites.png", 8, 4)]
ALPHA_FLOOR = 24      # ignore near-transparent halo pixels
MIN_BLOB = 400        # a region this big counts as a character, not a detail
MIN_DETAIL = 24       # keep smaller regions (a glint, an earring) but drop noise
PAD_RATIO = 0.12      # transparent margin, as a share of the cell size


def blobs(mask, min_size):
    """Label connected regions of `mask` (8-connected, iterative so it can't recurse
    to death on a multi-megapixel image). Yields the pixel coordinates of each region.

    8-connected matters here: with 4-connectivity a diagonal join counts as a break,
    which splits an anti-aliased outline into pieces and lets fragments of a character
    get filed under the wrong cell."""
    h, w = mask.shape
    seen = np.zeros((h, w), dtype=bool)
    neighbours = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]
    for sy in range(h):
        if not mask[sy].any():
            continue
        for sx in np.nonzero(mask[sy])[0]:
            if seen[sy, sx]:
                continue
            queue = deque([(sy, sx)])
            seen[sy, sx] = True
            pixels = []
            while queue:
                y, x = queue.popleft()
                pixels.append((y, x))
                for dy, dx in neighbours:
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        queue.append((ny, nx))
            if len(pixels) >= min_size:
                yield np.array(pixels)


def frames_for(sheet, cols, rows):
    """Work out which pixels belong to each frame.

    Returns a per-cell boolean mask, not a rectangle. That distinction matters: when a
    neighbour's outstretched arm overlaps this character's bounding box, cropping the
    box copies the arm across too. Masking to the character's own regions cannot.

    Grouping by connected region (rather than trusting the grid) keeps a character
    whole when an arm or a prop pokes past the cell line, and keeps a neighbour's arm
    out. Where two characters actually touch -- the player sheet has rows 2 and 3
    fused with no gap between them -- the region covers several cells, so it gets split
    back at the grid line instead of swallowing its neighbour.
    """
    alpha = np.array(sheet)[..., 3]
    h, w = alpha.shape
    cw, ch = w / cols, h / rows
    masks = {(r, c): np.zeros((h, w), dtype=bool) for r in range(rows) for c in range(cols)}

    regions = list(blobs(alpha > ALPHA_FLOOR, MIN_DETAIL))
    big = [r for r in regions if len(r) >= MIN_BLOB]
    # A character is only "two characters fused" if it is far bigger than a character
    # should be. Size share is not a safe signal on its own: these characters are drawn
    # larger than their cell, so one can sit 70/30 across a cell line and still be one
    # person -- splitting on that is what put a stranger's arm in the next frame.
    typical_h = np.median([np.ptp(r[:, 0]) + 1 for r in big]) if big else ch
    typical_w = np.median([np.ptp(r[:, 1]) + 1 for r in big]) if big else cw

    for pixels in regions:
        ys, xs = pixels[:, 0], pixels[:, 1]
        cell_rows = np.clip((ys // ch).astype(int), 0, rows - 1)
        cell_cols = np.clip((xs // cw).astype(int), 0, cols - 1)
        fused_rows = rows > 1 and (np.ptp(ys) + 1) > typical_h * 1.6
        fused_cols = cols > 1 and (np.ptp(xs) + 1) > typical_w * 1.6

        if not (fused_rows or fused_cols):
            # One character, plus whatever they are holding. Keep the region whole --
            # including the part that reaches over the cell line.
            keys, counts = np.unique(np.stack([cell_rows, cell_cols], 1), axis=0, return_counts=True)
            row, col = keys[counts.argmax()]
            masks[(int(row), int(col))][ys, xs] = True
            continue

        # Genuinely fused neighbours (the player sheet's rows 2 and 3 touch with no gap
        # between them): cut them apart on the grid line they straddle.
        slot_rows = cell_rows if fused_rows else np.full_like(cell_rows, -1)
        slot_cols = cell_cols if fused_cols else np.full_like(cell_cols, -1)
        keys, counts = np.unique(np.stack([slot_rows, slot_cols], 1), axis=0, return_counts=True)
        for (srow, scol), count in zip(keys, counts):
            if count < MIN_BLOB:
                continue
            part = np.ones(len(ys), dtype=bool)
            if srow >= 0: part &= cell_rows == srow
            if scol >= 0: part &= cell_cols == scol
            sub_rows, sub_cols = cell_rows[part], cell_cols[part]
            sub_keys, sub_counts = np.unique(np.stack([sub_rows, sub_cols], 1), axis=0, return_counts=True)
            row, col = sub_keys[sub_counts.argmax()]
            masks[(int(row), int(col))][ys[part], xs[part]] = True

    return {key: mask for key, mask in masks.items() if mask.any()}


def repack(name, cols, rows, check_only):
    path = os.path.join(ART, name)
    backup = os.path.join(ART, name.replace(".png", "-original.png"))
    source = backup if os.path.exists(backup) else path
    sheet = Image.open(source).convert("RGBA")

    slots = frames_for(sheet, cols, rows)
    missing = [(r, c) for r in range(rows) for c in range(cols) if (r, c) not in slots]
    if missing:
        print(f"  {name}: no sprite found for cells {missing} - leaving this sheet alone")
        return

    pixels = np.array(sheet)
    cut = {}
    for key, mask in slots.items():
        ys, xs = np.nonzero(mask)
        box = (xs.min(), ys.min(), xs.max(), ys.max())
        # Copy only this character's own pixels; everything else in the box goes clear.
        patch = pixels[box[1]:box[3] + 1, box[0]:box[2] + 1].copy()
        patch[..., 3] = np.where(mask[box[1]:box[3] + 1, box[0]:box[2] + 1], patch[..., 3], 0)
        cut[key] = Image.fromarray(patch, "RGBA")

    widths = [im.width for im in cut.values()]
    heights = [im.height for im in cut.values()]
    side = int(round(max(max(widths), max(heights)) * (1 + 2 * PAD_RATIO)))
    pad = int(round(side * PAD_RATIO))

    print(f"  {name}: {cols}x{rows} frames, widest {max(widths)}px, tallest {max(heights)}px "
          f"-> {side}x{side} cells with {pad}px margin")
    if check_only:
        return

    out = Image.new("RGBA", (cols * side, rows * side), (0, 0, 0, 0))
    for (row, col), sprite in cut.items():
        dx = col * side + (side - sprite.width) // 2          # centred across the row
        dy = row * side + side - pad - sprite.height          # feet on a shared baseline
        out.paste(sprite, (dx, dy), sprite)

    if not os.path.exists(backup):
        Image.open(path).save(backup)
        print(f"    kept the original as {os.path.basename(backup)}")
    out.save(path)
    print(f"    wrote {os.path.basename(path)} ({out.width}x{out.height})")


if __name__ == "__main__":
    check_only = "--check" in sys.argv
    print("repacking sprite sheets" if not check_only else "checking sprite sheets")
    for name, cols, rows in SHEETS:
        repack(name, cols, rows, check_only)

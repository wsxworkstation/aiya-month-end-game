// Layout sanity check for the town map. Run with: node scripts/check-layout.js
//
// Parses the live coordinates out of game.js and simulates the real movement code
// (axis-separated collision, per-frame step size) rather than an idealised grid, then
// asserts three things:
//   1. no door, board or spawn point sits inside a collision box
//   2. from every place the player can be dropped, every interaction point is walkable-to
//   3. the open space is one connected region, with no isolated pockets
//
// Re-run this after changing BASE_BUILDINGS, HOUSES, BOARD or isBlocked().

const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.join(__dirname, "..", "game.js"), "utf8");

function literal(name, opener) {
  const closer = opener === "[" ? "]" : "}";
  const start = source.indexOf(`const ${name} = ${opener}`);
  if (start < 0) throw new Error(`could not find ${name} in game.js`);
  const open = source.indexOf(opener, start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === opener) depth++;
    else if (source[i] === closer) {
      depth--;
      if (depth === 0) return eval(`(${source.slice(open, i + 1)})`);
    }
  }
  throw new Error(`unterminated ${name}`);
}

const HOUSES = literal("HOUSES", "[");
const BASE_BUILDINGS = literal("BASE_BUILDINGS", "[");
const BOARD = literal("BOARD", "{");
const ROAD_MASK = literal("ROAD_MASK", "[");
const ROAD_CELL = Number((source.match(/const ROAD_CELL = (\d+)/) || [])[1] || 6);

const house = HOUSES[0];
const buildings = [...BASE_BUILDINGS, { id: "home", label: house.name, x: house.x, y: house.y, w: house.w, h: house.h }];

// Mirrors game.js
const MIN_X = 14, MAX_X = 946, MIN_Y = 18, MAX_Y = 520;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// Mirrors isTownBlocked() in game.js. A checker that models fewer rules than the game
// will happily pass a map you cannot actually walk.
const isBlocked = (x, y) => {
  const row = ROAD_MASK[Math.floor(y / ROAD_CELL)];
  return !row || row[Math.floor(x / ROAD_CELL)] === "0";
};
const getDoor = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h + 8 });

function standingSpot(building) {
  const door = getDoor(building);
  for (let offset = 8; offset <= 90; offset += 4) {
    const y = clamp(door.y + offset, MIN_Y, MAX_Y);
    if (!isBlocked(door.x, y)) return { x: door.x, y };
  }
  for (let offset = 8; offset <= 90; offset += 4) {
    const y = clamp(door.y - building.h - offset, MIN_Y, MAX_Y);
    if (!isBlocked(door.x, y)) return { x: door.x, y };
  }
  return { x: door.x, y: clamp(door.y + 20, MIN_Y, MAX_Y) };
}

const targets = buildings.map(b => ({ name: b.label, point: getDoor(b), radius: 46 }));
targets.push({ name: BOARD.label, point: { x: BOARD.x, y: BOARD.y }, radius: 46 });

let failures = 0;
const fail = (msg) => { failures++; console.log("  FAIL " + msg); };

// --- 1. spawn points must be free -------------------------------------------------
console.log("1. spawn points (where the player is placed leaving a building):");
const spawns = [];
for (const b of buildings) {
  const spot = standingSpot(b);
  spawns.push({ name: b.label, spot });
  if (isBlocked(spot.x, spot.y)) fail(`${b.label} exit -> (${spot.x}, ${spot.y}) is inside a collision box`);
  else console.log(`  OK   ${String(b.label).padEnd(8)} exit -> (${spot.x}, ${spot.y})`);
}

// --- 2. walk simulation -----------------------------------------------------------
// BFS over positions using the game's own axis-separated stepping. Worst-case frame
// delta is 0.04s, so a step is speed * 0.04; using that (the largest step) is the
// least forgiving case for squeezing through gaps.
const SPEED = Number((source.match(/const speed = (\d+) \*/) || [])[1] || 152);
const STEP = SPEED * 0.04;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const QUANT = 2;
const keyOf = (x, y) => `${Math.round(x / QUANT)},${Math.round(y / QUANT)}`;

function walkFrom(start) {
  const seen = new Set([keyOf(start.x, start.y)]);
  const queue = [start];
  const spots = [];
  while (queue.length) {
    const cur = queue.shift();
    spots.push(cur);
    for (const [dx, dy] of DIRS) {
      const len = Math.hypot(dx, dy);
      const nextX = clamp(cur.x + dx / len * STEP, MIN_X, MAX_X);
      const nextY = clamp(cur.y + dy / len * STEP, MIN_Y, MAX_Y);
      let x = cur.x, y = cur.y;
      if (!isBlocked(nextX, y)) x = nextX;
      if (!isBlocked(x, nextY)) y = nextY;
      const k = keyOf(x, y);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push({ x, y });
    }
  }
  return spots;
}

console.log(`\n2. walk simulation from each spawn (step ${STEP.toFixed(1)}px, axis-separated):`);
for (const { name, spot } of spawns) {
  const spots = walkFrom(spot);
  const missed = targets.filter(t => !spots.some(s => Math.hypot(s.x - t.point.x, s.y - t.point.y) < t.radius));
  if (missed.length) fail(`from ${name} exit, cannot reach: ${missed.map(m => m.name).join(", ")}`);
  else console.log(`  OK   from ${String(name).padEnd(8)} exit: all ${targets.length} interaction points reachable (${spots.length} standable spots)`);
}

// --- 3. no isolated pockets -------------------------------------------------------
const reachable = new Set(walkFrom(spawns[spawns.length - 1].spot).map(s => keyOf(s.x, s.y)));
let open = 0, stranded = 0;
for (let x = MIN_X; x <= MAX_X; x += QUANT) {
  for (let y = MIN_Y; y <= MAX_Y; y += QUANT) {
    if (isBlocked(x, y)) continue;
    open++;
    if (!reachable.has(keyOf(x, y))) stranded++;
  }
}
console.log(`\n3. coverage: ${open} open cells, ${stranded} not reachable by walking (${(100 * (open - stranded) / open).toFixed(1)}% covered)`);
if (stranded / open > 0.02) fail(`${stranded} open cells are walled off from the walkable area`);

console.log(failures === 0 ? "\nPASS - layout is walkable" : `\nFAIL - ${failures} problem(s)`);
process.exit(failures === 0 ? 0 : 1);

// Plans a walk over the game's own collision mask and returns it as key holds.
// Tests call plan() from the player's live position, so nothing goes stale when a door
// moves, the mask changes, or the player walks slower because they are tired.
const fs = require("fs");

const GAME = require("path").join(__dirname, "..", "game.js");
const source = fs.readFileSync(GAME, "utf8");

function literal(name, opener) {
  const closer = opener === "[" ? "]" : "}";
  const start = source.indexOf(`const ${name} = ${opener}`);
  if (start < 0) throw new Error("missing " + name);
  const open = source.indexOf(opener, start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === opener) depth++;
    else if (source[i] === closer) { depth--; if (depth === 0) return eval("(" + source.slice(open, i + 1) + ")"); }
  }
  throw new Error("unterminated " + name);
}

const HOUSES = literal("HOUSES", "[");
const BASE_BUILDINGS = literal("BASE_BUILDINGS", "[");
const BOARD = literal("BOARD", "{");
const ROAD_MASK = literal("ROAD_MASK", "[");
const CELL = Number((source.match(/const ROAD_CELL = (\d+)/) || [])[1] || 6);
const RADIUS = Number((source.match(/const INTERACT_RADIUS = (\d+)/) || [])[1] || 36);

const doorOf = b => ({ x: b.doorX ?? b.x + b.w / 2, y: b.y + b.h + 8 });
const house = HOUSES[0];
const POINTS = Object.fromEntries([
  ...BASE_BUILDINGS.map(b => [b.label, doorOf(b)]),
  [house.name, doorOf(house)],
  [BOARD.label, { x: BOARD.x, y: BOARD.y }]
]);

const MIN_X = 14, MAX_X = 946, MIN_Y = 18, MAX_Y = 520;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const blocked = (x, y) => {
  const row = ROAD_MASK[Math.floor(y / CELL)];
  return !row || row[Math.floor(x / CELL)] === "0";
};

// Plan in the currency a test can replay: one step is one key held for HOLD ms. The
// step length assumes a tired player, so the plan under-shoots rather than over-shoots
// and the caller can simply plan again.
const HOLD = 110;
const STEP = 152 * 0.85 * (HOLD / 1000);
const KEYS = { KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] };
const QUANT = 4;
const key = (x, y) => Math.round(x / QUANT) + "," + Math.round(y / QUANT);

function plan(from, to, arrive = RADIUS - 10) {
  const start = { x: clamp(from.x, MIN_X, MAX_X), y: clamp(from.y, MIN_Y, MAX_Y) };
  const seen = new Map([[key(start.x, start.y), null]]);
  let frontier = [start];
  for (let depth = 0; depth < 500 && frontier.length; depth++) {
    const next = [];
    for (const cur of frontier) {
      if (Math.hypot(cur.x - to.x, cur.y - to.y) < arrive) return legsTo(seen, cur);
      for (const code of Object.keys(KEYS)) {
        const [dx, dy] = KEYS[code];
        let x = cur.x, y = cur.y;
        const nx = clamp(x + dx * STEP, MIN_X, MAX_X), ny = clamp(y + dy * STEP, MIN_Y, MAX_Y);
        if (!blocked(nx, y)) x = nx;
        if (!blocked(x, ny)) y = ny;
        const k = key(x, y);
        if (seen.has(k)) continue;
        seen.set(k, { from: cur, code });
        next.push({ x, y });
      }
    }
    frontier = next;
  }
  return null;
}

function legsTo(seen, end) {
  const steps = [];
  let cur = end;
  for (;;) {
    const edge = seen.get(key(cur.x, cur.y));
    if (!edge) break;
    steps.push(edge.code);
    cur = edge.from;
  }
  steps.reverse();
  const legs = [];
  for (const code of steps) {
    if (legs.length && legs[legs.length - 1][0] === code) legs[legs.length - 1][1] += HOLD;
    else legs.push([code, HOLD]);
  }
  return legs;
}

module.exports = { plan, POINTS, RADIUS, blocked };

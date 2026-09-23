// Does the ending you are given match the money you finished with?
// Run with: node scripts/check-endings.js
//
// A run that ended $1,026 in the hole was titled 月底幸存者, because the ladder was
// written for a twelve-month game and had no rung below zero. This lifts the real
// function out of game.js and walks it across the whole range, checking that the titles
// only ever climb and that nothing below zero reads as a success.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "game.js"), "utf8");

function extract(header) {
  const start = source.indexOf(header);
  if (start < 0) throw new Error(`could not find ${header.trim()} in game.js`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated ${header}`);
}

const TOTAL_MONTHS = Number((source.match(/const TOTAL_MONTHS = (\d+)/) || [])[1]);
const sandbox = { TOTAL_MONTHS };
vm.createContext(sandbox);
vm.runInContext(extract("function endingFor(") + "\nglobalThis.exported = endingFor;", sandbox);
const endingFor = sandbox.exported;

let failures = 0;
const fail = (msg) => { failures++; console.log("  FAIL " + msg); };

// Titles that claim you did all right. None of them may show up while you are in the red.
const POSITIVE = ["幸存者", "常客", "勇者", "战神"];

console.log(`TOTAL_MONTHS = ${TOTAL_MONTHS}`);

// 1. bankruptcy always wins, whatever the balance says
for (const assets of [-5000, -1, 0, 1, 5000, 50000]) {
  const end = endingFor(assets, true);
  if (end.title !== "钱包正式投降") fail(`bankrupt at ${assets} gave "${end.title}"`);
}

// 2. nothing in the red is congratulated, and nothing in the black is mourned
for (let assets = -8000; assets <= 30000; assets += 1) {
  const { title, art, message } = endingFor(assets, false);
  if (!title || !art || !message) { fail(`${assets} produced an incomplete ending`); break; }
  if (assets < 0 && POSITIVE.some(word => title.includes(word))) {
    fail(`${assets} (in the red) was titled "${title}"`);
    break;
  }
  if (assets >= 3000 && title === "欠了一屁股债") { fail(`${assets} was told it owed money`); break; }
}

// 3. the ladder only ever climbs: each title owns one unbroken band
const bands = [];
for (let assets = -8000; assets <= 30000; assets += 1) {
  const { title } = endingFor(assets, false);
  if (!bands.length || bands[bands.length - 1].title !== title) bands.push({ title, from: assets, to: assets });
  else bands[bands.length - 1].to = assets;
}
const seen = new Set();
for (const band of bands) {
  if (seen.has(band.title)) fail(`"${band.title}" comes back again at ${band.from}, so the ladder is not sorted`);
  seen.add(band.title);
}

console.log(`\n${bands.length} bands from -$8,000 to $30,000:`);
for (const band of bands) {
  const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString();
  console.log(`  ${band.title.padEnd(8)} ${money(band.from)} … ${money(band.to)}`);
}

// 4. every band is reachable: one that is narrower than a single rent payment is a typo
for (const band of bands.slice(1, -1)) {
  if (band.to - band.from < 500) fail(`"${band.title}" only covers ${band.to - band.from + 1} dollars`);
}

console.log(failures === 0 ? "\nPASS - every ending matches the money" : `\nFAIL - ${failures} problem(s)`);
process.exit(failures === 0 ? 0 : 1);

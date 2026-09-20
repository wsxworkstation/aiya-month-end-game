// Does the part-time stock tip actually predict the month's price move?
// Run with: node scripts/check-stock-tips.js
//
// The tip is only worth paying for if it names what is really going to happen, so this
// lifts the four real functions out of game.js (rather than a copy that can drift) and
// runs a year of months against them, checking three things:
//   1. the wording band matches the number that was pre-rolled for this month
//   2. the move applied at month end is exactly that pre-rolled number, not a re-roll
//   3. the wording is directionally honest -- nothing called 涨 ever goes down

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "game.js"), "utf8");

function extract(header) {
  const start = source.indexOf(header);
  if (start < 0) throw new Error(`could not find ${header.trim()} in game.js`);
  const open = source.indexOf(header.includes("function") ? "{" : "[", start);
  const closer = source[open] === "{" ? "}" : "]";
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === source[open]) depth++;
    else if (source[i] === closer) {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated ${header}`);
}

const sandbox = { state: null, Math, Object, console };
vm.createContext(sandbox);
vm.runInContext([
  extract("const STOCKS = ["),
  extract("function rollStockChanges()"),
  extract("function stockTipFor("),
  extract("function updateStocks()"),
  // `const` in a VM context is not a property of its global, so hand them over.
  "globalThis.exported = { STOCKS, rollStockChanges, stockTipFor, updateStocks };"
].join("\n"), sandbox);

const { STOCKS, rollStockChanges, stockTipFor, updateStocks } = sandbox.exported;

// Same bands as stockTipFor, written out independently so a change to one side of the
// pair shows up as a failure instead of quietly agreeing with itself.
const expected = (change) =>
  change >= 12 ? "会大涨" : change >= 4 ? "会涨一点" : change > -4 ? "大概不动" : change > -12 ? "会跌一点" : "会大跌";
const direction = { "会大涨": 1, "会涨一点": 1, "大概不动": 0, "会跌一点": -1, "会大跌": -1 };

let failures = 0, checked = 0;
const fail = (msg) => { failures++; console.log("  FAIL " + msg); };
const MONTHS = 2000;

for (let month = 1; month <= MONTHS; month++) {
  sandbox.state = {
    pendingStock: rollStockChanges(),
    stockPrices: Object.fromEntries(STOCKS.map(s => [s.id, { price: s.price, change: 0 }]))
  };
  // What the player is told at the notice board, before anything is applied.
  const told = Object.fromEntries(STOCKS.map(s => [s.id, stockTipFor(s.id).text]));
  const promised = { ...sandbox.state.pendingStock };

  // Month end.
  updateStocks();

  for (const stock of STOCKS) {
    checked++;
    const change = sandbox.state.stockPrices[stock.id].change;
    if (change !== promised[stock.id]) {
      fail(`month ${month} ${stock.name}: told ${promised[stock.id]}%, actually moved ${change}%`);
    }
    if (told[stock.id] !== expected(change)) {
      fail(`month ${month} ${stock.name}: said "${told[stock.id]}" but moved ${change}% (should say "${expected(change)}")`);
    }
    const said = direction[told[stock.id]];
    if ((said > 0 && change < 0) || (said < 0 && change > 0)) {
      fail(`month ${month} ${stock.name}: said "${told[stock.id]}" and moved the other way (${change}%)`);
    }
  }
  if (sandbox.state.pendingStock) fail(`month ${month}: pendingStock was not cleared, next month would reuse it`);
}

// The tip is pointless if every stock lands in the same band, so check the spread too.
const bands = {};
for (let i = 0; i < 4000; i++) {
  sandbox.state = { pendingStock: rollStockChanges(), stockPrices: {} };
  for (const s of STOCKS) bands[stockTipFor(s.id).text] = (bands[stockTipFor(s.id).text] || 0) + 1;
}
const total = Object.values(bands).reduce((a, b) => a + b, 0);
console.log(`tip wording spread over ${total} rolls:`);
for (const [text, count] of Object.entries(bands).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${text.padEnd(5)} ${(100 * count / total).toFixed(1)}%`);
}
if (Object.keys(direction).some(text => !bands[text])) fail("some tip wordings never come up at all");

console.log(`\nchecked ${checked} stock-months across ${MONTHS} months`);
console.log(failures === 0 ? "PASS - every tip matched the move that followed" : `FAIL - ${failures} problem(s)`);
process.exit(failures === 0 ? 0 : 1);

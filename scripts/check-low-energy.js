// Drain the player down to a few points of energy, then check that a counter which
// charges energy refuses the action instead of taking it and collapsing you mid-way.
//
// Needs playwright and a local server on 8934.
let chromium;
try { ({ chromium } = require("playwright")); }
catch { console.log("playwright is not installed here. npm i -D playwright && npx playwright install chromium"); process.exit(0); }
const nav = require("./nav.js");
const prompt = p => p.$eval("#interaction-hint", e => e.hidden ? "" : e.textContent.trim()).catch(() => "");
const body = p => p.$eval("#modal-content", e => e.innerText).catch(() => "");
const flat = t => String(t).split("\n").join(" | ");
async function hold(p,k,ms){await p.keyboard.down(k);await p.waitForTimeout(ms);await p.keyboard.up(k);await p.waitForTimeout(40);}
async function click(p,s,ms=520){const e=await p.$(s);if(!e)return false;await e.click({timeout:2500}).catch(()=>{});await p.waitForTimeout(ms);return true;}
async function goTo(p, place) {
  for (let i = 0; i < 6; i++) {
    if ((await prompt(p)).includes(place)) return true;
    const g = await p.evaluate(() => window.__peek());
    if (!g || !g.playing) return false;
    const legs = nav.plan(g.player, nav.POINTS[place]);
    if (!legs) return false;
    for (const [c, ms] of legs) { await hold(p, c, ms); if ((await prompt(p)).includes(place)) return true; }
  }
  return (await prompt(p)).includes(place);
}
const ENERGY_FLOOR = 4;   // below the ROI cost of 5
let fails = 0;
const check = (ok, label, extra = "") => { if (!ok) fails++; console.log((ok ? "OK   " : "FAIL ") + label + (extra ? " :: " + extra : "")); };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 820 } });
  const errors = [];
  p.on("pageerror", e => errors.push(e.message));
  await p.goto("http://localhost:8934/index.html?debug=1");
  await p.waitForSelector("text=开始新生活");
  await click(p, "#new-game-btn"); await click(p, "#tutorial-start");
  for (let i = 0; i < 6; i++) { const bk = await p.$$("#draw-row .card-back"); if (bk.length) { await bk[0].click(); await p.waitForTimeout(700); continue; } if (await click(p, "#modal-content .pixel-btn")) continue; break; }

  // Stand at the door FIRST, then drain: walking is the one drain that cannot refuse,
  // so a player on fumes across the map simply collapses before arriving.
  check(await goTo(p, "ROI研究所"), "walked to ROI研究所 while still fresh");
  for (let i = 0; i < 420; i++) {
    const g = await p.evaluate(() => window.__peek());
    if (!g || !g.playing) break;
    if (g.energy <= ENERGY_FLOOR) break;
    await hold(p, i % 2 ? "KeyA" : "KeyD", 260);   // short laps, so we stay at the door
  }
  let g = await p.evaluate(() => window.__peek());
  check(g && g.playing && g.energy <= ENERGY_FLOOR, "drained to the last few points at the door",
        "energy " + (g && g.energy));

  // ROI: the shelf should refuse rather than invest and collapse.
  if (await goTo(p, "ROI研究所")) {
    await p.keyboard.press("KeyE"); await p.waitForTimeout(650);
    await click(p, "#counter-act", 800);
    const text = await body(p);
    check(text.includes("动力不够") || text.includes("动力只剩"), "ROI says the energy is short", flat(text).slice(0, 160));
    const cards = await p.$$eval("#modal-content .game-card", els => els.map(e => e.className));
    check(cards.length > 0 && cards.every(c => c.includes("unaffordable")), "every ROI card is greyed out", JSON.stringify(cards));
    const before = await p.evaluate(() => window.__peek());
    await click(p, "#modal-content .game-card", 600);
    const after = await p.evaluate(() => window.__peek());
    check(after.playing && after.energy === before.energy && after.wallet === before.wallet,
          "clicking one does nothing at all",
          "energy " + before.energy + "->" + after.energy + ", wallet " + before.wallet + "->" + after.wallet);
    check(!after.roi, "and the month's ROI is still not done");
  } else {
    check(false, "still at ROI研究所 after draining");
  }
  console.log("");
  console.log("page errors: " + (errors.length ? errors.join(" | ") : "none"));
  if (errors.length) fails++;
  console.log(fails === 0 ? "PASS - tired players are refused, not collapsed" : "FAIL - " + fails + " problem(s)");
  await b.close();
  process.exit(fails ? 1 : 0);
})();

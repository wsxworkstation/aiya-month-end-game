// The exchange shows the whole market, and neither trading nor investing costs energy.
// A two-month tip is only worth having if the stock it names is definitely on the board,
// which it was not while the exchange dealt a random three.
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
let fails = 0;
const check = (ok, label, extra = "") => { if (!ok) fails++; console.log((ok ? "OK   " : "FAIL ") + label + (extra ? " :: " + extra : "")); };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 820 } });
  const errors = [];
  p.on("pageerror", e => errors.push(e.message));
  p.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await p.goto("http://localhost:8934/index.html?debug=1");
  await p.waitForSelector("text=开始新生活");
  await click(p, "#new-game-btn"); await click(p, "#tutorial-start");
  for (let i = 0; i < 6; i++) { const bk = await p.$$("#draw-row .card-back"); if (bk.length) { await bk[0].click(); await p.waitForTimeout(700); continue; } if (await click(p, "#modal-content .pixel-btn")) continue; break; }

  check(await goTo(p, "涨跌交易所"), "walked to the exchange");
  await p.keyboard.press("KeyE"); await p.waitForTimeout(650);
  await click(p, "#counter-act", 800);
  const cards = await p.$$eval("#modal-content .game-card", els => els.map(e => e.querySelector(".card-title").textContent));
  check(cards.length === 5, "all five stocks are on the board", JSON.stringify(cards));
  const text = await body(p);
  check(!text.includes("动力-"), "trading no longer charges energy", flat(text).slice(0, 140));

  // Buying: energy must not move.
  const before = await p.evaluate(() => window.__peek());
  await click(p, "#modal-content .game-card", 600);
  await click(p, "#confirm-stock", 800);
  const after = await p.evaluate(() => window.__peek());
  check(after.energy === before.energy, "buying costs no energy", before.energy + " -> " + after.energy);
  check(after.wallet + after.bank < before.wallet + before.bank, "but it does cost money",
        (before.wallet + before.bank) + " -> " + (after.wallet + after.bank));

  // ROI: same.
  await click(p, "#counter-leave", 600);
  check(await goTo(p, "ROI研究所"), "walked to the lab");
  await p.keyboard.press("KeyE"); await p.waitForTimeout(650);
  await click(p, "#counter-act", 800);
  const roiText = await body(p);
  check(!roiText.includes("动力-"), "the lab no longer charges energy", flat(roiText).slice(0, 140));
  const beforeRoi = await p.evaluate(() => window.__peek());
  await click(p, "#modal-content .game-card", 600);
  await click(p, "#roi-go", 800);
  const afterRoi = await p.evaluate(() => window.__peek());
  check(afterRoi.energy === beforeRoi.energy, "investing costs no energy", beforeRoi.energy + " -> " + afterRoi.energy);

  console.log("");
  console.log("page errors: " + (errors.length ? errors.join(" | ") : "none"));
  if (errors.length) fails++;
  console.log(fails === 0 ? "PASS - the market is open and free to trade" : "FAIL - " + fails + " problem(s)");
  await b.close();
  process.exit(fails ? 1 : 0);
})();

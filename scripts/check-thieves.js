// Month 3 puts one thief on the streets and month 6 onward two, one of whom is the
// slowpoke. Playing that far takes far too long, so this starts a game, edits the month
// in the checkpoint the game itself writes, and resumes from it.
//
// The last case is the one that matters in real play: going indoors clears the street,
// so the pair has to reassemble quickly enough that a player who ducks into shops still
// meets both of them.
//
// Needs playwright and a local server on 8934.
let chromium;
try { ({ chromium } = require("playwright")); }
catch { console.log("playwright is not installed here. npm i -D playwright && npx playwright install chromium"); process.exit(0); }
async function click(p, s, ms = 520) { const e = await p.$(s); if (!e) return false; await e.click({ timeout: 2500 }).catch(() => {}); await p.waitForTimeout(ms); return true; }
async function hold(p, k, ms) { await p.keyboard.down(k); await p.waitForTimeout(ms); await p.keyboard.up(k); await p.waitForTimeout(40); }

let fails = 0;
const check = (ok, label, extra = "") => { if (!ok) fails++; console.log((ok ? "OK   " : "FAIL ") + label + (extra ? " :: " + extra : "")); };

async function monthWith(p, month, seconds) {
  // Put the checkpoint at the month we want, then resume from it.
  await p.evaluate(m => {
    const key = "aiyaMonthEndGame_checkpoint_v1";
    const save = JSON.parse(localStorage.getItem(key));
    save.month = m;
    save.thieves = [];
    save.thiefRespawn = 0;
    localStorage.setItem(key, JSON.stringify(save));
  }, month);
  await p.reload();
  await p.waitForSelector("text=开始新生活");
  await click(p, "#resume-btn", 900);

  // Walk about, because standing still is not how anyone plays.
  let peak = 0, sawSlow = false, sawRunner = false;
  for (let i = 0; i < seconds * 2; i++) {
    await hold(p, i % 4 < 2 ? "KeyA" : "KeyD", 420);
    const g = await p.evaluate(() => window.__peek && window.__peek());
    if (!g || !g.playing) break;
    peak = Math.max(peak, g.thieves.length);
    if (g.thieves.some(t => t.slow)) sawSlow = true;
    if (g.thieves.some(t => !t.slow)) sawRunner = true;
  }
  const g = await p.evaluate(() => window.__peek && window.__peek());
  return { peak, wanted: g && g.wanted, sawSlow, sawRunner, alive: !!(g && g.playing) };
}

async function afterAShopVisit(p, month, seconds) {
  await p.evaluate(m => {
    const key = "aiyaMonthEndGame_checkpoint_v1";
    const save = JSON.parse(localStorage.getItem(key));
    save.month = m; save.thieves = []; save.thiefRespawn = 0;
    localStorage.setItem(key, JSON.stringify(save));
  }, month);
  await p.reload();
  await p.waitForSelector("text=开始新生活");
  await click(p, "#resume-btn", 900);
  // Step into the house (the spawn point is its doorstep) and straight back out.
  await p.keyboard.press("KeyE");
  await p.waitForTimeout(800);
  const inside = await p.evaluate(() => window.__peek && window.__peek());
  const cleared = !!inside && inside.thieves.length === 0 && inside.scene === "interior";
  await click(p, "#modal-close");
  await click(p, "#counter-leave", 700);
  let peak = 0;
  for (let i = 0; i < seconds * 2; i++) {
    await hold(p, i % 4 < 2 ? "KeyA" : "KeyD", 420);
    const g = await p.evaluate(() => window.__peek && window.__peek());
    if (!g || !g.playing) break;
    peak = Math.max(peak, g.thieves.length);
    if (peak === 2) break;
  }
  return { peak, cleared };
}

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 820 } });
  const errors = [];
  p.on("pageerror", e => errors.push(e.message));
  await p.goto("http://localhost:8934/index.html?debug=1");
  await p.waitForSelector("text=开始新生活");
  await click(p, "#new-game-btn");
  await click(p, "#tutorial-start");
  for (let i = 0; i < 6; i++) { const bk = await p.$$("#draw-row .card-back"); if (bk.length) { await bk[0].click(); await p.waitForTimeout(700); continue; } if (await click(p, "#modal-content .pixel-btn")) continue; break; }

  for (const [month, want] of [[2, 0], [3, 1], [6, 2], [7, 2]]) {
    const r = await monthWith(p, month, 40);
    check(r.wanted === want, `month ${month} wants ${want} thieves`, "wanted " + r.wanted);
    check(r.peak === want, `month ${month} actually has ${want} out within 40s`, "peak " + r.peak);
    if (want === 2) {
      check(r.sawRunner && r.sawSlow, `month ${month} has one runner and one slowpoke`,
            "runner " + r.sawRunner + ", slow " + r.sawSlow);
    }
  }

  // Going indoors clears the street. Coming back out, the pair has to reassemble in a
  // reasonable time -- this is the case that made month 7 look like it had only one.
  const after = await afterAShopVisit(p, 7, 40);
  check(after.peak === 2, "both are back on the street 40s after leaving a building", "peak " + after.peak);
  check(after.cleared, "and going inside did clear them first");

  console.log("");
  console.log("page errors: " + (errors.length ? errors.join(" | ") : "none"));
  if (errors.length) fails++;
  console.log(fails === 0 ? "PASS - the right number of thieves turn up" : "FAIL - " + fails + " problem(s)");
  await b.close();
  process.exit(fails ? 1 : 0);
})();

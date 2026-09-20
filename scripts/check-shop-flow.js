// Plays one real month in a headless browser and checks the parts that only break
// once they are wired together:
//   - the shop's two shelves both stock, price and hand over goods
//   - a one-shot leaves the bag when it is used
//   - the part-time tip names the move the month actually applies at the end
//   - rent takes the wallet when the bank is empty, instead of inventing debt
//
// Needs playwright and the preview server:
//   npm i -D playwright && npx playwright install chromium
//   node scripts/preview-server.js &
//   node scripts/check-shop-flow.js
let chromium;
try { ({ chromium } = require("playwright")); }
catch { console.log("playwright is not installed here. npm i -D playwright && npx playwright install chromium"); process.exit(0); }
const ROUTES = require("./routes.json");
const prompt = p => p.$eval("#interaction-hint", e => e.hidden ? "" : e.textContent.trim()).catch(() => "");
const modalUp = p => p.$eval("#modal-layer", e => !e.hidden).catch(() => false);
const body = p => p.$eval("#modal-content", e => e.innerText).catch(() => "");

async function hold(p, k, ms) { await p.keyboard.down(k); await p.waitForTimeout(ms); await p.keyboard.up(k); await p.waitForTimeout(40); }
async function safeClick(p, sel, ms = 500) {
  const el = await p.$(sel);
  if (!el || !(await el.isVisible().catch(() => false))) return false;
  await el.click({ timeout: 2500 }).catch(() => {});
  await p.waitForTimeout(ms);
  return true;
}
async function dismiss(p, max = 8) {
  for (let i = 0; i < max; i++) {
    if (!(await modalUp(p))) return;
    const backs = await p.$$("#draw-row .card-back");
    if (backs.length) { await backs[0].click({ timeout: 2500 }).catch(() => {}); await p.waitForTimeout(650); continue; }
    if (await safeClick(p, "#modal-content .pixel-btn")) continue;
    if (await safeClick(p, "#modal-close")) continue;
    return;
  }
}
// Routes are key-hold recordings, so they drift whenever walking speed changes. Re-fix
// on whichever landmark we can see and replay from there, rather than nudging blindly.
// The board is a recorded destination but never an origin, so walk its routes backwards.
const OPPOSITE = { KeyW: "KeyS", KeyS: "KeyW", KeyA: "KeyD", KeyD: "KeyA" };
ROUTES["兼职公告板"] = Object.fromEntries(Object.keys(ROUTES)
  .filter(name => ROUTES[name]["兼职公告板"])
  .map(name => [name, [...ROUTES[name]["兼职公告板"]].reverse().map(([k, ms]) => [OPPOSITE[k], ms])]));
const PLACES = Object.keys(ROUTES);
let at = "你的小窝";
async function goTo(p, to, peek) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const here = await prompt(p);
    if (here.includes(to)) { at = PLACES.includes(to) ? to : at; return true; }
      const landmark = PLACES.find(name => here.includes(name));
    if (landmark) at = landmark;
    const legs = (ROUTES[at] || {})[to];
    if (legs) for (const [k, ms] of legs) await hold(p, k, ms);
    else for (let i = 0; i < 10; i++) await hold(p, ["KeyW", "KeyD", "KeyS", "KeyA"][i % 4], 150);
    const g = await peek(); if (!g || !g.playing) return false;
  }
  const here = await prompt(p);
  if (here.includes(to) && PLACES.includes(to)) at = to;
  return here.includes(to);
}

let fails = 0;
const check = (ok, label, extra = "") => { if (!ok) fails++; console.log(`${ok ? "OK  " : "FAIL"} ${label}${extra ? " :: " + extra : ""}`); };

(async () => {
  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  const errors = [];
  p.on("pageerror", e => errors.push(e.message));
  await p.goto("http://localhost:8934/index.html?debug=1");
  await p.waitForSelector("text=开始新生活");
  await safeClick(p, "#new-game-btn");
  await safeClick(p, "#tutorial-start");
  const peek = () => p.evaluate(() => window.__peek && window.__peek());
  await dismiss(p);

  // --- work first, so the shop test is not just "player is broke" ------------
  await goTo(p, "摸鱼有限公司", peek);
  await p.keyboard.press("KeyE"); await p.waitForTimeout(700);
  await safeClick(p, "#counter-act", 700);
  for (let i = 0; i < 10 && await modalUp(p); i++) {
    const backs = await p.$$("#draw-row .card-back");
    if (backs.length) { await backs[0].click().catch(() => {}); await p.waitForTimeout(700); continue; }
    const tier = await p.$("#modal-content .game-card");
    if (tier) { await tier.click().catch(() => {}); await p.waitForTimeout(700); continue; }
    if (await safeClick(p, "#modal-content .pixel-btn")) continue;
    break;
  }
  await dismiss(p, 4);
  await safeClick(p, "#counter-leave", 600);
  console.log("     after work:", JSON.stringify(await peek().then(g => ({ wallet: g.wallet, energy: g.energy }))));

  // --- shop ------------------------------------------------------------------
  await goTo(p, "包好运杂货铺", peek);
  check((await prompt(p)).includes("包好运杂货铺"), "walked to the shop");
  await p.keyboard.press("KeyE"); await p.waitForTimeout(700);
  await safeClick(p, "#counter-act", 700);
  const shopText = await body(p);
  check(shopText.includes("永久物品") && shopText.includes("一次性"), "shop shows both shelves");
  const shelves = await p.$$eval("#modal-content .card-grid", grids => grids.map(g => g.querySelectorAll(".game-card").length));
  check(shelves.length === 2, "two shelves rendered", JSON.stringify(shelves));
  const art = await p.$$eval("#modal-content .game-card .card-art", els => els.map(e => !!e.style.getPropertyValue("--card-image")));
  check(art.length > 0 && art.every(Boolean), "every shop card has artwork", `${art.filter(Boolean).length}/${art.length}`);

  let before = await peek();
  // buy one from each shelf
  for (const gridIndex of [0, 1]) {
    const handle = await p.evaluateHandle((i) => {
      const grid = document.querySelectorAll("#modal-content .card-grid")[i];
      return [...grid.querySelectorAll(".game-card")].find(c => !c.className.includes("unaffordable") && !c.className.includes("owned")) || null;
    }, gridIndex);
    const el = handle.asElement();
    if (el) { await el.click(); await p.waitForTimeout(500); }
    else console.log(`     (shelf ${gridIndex + 1}: nothing affordable)`);
  }
  let after = await peek();
  check(after.items.length === 1, "permanent item went into the backpack", JSON.stringify(after.items));
  check(after.tools.length + (after.spray - before.spray) === 1, "one-shot went into the tool slots", JSON.stringify(after.tools) + " spray=" + after.spray);
  check(after.wallet < before.wallet, "shop charged the wallet", `${before.wallet} -> ${after.wallet}`);

  await safeClick(p, "#modal-close");
  await safeClick(p, "#counter-leave", 600);
  // --- bag: use the one-shot -------------------------------------------------
  if (after.tools.length) {
    await safeClick(p, "#bag-btn", 600);
    const bagText = await body(p);
    check(bagText.includes("永久物品") && bagText.includes("一次性物品"), "bag shows both sections");
    const used = await safeClick(p, "[data-use-tool='0']", 500);
    const g = await peek();
    check(used && g.tools.length === after.tools.length - 1, "using a one-shot consumes it", JSON.stringify(g.tools));
    await safeClick(p, "#modal-close");
  }

  // --- part-time tip ---------------------------------------------------------
  const atBoard = await goTo(p, "兼职公告板", peek);
  check(atBoard, "walked to the notice board", await prompt(p));
  await p.keyboard.press("KeyE"); await p.waitForTimeout(800);
  const backs = await p.$$("#draw-row .card-back");
  if (backs.length) { await backs[0].click(); await p.waitForTimeout(900); }
  const offerText = await body(p);
  const m = offerText.match(/工友说它这个月(会大涨|会涨一点|大概不动|会跌一点|会大跌)/);
  check(!!m, "the board hands out a stock tip", offerText.slice(0, 120).replace(/\n/g, " | "));
  const tipText = m && m[1];
  await safeClick(p, "#modal-content .pixel-btn", 700);
  await dismiss(p, 3);
  const tipped = (await peek()).tips;
  check(tipped.length === 1, "the tipped stock is remembered", JSON.stringify(tipped));
  const stockId = tipped[0];
  const promised = (await peek()).pendingStock[stockId];
  const band = c => c >= 12 ? "会大涨" : c >= 4 ? "会涨一点" : c > -4 ? "大概不动" : c > -12 ? "会跌一点" : "会大跌";
  check(band(promised) === tipText, "the wording matches this month's pre-rolled move", `${tipText} vs ${promised}%`);

  // --- sleep: does the tip come true, and does rent take the wallet? ----------
  const beforeSleep = await peek();
  const atHome = await goTo(p, "你的小窝", peek);
  check(atHome, "walked home", await prompt(p));
  await p.keyboard.press("KeyE"); await p.waitForTimeout(700);
  await safeClick(p, "#counter-act", 700);
  await safeClick(p, "#sleep-btn", 1200);
  const report = await body(p);
  const afterSleep = await peek();
  await dismiss(p, 4);
  const nextMonth = await peek();
  check(nextMonth.month === beforeSleep.month + 1, "the month actually ended",
        `month ${beforeSleep.month} -> ${nextMonth.month}`);
  check(nextMonth.rent === 255, "rent climbs in month 2", String(nextMonth.rent));
  check(afterSleep.stockChange[stockId] === promised, "the month-end move is the one you were promised",
        `promised ${promised}%, applied ${afterSleep.stockChange[stockId]}%`);
  check(report.includes("钱包") || report.includes("支付房租"), "rent line appears in the report",
        (report.match(/.*房租.*/g) || []).join(" / "));
  check(beforeSleep.bank === 0 && beforeSleep.wallet >= beforeSleep.rent && afterSleep.debt === 0,
        "rent came out of the wallet instead of creating debt",
        `bank ${beforeSleep.bank}, wallet ${beforeSleep.wallet} -> ${afterSleep.wallet}, debt ${afterSleep.debt}, rent ${beforeSleep.rent}`);
  check(beforeSleep.rent === 220, "month 1 rent", String(beforeSleep.rent));

  console.log("\npage errors:", errors.length ? errors.join(" | ") : "none");
  if (errors.length) fails++;
  console.log(fails === 0 ? "\nPASS - all checks" : `\nFAIL - ${fails} problem(s)`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})();

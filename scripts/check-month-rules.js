// Plays one real month in a headless browser and checks the rules that only break once
// they are wired together: the seven-month clock, the three jobs that gate sleeping,
// rent handed over at home in cash, the bank's monthly rate, one one-shot and one night
// out a month, the $1000 ROI ceiling, and a stock tip that names two months truthfully.
//
// Needs playwright and a local server on 8934:
//   npm i -D playwright && npx playwright install chromium
//   node scripts/preview-server.js   (edit its port to 8934, or point PORT below at it)
//   node scripts/check-month-rules.js
let chromium;
try { ({ chromium } = require("playwright")); }
catch { console.log("playwright is not installed here. npm i -D playwright && npx playwright install chromium"); process.exit(0); }
const prompt = p => p.$eval("#interaction-hint", e => e.hidden ? "" : e.textContent.trim()).catch(() => "");
const modalUp = p => p.$eval("#modal-layer", e => !e.hidden).catch(() => false);
const body = p => p.$eval("#modal-content", e => e.innerText).catch(() => "");
const flat = t => String(t).split("\n").join(" | ");

async function hold(p, k, ms) { await p.keyboard.down(k); await p.waitForTimeout(ms); await p.keyboard.up(k); await p.waitForTimeout(40); }
async function safeClick(p, sel, ms = 520) {
  const e = await p.$(sel);
  if (!e || !(await e.isVisible().catch(() => false))) return false;
  await e.click({ timeout: 2500 }).catch(() => {});
  await p.waitForTimeout(ms);
  return true;
}
async function dismiss(p, max = 8) {
  for (let i = 0; i < max; i++) {
    if (!(await modalUp(p))) return;
    const b = await p.$$("#draw-row .card-back");
    if (b.length) { await b[0].click().catch(() => {}); await p.waitForTimeout(680); continue; }
    if (await safeClick(p, "#modal-content .pixel-btn")) continue;
    if (await safeClick(p, "#modal-close")) continue;
    return;
  }
}

const nav = require("./nav.js");

// Plan from wherever the player actually is, every time. Recorded routes drift the
// moment walking speed changes, which it does as energy drains.
async function goTo(p, to, peek) {
  const target = nav.POINTS[to];
  if (!target) throw new Error("unknown place: " + to);
  for (let attempt = 0; attempt < 6; attempt++) {
    if ((await prompt(p)).includes(to)) return true;
    const g = await peek();
    if (!g || !g.playing) return false;
    const legs = nav.plan(g.player, target);
    if (!legs) return false;
    for (const [code, ms] of legs) {
      await hold(p, code, ms);
      if ((await prompt(p)).includes(to)) return true;
    }
  }
  return (await prompt(p)).includes(to);
}

let fails = 0;
const check = (ok, label, extra = "") => { if (!ok) fails++; console.log((ok ? "OK   " : "FAIL ") + label + (extra ? " :: " + extra : "")); };

async function enter(p, place, peek) {
  if (!(await goTo(p, place, peek))) return false;
  await p.keyboard.press("KeyE");
  await p.waitForTimeout(650);
  await safeClick(p, "#counter-act", 750);
  return true;
}

(async () => {
  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  const errors = [];
  p.on("pageerror", e => errors.push(e.message));
  p.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await p.goto("http://localhost:8934/index.html?debug=1");
  await p.waitForSelector("text=开始新生活");
  await safeClick(p, "#new-game-btn");
  await safeClick(p, "#tutorial-start");
  const peek = () => p.evaluate(() => window.__peek && window.__peek());
  await dismiss(p);

  check((await p.$eval("#month-total", e => e.textContent)) === "共7月", "HUD shows the month out of seven",
        await p.$eval("#month-label", e => e.textContent));
  const list = await p.$eval(".month-checklist", e => e.innerText);
  check(list.includes("房租") && !list.includes("娱乐"), "checklist lists rent, not a night out", flat(list));

  // --- work first, so nothing below fails merely for being broke --------------
  check(await enter(p, "摸鱼有限公司", peek), "walked to work");
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
  const paid = await peek();
  check(paid.wallet > 500, "work paid", "wallet " + paid.wallet);

  // --- the bank's rate moves, and it no longer collects rent -------------------
  check(await enter(p, "稳稳银行", peek), "walked to the bank");
  const bankText = await body(p);
  check(!(await p.$("#pay-rent-btn")), "the bank does not collect rent any more");
  check(/本月利息([3-9])%/.test(bankText), "the bank quotes a rate between 3% and 9%",
        (bankText.match(/本月利息\d+%/) || ["?"])[0]);
  check(bankText.includes("只收现金"), "it tells you rent is cash, paid at home");
  await safeClick(p, "#modal-close");
  await safeClick(p, "#counter-leave", 600);

  // --- rent is handed over at home, in cash ------------------------------------
  check(await enter(p, "你的小窝", peek), "walked home to pay rent");
  check(!!(await p.$("#pay-rent-btn")), "the landlord is at the door", flat(await body(p)).slice(0, 200));
  const before = await peek();
  await safeClick(p, "#pay-rent-btn", 700);
  const after = await peek();
  check(after.wallet === before.wallet - before.rent && after.bank === before.bank,
        "rent comes out of the wallet only",
        "wallet " + before.wallet + " -> " + after.wallet + ", bank " + before.bank + " -> " + after.bank + ", rent " + before.rent);
  check((await body(p)).includes("已经交了"), "home then says it is paid");
  await dismiss(p, 3);
  await safeClick(p, "#counter-leave", 600);

  // --- one of each kind a month, but different kinds are fine -----------------
  check(await enter(p, "包好运杂货铺", peek), "walked to the shop");
  // Click a specific card by id, so "buy the same one twice" really is the same one.
  const clickCard = async (id) => {
    const handle = await p.evaluateHandle(cardId => {
      const grid = document.querySelectorAll("#modal-content .card-grid")[1];
      return [...grid.querySelectorAll(".game-card")].find(c => c.dataset.cardId === cardId) || null;
    }, id);
    const el = handle.asElement();
    if (!el) return false;
    await el.click();
    await p.waitForTimeout(550);
    return true;
  };
  const offered = await p.$$eval("#modal-content .card-grid", grids =>
    [...grids[1].querySelectorAll(".game-card")]
      .filter(c => !/unaffordable|owned/.test(c.className))
      .map(c => c.dataset.cardId));
  check(offered.length >= 2, "at least two one-shots are affordable to test with", JSON.stringify(offered));
  const held = g => g.tools.length + g.spray;
  const start = await peek();
  await clickCard(offered[0]);
  const afterFirst = await peek();
  check(held(afterFirst) === held(start) + 1, "bought the first one-shot",
        "tools " + JSON.stringify(afterFirst.tools) + " spray " + afterFirst.spray);
  await clickCard(offered[0]);
  const afterRepeat = await peek();
  check(held(afterRepeat) === held(afterFirst), "buying the SAME kind again is refused",
        "tools " + JSON.stringify(afterRepeat.tools) + " spray " + afterRepeat.spray);
  check((await body(p)).includes("这个月买过了"), "that card says why");
  await clickCard(offered[1]);
  const afterSecond = await peek();
  check(held(afterSecond) === held(afterFirst) + 1, "a DIFFERENT kind still sells",
        "tools " + JSON.stringify(afterSecond.tools) + " spray " + afterSecond.spray);
  check((await body(p)).includes("每种一个月只能买一次"), "the shelf states the rule");
  await safeClick(p, "#modal-close");
  await safeClick(p, "#counter-leave", 600);

  // --- one night out a month ---------------------------------------------------
  check(await enter(p, "开心一下", peek), "walked to the arcade");
  await safeClick(p, "#draw-fun", 700);
  const funBacks = await p.$$("#draw-row .card-back");
  if (funBacks.length) { await funBacks[0].click(); await p.waitForTimeout(900); }
  await dismiss(p, 4);
  await safeClick(p, "#counter-act", 700);
  check((await body(p)).includes("这个月玩过了"), "a second night out is refused", flat(await body(p)).slice(0, 120));
  await dismiss(p, 3);
  await safeClick(p, "#counter-leave", 600);

  // --- ROI: your own amount, capped -------------------------------------------
  check(await enter(p, "ROI研究所", peek), "ROI研究所 renamed and enterable", await prompt(p));
  await safeClick(p, "#modal-content .game-card", 600);
  const roiText = await body(p);
  check(roiText.includes("1,000") || roiText.includes("1000"), "ROI names the $1000 ceiling", flat(roiText).slice(0, 150));
  const maxAttr = await p.$eval("#roi-amount", e => e.max).catch(() => "none");
  check(Number(maxAttr) <= 1000, "the amount field is capped", "max=" + maxAttr);
  const beforeRoi = await peek();
  await p.$eval("#roi-amount", e => { e.value = "5000"; e.dispatchEvent(new Event("input")); });
  await safeClick(p, "#roi-go", 800);
  const roiResult = await body(p);
  check(roiResult.includes("抽到回报"), "an over-cap amount still invests", flat(roiResult).slice(0, 120));
  await dismiss(p, 3);
  const afterRoi = await peek();
  check(afterRoi.wallet >= 0 && afterRoi.bank >= 0, "money did not go negative",
        beforeRoi.wallet + "/" + beforeRoi.bank + " -> " + afterRoi.wallet + "/" + afterRoi.bank);
  const spent = beforeRoi.wallet + beforeRoi.bank - (afterRoi.wallet + afterRoi.bank);
  check(spent === Math.min(1000, beforeRoi.wallet + beforeRoi.bank),
        "typing 5000 charges the cap, not 5000", "spent " + spent + " of " + (beforeRoi.wallet + beforeRoi.bank));
  await safeClick(p, "#counter-leave", 600);

  // --- sleep is blocked until work + food + ROI are done -----------------------
  check(await enter(p, "你的小窝", peek), "walked home");
  const homeText = await body(p);
  check(homeText.includes("还不能睡"), "cannot sleep with the month unfinished", flat(homeText).slice(0, 140));
  check(!(await p.$("#sleep-btn")), "no sleep button while tasks are open");
  await dismiss(p, 3);
  await safeClick(p, "#counter-leave", 600);

  // --- the board's tip covers two months ---------------------------------------
  check(await goTo(p, "兼职公告板", peek), "walked to the notice board");
  await p.keyboard.press("KeyE");
  await p.waitForTimeout(800);
  const b2 = await p.$$("#draw-row .card-back");
  if (b2.length) { await b2[0].click(); await p.waitForTimeout(900); }
  const offer = await body(p);
  const words = "(会大涨|会涨一点|大概不动|会跌一点|会大跌)";
  const m = offer.match(new RegExp("工友说这个月" + words + "，下个月" + words));
  check(!!m, "the tip names this month and next", flat(offer).slice(0, 200));
  await safeClick(p, "#modal-content .pixel-btn", 700);
  await dismiss(p, 3);
  const tips = (await peek()).tips;
  if (m && tips.length) {
    const band = c => c >= 12 ? "会大涨" : c >= 4 ? "会涨一点" : c > -4 ? "大概不动" : c > -12 ? "会跌一点" : "会大跌";
    const gg = await peek();
    check(band(gg.pendingStock[tips[0]]) === m[1] && band(gg.nextStock[tips[0]]) === m[2],
          "both halves of the tip match the rolled moves",
          m[1] + "/" + m[2] + " vs " + gg.pendingStock[tips[0]] + "%/" + gg.nextStock[tips[0]] + "%");
  }

  console.log("");
  console.log("page errors: " + (errors.length ? errors.join(" | ") : "none"));
  if (errors.length) fails++;
  console.log(fails === 0 ? "PASS - all checks" : "FAIL - " + fails + " problem(s)");
  await browser.close();
  process.exit(fails ? 1 : 0);
})();

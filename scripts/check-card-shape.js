// Every place a card is drawn: is the square sheet cell still square on screen?
//
// The art sheets pack square cells, and the card paints one as a background sized to the
// element. If that element is not square the cell is stretched to fit -- at one point the
// box was 134x76 and every character came out 1.76x too wide.
//
// Needs playwright and a local server on 8934.
let chromium;
try { ({ chromium } = require("playwright")); }
catch { console.log("playwright is not installed here. npm i -D playwright && npx playwright install chromium"); process.exit(0); }
async function click(p,s,ms=520){const e=await p.$(s);if(!e)return false;await e.click({timeout:2500}).catch(()=>{});await p.waitForTimeout(ms);return true;}
let bad = 0;
const measure = async (p, tag) => {
  const rows = await p.$$eval(".game-card .card-art", els => els.map(e => {
    const r = e.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), s: +(r.width / r.height).toFixed(2) };
  }));
  if (!rows.length) { console.log(tag.padEnd(22), "no cards on screen"); return; }
  const worst = rows.reduce((a, b) => Math.abs(b.s - 1) > Math.abs(a.s - 1) ? b : a);
  const ok = Math.abs(worst.s - 1) <= 0.02;
  if (!ok) bad++;
  console.log((ok ? "OK   " : "FAIL ") + tag.padEnd(22) + rows.length + " cards, worst " + worst.w + "x" + worst.h + " (stretch " + worst.s + ")");
};
(async () => {
  for (const [name, vp] of [["desk", { width: 1280, height: 820 }], ["phone", { width: 390, height: 844 }], ["landscape", { width: 844, height: 390 }]]) {
    const b = await chromium.launch();
    const p = await b.newPage({ viewport: vp });
    await p.goto("http://localhost:8934/index.html?debug=1");
    await p.waitForSelector("text=开始新生活");
    await click(p, "#collection-btn", 900);
    await measure(p, name + " collection");
    await click(p, "#modal-close");
    await click(p, "#new-game-btn"); await click(p, "#tutorial-start", 800);
    const backs = await p.$$("#draw-row .card-back");
    if (backs.length) { await backs[0].click(); await p.waitForTimeout(1100); }
    await measure(p, name + " fate reveal");
    await b.close();
  }
  console.log(bad === 0 ? "\nPASS - no card art is stretched" : "\nFAIL - " + bad + " stretched");
  process.exit(bad ? 1 : 0);
})();

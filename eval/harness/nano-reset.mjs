// Resets Chrome's on-device model crash counter (chrome://on-device-internals) and checks a real prompt works.
import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://127.0.0.1:9333');
const ctx = b.contexts()[0];
const p = await ctx.newPage();
const text = () => p.evaluate(() => { const o = []; const w = n => { if (n.nodeType === 3 && n.textContent.trim()) o.push(n.textContent.trim()); if (n.shadowRoot) w(n.shadowRoot); n.childNodes.forEach(w); }; w(document.body); return o.join(' | '); });
await p.goto('chrome://chrome-urls'); await p.waitForTimeout(1200);
await p.getByRole('button', { name: /enable/i }).first().click({ timeout: 2000 }).catch(() => {});
await p.goto('chrome://on-device-internals'); await p.waitForTimeout(3000);
await p.getByRole('button', { name: /^reset$/i }).click().catch(() => {});
await p.waitForTimeout(1000);
console.log((await text()).match(/Model crash count[^|]*\|[^|]*\|[^|]*\|[^|]*/)?.[0]);
await p.goto('http://localhost:4173/#/device'); await p.waitForTimeout(2500);
console.log(JSON.stringify(await p.evaluate(async () => {
  try { const a = await LanguageModel.availability(); const s = await LanguageModel.create(); const t0 = performance.now(); const r = await s.prompt('Say hello in three words.'); s.destroy(); return { a, r, ms: Math.round(performance.now() - t0) }; } catch (e) { return { err: e.name + ': ' + e.message }; }
})));
await p.close();
process.exit(0);

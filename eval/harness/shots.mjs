// Screenshot Studio + Notes at 1280 and 390, light and dark, via the gate Chrome (CDP).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const out = process.argv[2] || '.measure/shots';
const routes = (process.argv[3] || '/#/,/#/probe,/#/frontier,/#/policy,/#/device,/#/atlas,/#/receipts,/#/guard,/#/start,/notes/').split(',');
const widths = (process.argv[4] || '1280,390').split(',').map(Number);
const themes = (process.argv[5] || 'light,dark').split(',');
fs.mkdirSync(out, { recursive: true });
const b = await chromium.connectOverCDP('http://127.0.0.1:9333');
const ctx = b.contexts()[0];
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', e => errors.push(`${p.url()} :: ${e.message}`));
p.on('console', m => { if (m.type() === 'error') errors.push(`${p.url()} :: console: ${m.text().slice(0, 200)}`); });
for (const theme of themes) {
  for (const w of widths) {
    await p.setViewportSize({ width: w, height: w > 600 ? 900 : 844 });
    for (const r of routes) {
      await p.goto(`${process.env.BASE || 'http://localhost:4173'}${r}`);
      await p.evaluate(t => { localStorage.setItem('tandem-theme', t); document.documentElement.dataset.theme = t; }, theme);
      await p.waitForTimeout(r.includes('guard') ? 2500 : 1800);
      const name = `${r.replace(/[^a-z]/gi, '') || 'home'}-${w}-${theme}.png`;
      await p.screenshot({ path: `${out}/${name}`, fullPage: true });
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1) errors.push(`${name}: horizontal overflow ${overflow}px`);
    }
  }
}
console.log(errors.length ? errors.join('\n') : 'no page errors, no horizontal overflow');
await p.close();
process.exit(0);

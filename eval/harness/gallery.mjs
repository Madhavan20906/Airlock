// Devpost gallery: 1500x1000 (3:2) screenshots of the real app with real data.
// Usage: node eval/harness/gallery.mjs <base-url> <out-dir>
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const [base = 'http://localhost:4173', out = 'docs/gallery'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.connectOverCDP('http://127.0.0.1:9333');
const ctx = b.contexts()[0];
const p = await ctx.newPage();
await p.setViewportSize({ width: 1500, height: 1000 });
const shots = [
  ['01-overview', '/#/', null],
  ['02-probe', '/#/probe?run=reference', null],
  ['03-frontier', '/#/frontier?run=reference', null],
  ['04-evidence', '/#/frontier?run=reference', async () => { await p.click('.mult'); await p.waitForTimeout(600); }],
  ['05-policy', '/#/policy?run=reference', null],
  ['06-notes', '/notes/', null],
  ['07-guard-lab', '/#/guard', null],
  ['08-receipts', '/#/receipts', null],
  ['09-device', '/#/device', null]
];
for (const [name, path, act] of shots) {
  await p.goto(base + path);
  await p.evaluate(() => { localStorage.setItem('tandem-theme', 'light'); document.documentElement.dataset.theme = 'light'; });
  await p.waitForTimeout(name.includes('guard') ? 2500 : 1800);
  if (act) await act();
  await p.screenshot({ path: `${out}/${name}.png` });
  console.log('saved', name);
}
await p.close();
process.exit(0);

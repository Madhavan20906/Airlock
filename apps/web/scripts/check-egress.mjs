// Fails if any page of the built app requests a third-party host (fonts, CDNs, analytics).
// Allowed: this origin, Firebase/Google APIs (AI Logic, App Check, Auth, Firestore, Remote Config) and reCAPTCHA for App Check.
// Usage: pnpm --filter @tandem/studio build && pnpm --filter @tandem/studio check:egress
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const PORT = 4179;
const BASE = `http://localhost:${PORT}`;
const ALLOW = [/^localhost$/, /\.googleapis\.com$/, /^www\.google\.com$/, /^www\.gstatic\.com$/, /^recaptcha\.google\.com$/];
const PAGES = ['/', '/studio/#/', '/studio/#/probe', '/studio/#/frontier', '/studio/#/policy', '/studio/#/atlas', '/studio/#/receipts', '/studio/#/guard', '/studio/#/device', '/notes/'];

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const bad = new Set();
let browser;
try {
  await new Promise(r => setTimeout(r, 2500));
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  page.on('request', req => {
    const host = new URL(req.url()).hostname;
    if (req.url().startsWith('data:') || req.url().startsWith('blob:')) return;
    if (!ALLOW.some(a => a.test(host))) bad.add(host);
  });
  for (const p of PAGES) { await page.goto(BASE + p, { waitUntil: 'load' }); await page.waitForTimeout(1200); }
} finally {
  await browser?.close();
  server.kill();
}
if (bad.size) { console.error(`FAIL third-party requests: ${[...bad].join(', ')}`); process.exit(1); }
console.log(`ok: ${PAGES.length} pages, no third-party requests`);

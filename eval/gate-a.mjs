// Gate A: ONLY_ON_DEVICE via Firebase AI Logic, online then fully offline (CDP network emulation).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const b = await chromium.connectOverCDP('http://127.0.0.1:9333');
const ctx = b.contexts()[0];
const p = ctx.pages().find(p => p.url().includes('gate.html'));
await p.reload();
await p.waitForLoadState('domcontentloaded');
const runOnce = async () => {
  const before = await p.evaluate(() => window.gate.results.length);
  await p.click('#run');
  for (let i = 0; i < 240; i++) {
    await p.waitForTimeout(500);
    const r = await p.evaluate(n => window.gate.results[n], before);
    if (r) return r;
  }
  return { error: 'no result in 120 s' };
};
const avail = await p.evaluate(async () => LanguageModel.availability());
const online = await runOnce();
const cdp = await ctx.newCDPSession(p);
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
const offlineFlag = await p.evaluate(() => navigator.onLine);
const offline = await runOnce();
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
const out = {
  date: new Date().toISOString(),
  chrome: (await b.version()),
  availability: avail,
  online,
  offline: { ...offline, navigatorOnLine: offlineFlag },
  machine: { cpu: '13th Gen Intel Core i5-1334U (10C/12T)', gpu: 'Intel Iris Xe Graphics (integrated)', ramBytes: 16806248448, os: 'Windows 11 Home 10.0.26300' },
  chromeProfile: 'separate profile on D: (C: had < 1 GB free); flags: OptimizationGuideOnDeviceModel, PromptAPIForGeminiNano (no performance bypass)'
};
fs.writeFileSync('gate-a-result.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
process.exit(0);

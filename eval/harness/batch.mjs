// Batched probe runs, one task type per batch, results appended to a JSONL file as each batch ends.
// Usage: node batch.mjs <base> <split: calibration|heldout> <lanes: local|cloud> <out.jsonl> [types]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const [base, split, lanes, out, typesArg] = process.argv.slice(2);
const TYPES = (typesArg || 'classify,extract,rewrite,summarize,translate,qa,json_reliability,instruction').split(',');
const done = new Set(fs.existsSync(out) ? fs.readFileSync(out, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l).type) : []);
async function runType(type) {
  // Fresh CDP connection per task type: a dropped socket must not doom the remaining types
  const b = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const ctx = b.contexts()[0];
  // Open the new tab first and keep about:blank alive, so closing old tabs never closes the browser
  const p = await ctx.newPage();
  for (const pg of ctx.pages()) if (pg !== p && !/gate.html|about:blank/.test(pg.url())) await pg.close();
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.goto(`${base}/#/probe?lanes=${lanes}&split=${split}&types=${type}&cc=${process.env.CC || 3}`);
  await p.waitForTimeout(3000);
  await p.click('[data-mode="full"]');
  await p.waitForTimeout(400);
  const t0 = Date.now();
  await p.click('#start');
  let ok = true;
  for (;;) {
    await p.waitForTimeout(5000);
    const running = await p.evaluate(() => Boolean(document.querySelector('#abort'))).catch(() => null);
    if (running === null) { ok = false; console.log(`${type}: page lost`); break; }
    if (!running) break;
    if (Date.now() - t0 > 20 * 60 * 1000) { await p.click('#abort'); ok = false; break; }
  }
  await p.waitForTimeout(1500);
  const results = await p.evaluate(() => new Promise(res => {
    const r = indexedDB.open('tandem', 1);
    r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').get('myRun'); q.onsuccess = () => res(q.result ?? []); };
  })).catch(() => []);
  const mine = results.filter(r => r.taskType === type);
  const score = await p.evaluate(() => document.querySelector('.scoreline')?.textContent?.replace(/\s+/g, ' ').trim()).catch(() => '');
  console.log(`${type}: ${mine.length} results in ${Math.round((Date.now() - t0) / 1000)}s · ${score}`);
  // Refuse to save a batch where the backend was mostly unavailable (e.g. the model process crashed): rerun instead
  const broken = mine.filter(r => r.error === 'unavailable').length > mine.length / 2;
  if (broken) { console.log(`${type}: backend mostly unavailable, not saving`); ok = false; }
  if (ok && mine.length) fs.appendFileSync(out, JSON.stringify({ type, split, lanes, at: new Date().toISOString(), results: mine }) + '\n');
  await p.close().catch(() => {});
  return ok && mine.length > 0;
}

for (const type of TYPES) {
  if (done.has(type)) { console.log(`skip ${type} (already saved)`); continue; }
  let saved = false;
  for (let attempt = 1; attempt <= 2 && !saved; attempt++) {
    try { saved = await runType(type); } catch (e) { console.log(`${type}: attempt ${attempt} failed: ${String(e.message).split(/\r?\n/)[0]}`); }
  }
  if (!saved) console.log(`${type}: NOT SAVED (will need a rerun)`);
}
process.exit(0);

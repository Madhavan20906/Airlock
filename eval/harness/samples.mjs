// Captures the two real samples the landing page shows (nothing is typed by hand):
//  1) a paired quick probe (both lanes, 12 tasks) -> eval/results/probe-quick-<date>.json + probe-paired-example-<date>.json
//  2) Tandem Notes "Summarise" on the synthetic tax note, through the real router -> eval/results/notes-sample-<date>.json
// Usage: node eval/harness/samples.mjs <studio-base> <notes-url>
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const [studio = 'http://localhost:4173/studio', notesUrl = 'http://localhost:4173/notes/'] = process.argv.slice(2);
const date = new Date().toISOString().slice(0, 10);
const b = await chromium.connectOverCDP('http://127.0.0.1:9333');
const ctx = b.contexts()[0];
const p = await ctx.newPage();
for (const pg of ctx.pages()) if (pg !== p && !/about:blank/.test(pg.url())) await pg.close();
await p.setViewportSize({ width: 1280, height: 900 });

// 1) Paired quick probe (default mode is Quick; both lanes; one cloud call at a time)
await p.goto(`${studio}/#/probe?cc=1`);
await p.waitForTimeout(3000);
await p.click('#start');
for (let i = 0; i < 160; i++) { await p.waitForTimeout(5000); if (!(await p.$('#abort'))) break; }
await p.waitForTimeout(1500);
const run = await p.evaluate(() => new Promise(res => { const r = indexedDB.open('tandem', 1); r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').get('myRun'); q.onsuccess = () => res(q.result ?? []); }; }));
fs.writeFileSync(`eval/results/probe-quick-${date}.json`, JSON.stringify({ measuredAt: new Date().toISOString(), mode: 'quick, both lanes, cloud concurrency 1', results: run }, null, 1));
const byTask = id => ({ local: run.find(r => r.taskId === id && r.backend === 'on_device'), cloud: run.find(r => r.taskId === id && r.backend === 'in_cloud') });
const preferred = ['instruction-S-01', 'summarize-S-02', 'rewrite-S-03', 'classify-S-01'];
let pair = null;
for (const id of preferred) { const x = byTask(id); if (x.local?.ok && x.cloud?.ok && x.local.outputPreview && x.cloud.outputPreview) { pair = { taskId: id, ...x }; break; } }
if (pair) fs.writeFileSync(`eval/results/probe-paired-example-${date}.json`, JSON.stringify({ note: 'One task from the paired quick probe, both lanes, real outputs.', ...pair }, null, 1));
console.log('quick probe:', run.length, 'runs; paired example:', pair?.taskId ?? 'none');

// 2) Tandem Notes, Summarise on the synthetic tax note
await p.goto(notesUrl);
await p.waitForTimeout(3000);
await p.click('[data-note="seed-tax"]');
await p.waitForTimeout(500);
await p.click('[data-act="summarize"]');
for (let i = 0; i < 60; i++) { await p.waitForTimeout(2000); if (await p.$('.result .route')) break; }
const sample = await p.evaluate(() => ({
  route: document.querySelector('.result .route')?.textContent?.trim(),
  why: document.querySelector('.result .callout')?.textContent?.trim(),
  output: document.querySelector('.result .result-out')?.textContent?.trim(),
  left: document.querySelector('.result .spread .faint')?.textContent?.trim()
}));
fs.writeFileSync(`eval/results/notes-sample-${date}.json`, JSON.stringify({ measuredAt: new Date().toISOString(), note: 'seed-tax (synthetic)', action: 'Summarise', ...sample }, null, 1));
console.log('notes sample:', JSON.stringify(sample).slice(0, 400));
await p.close();
process.exit(0);

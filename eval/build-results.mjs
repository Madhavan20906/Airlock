// The single source of every published number. Assembles probe batches into committed result files,
// runs the held-out validation (registered 8 s budget + a labelled 30 s background-budget view),
// and regenerates: the Reference Run, the Studio headline, the README results block and the landing
// page's generated blocks. Nothing here is typed by hand.
//   node eval/build-results.mjs <cal-local.jsonl> <cal-cloud.jsonl> <held-local.jsonl> <held-cloud.jsonl> [paired-example.json]
import fs from 'node:fs';
import { aggregate, compilePolicy, percentile, lookupRule } from '../packages/tandem-policy/dist/index.js';
import { runLeakLab } from '../packages/tandem-guard/dist/index.js';
import { validatePolicy } from './policy-validation.mjs';

const [calL, calC, heldL, heldC, pairedFile] = process.argv.slice(2);
const read = f => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).flatMap(l => JSON.parse(l).results) : []);
const strip = r => { const { env, outputPreview, ...x } = r; return { ...x, env: { chromeMajor: env?.chromeMajor, osFamily: env?.osFamily, availability: env?.availability } }; };
const cal = [...read(calL), ...read(calC)].map(strip);
const held = [...read(heldL), ...read(heldC)].map(strip);
const date = new Date().toISOString().slice(0, 10);
const gate = JSON.parse(fs.readFileSync('eval/results/gate-a-2026-11-26.json', 'utf8'));
const meta = {
  measuredAt: new Date().toISOString(),
  chrome: gate.chrome,
  machine: 'Intel Core i5-1334U (10C/12T), Intel Iris Xe (integrated), 16 GB RAM, Windows 11',
  model: { onDevice: 'Gemini Nano (nano_v3_gpu, performance class High) via Firebase AI Logic ONLY_ON_DEVICE', cloud: 'gemini-3.5-flash-lite via Firebase AI Logic ONLY_IN_CLOUD' },
  battery: 'tandem-battery-v1 (192 synthetic tasks; split fixed by hash)',
  notes: 'Owner run, one task type per batch, repeats=1. On-device and cloud lanes run in separate batches on the same tasks. Cloud lane used an App Check debug token (dev only). Rate-limited (HTTP 429) and unavailable runs are recorded but excluded from quality stats.'
};
fs.writeFileSync(`eval/results/probe-calibration-${date}.json`, JSON.stringify({ ...meta, split: 'calibration', results: cal }, null, 1));
fs.writeFileSync(`eval/results/probe-heldout-${date}.json`, JSON.stringify({ ...meta, split: 'heldout', results: held }, null, 1));

const REGISTERED = 8000, BACKGROUND = 30000;
const v = validatePolicy(cal, held);                                    // registered parameters
const vBg = validatePolicy(cal, held, { latencyBudgetMs: BACKGROUND }); // sensitivity view, labelled
fs.writeFileSync(`eval/results/policy-validation-${date}.json`, JSON.stringify({
  generatedAt: meta.measuredAt, ...meta, registered: { latencyBudgetMs: REGISTERED, ...v },
  sensitivity: { note: 'Not the registered policy. Same rule with a 30 s p95 budget, for background tasks.', latencyBudgetMs: BACKGROUND, ...vBg }
}, null, 2));

const guard = runLeakLab();

// Reference run for judges without Nano: calibration measurements, labelled.
fs.writeFileSync('apps/web/public/reference-run.json', JSON.stringify({
  label: 'Reference run', measuredAt: meta.measuredAt, chrome: meta.chrome, machine: 'author\'s laptop: Intel i5-1334U, Iris Xe, 16 GB, Windows 11',
  battery: meta.battery, notes: 'Calibration split only. Source: eval/results/probe-calibration-' + date + '.json', results: cal
}));

const lat = (rs, b) => percentile(rs.filter(r => r.backend === b && r.ok).map(r => r.totalMs), 50);
fs.writeFileSync('apps/web/public/headline.json', JSON.stringify({
  source: `eval/results/policy-validation-${date}.json`, measuredAt: meta.measuredAt, chrome: meta.chrome, machine: meta.machine,
  nHeldout: v.nHeldoutTasks, servedOnDevice: v.servedOnDevice, qualityRetained: v.qualityRetainedVsAllCloud,
  passTandem: v.passRate.tandem.p, passCloud: v.passRate.allCloud.p, passLocal: v.passRate.allLocal.p,
  cloudCallsAvoided: v.cloudCallsAvoided, escalations: v.escalations, rescued: v.escalationsThatRescued,
  p50Tandem: v.latencyMs.tandem.p50, p50Cloud: v.latencyMs.allCloud.p50,
  background: { latencyBudgetMs: BACKGROUND, servedOnDevice: vBg.servedOnDevice, qualityRetained: vBg.qualityRetainedVsAllCloud, passTandem: vBg.passRate.tandem.p }
}, null, 2));

const pct = (x, d = 0) => (x === null || x === undefined ? 'n/a' : `${(x * 100).toFixed(d)}%`);
const ms = x => (x === null || x === undefined ? 'n/a' : x < 1000 ? `${Math.round(x)} ms` : `${(x / 1000).toFixed(1)} s`);
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// ---------------------------------------------------------------- landing page generated blocks
const policy = compilePolicy(cal);
const rule = lookupRule(policy, 'summarize', 'S');
const ev = rule.evidence, P = policy.params;
const check = (ok, label, val) => `<li class="${ok ? 'is-pass' : 'is-fail'}"><span>${label}</span><b>${val}</b></li>`;
const evidenceBlock = `<p class="evidence__rule"><span class="tag ${rule.route === 'LOCAL_FIRST' ? 'tag--local' : 'tag--cloud'}">${rule.route === 'LOCAL_FIRST' ? 'Local-first' : 'Cloud-first'}</span><span class="evidence__name">Summarise · short</span></p>
          <ul class="checks" role="list">
            ${check(ev.n >= P.minN, `At least ${P.minN} distinct tasks`, ev.n)}
            ${check((ev.wilsonLoLocal ?? 0) >= P.qualityFloor, `On-device pass rate, 95% lower bound ≥ ${pct(P.qualityFloor)}`, pct(ev.wilsonLoLocal))}
            ${check(ev.passCloud === null || (ev.passLocal ?? 0) >= ev.passCloud - P.tolerance, `Within ${Math.round(P.tolerance * 100)} points of the cloud`, `${pct(ev.passLocal)} vs ${pct(ev.passCloud)}`)}
            ${check(ev.p95Local !== null && ev.p95Local <= P.latencyBudgetMs, `On-device p95 latency ≤ ${P.latencyBudgetMs / 1000} s`, ms(ev.p95Local))}
          </ul>
          <p class="evidence__why">${esc(ev.why)}</p>`;

const heldLocal = held.filter(r => r.backend === 'on_device');
const resultsBlock = `<div class="stats" data-moment="counter-rolls">
        <div class="stat"><p class="t-stat">${pct(v.passRate.allLocal.p)}</p><p class="t-small muted">of ${v.nHeldoutTasks} held-out tasks passed on Gemini Nano alone</p></div>
        <div class="stat"><p class="t-stat">${pct(v.passRate.allCloud.p)}</p><p class="t-small muted">passed in the cloud with gemini-3.5-flash-lite</p></div>
        <div class="stat"><p class="t-stat">${ms(lat(held, 'on_device'))}</p><p class="t-small muted">median on-device answer, against ${ms(lat(held, 'in_cloud'))} in the cloud</p></div>
        <div class="stat"><p class="t-stat">${pct(vBg.servedOnDevice)}</p><p class="t-small muted">kept on-device with a 30-second budget for background work</p></div>
      </div>
      <div class="compare" role="table" aria-label="Held-out pass rate and on-device share by routing strategy">
        ${[
          ['Tandem, 8 s budget', v.passRate.tandem.p, v.servedOnDevice],
          ['Tandem, 30 s budget', vBg.passRate.tandem.p, vBg.servedOnDevice],
          ['All cloud', v.passRate.allCloud.p, 0],
          ['All on-device', v.passRate.allLocal.p, 1]
        ].map(([name, pass, share]) => `<div class="compare__row" role="row"><span role="rowheader">${name}</span><span class="compare__bar" role="cell" aria-label="${name}: ${pct(pass, 1)} passed, ${pct(share)} on-device"><i class="is-local" style="width:${((pass ?? 0) * share * 100).toFixed(1)}%"></i><i class="is-cloud" style="width:${((pass ?? 0) * (1 - share) * 100).toFixed(1)}%"></i></span><b role="cell">${pct(pass, 1)}</b><span class="compare__note" role="cell">${pct(share)} on-device</span></div>`).join('\n        ')}
      </div>`;

let paired = null;
if (pairedFile && fs.existsSync(pairedFile)) paired = JSON.parse(fs.readFileSync(pairedFile, 'utf8'));
const laneHtml = (r, cls, name, mode) => {
  const tps = r.ok && r.totalMs && r.ttftMs !== null ? r.outTokensEst / Math.max(0.05, (r.totalMs - r.ttftMs) / 1000) : null;
  return `<div class="lane lane--${cls}">
              <div class="lane__head"><span class="lane__name">${name}</span><span class="lane__mode">${mode}</span></div>
              <dl class="lane__meters"><div><dt>First token</dt><dd>${ms(r.ttftMs)}</dd></div><div><dt>Tokens a second</dt><dd>${tps === null ? 'n/a' : tps.toFixed(1)}</dd></div><div><dt>Answer</dt><dd>${ms(r.totalMs)}</dd></div></dl>
              <pre class="lane__out">${esc((r.outputPreview ?? '').trim())}</pre>
              <p class="lane__foot"><span class="chip ${r.passed ? 'chip--pass' : 'chip--fail'}">${r.passed ? 'validators passed' : 'validators failed'}</span><span class="lane__src">inferenceSource: ${r.servedBy}</span></p>
            </div>`;
};
const lanesBlock = paired ? `<div class="lanes">
            ${laneHtml(paired.local, 'local', 'On-device', 'Gemini Nano · ONLY_ON_DEVICE')}
            ${laneHtml(paired.cloud, 'cloud', 'Cloud', 'gemini-3.5-flash-lite · ONLY_IN_CLOUD')}
          </div>` : null;

let landing = fs.readFileSync('apps/web/index.html', 'utf8');
const put = (id, html) => {
  const re = new RegExp(`(<!-- GEN:${id} -->)[\\s\\S]*?(<!-- /GEN:${id} -->)`);
  if (!re.test(landing)) throw new Error(`landing marker GEN:${id} missing`);
  landing = landing.replace(re, `$1\n          ${html}\n          $2`);
};
// Hero window: the real Tandem Notes answer captured by eval/harness/samples.mjs
const latest = prefix => fs.readdirSync('eval/results').filter(f => f.startsWith(prefix)).sort().pop();
const notesFile = latest('notes-sample-');
if (notesFile) {
  const n = JSON.parse(fs.readFileSync(`eval/results/${notesFile}`, 'utf8'));
  const guardLine = (n.why ?? '').split('.')[0];
  put('hero-answer', `<div class="d-tool" data-step>${esc(guardLine)}.</div>
                <div class="d-msg d-msg--bot" data-step>${esc(n.output ?? '')}<small>${esc(n.route ?? '')} · ${esc((n.left ?? '').replace(/\.$/, ''))}</small></div>`);
}
const pairedLatest = latest('probe-paired-example-');
if (!paired && pairedLatest) paired = JSON.parse(fs.readFileSync(`eval/results/${pairedLatest}`, 'utf8'));
if (paired) put('lanes', `<div class="lanes">
            ${laneHtml(paired.local, 'local', 'On-device', 'Gemini Nano · ONLY_ON_DEVICE')}
            ${laneHtml(paired.cloud, 'cloud', 'Cloud', 'gemini-3.5-flash-lite · ONLY_IN_CLOUD')}
          </div>`);
put('evidence', evidenceBlock);
put('results', resultsBlock);
put('held-n', `${v.nHeldoutTasks}`);
put('guard', `${guard.caught + guard.blocked}`);
put('guard-n', `${guard.total}`);
if (lanesBlock) put('lanes', lanesBlock);
fs.writeFileSync('apps/web/index.html', landing);

// ---------------------------------------------------------------- README block
const { byType } = aggregate(cal);
const rows = byType.sort((a, b) => a.taskType.localeCompare(b.taskType)).map(c =>
  `| ${c.taskType} | ${c.local.passes}/${c.local.n} (${pct(c.local.passRate)}) | ${c.cloud.passes}/${c.cloud.n} (${pct(c.cloud.passRate)}) | ${ms(c.local.p50Ms)} | ${ms(c.cloud.p50Ms)} | ${policy.rules.filter(r => r.taskType === c.taskType && r.route === 'LOCAL_FIRST').length}/3 |`);
const block = `**Held-out validation.** The policy is compiled from the calibration split only and replayed on ${v.nHeldoutTasks} held-out tasks measured on both models (\`eval/results/policy-validation-${date}.json\`).

| | Tandem, registered policy (8 s p95 budget) | Tandem, 30 s background budget (sensitivity view) | All cloud | All on-device |
|---|---|---|---|---|
| Tasks passing validators | ${pct(v.passRate.tandem.p, 1)} | ${pct(vBg.passRate.tandem.p, 1)} | ${pct(v.passRate.allCloud.p, 1)} | ${pct(v.passRate.allLocal.p, 1)} |
| Served on-device | ${pct(v.servedOnDevice, 1)} | ${pct(vBg.servedOnDevice, 1)} | 0% | 100% |
| p50 / p95 latency | ${ms(v.latencyMs.tandem.p50)} / ${ms(v.latencyMs.tandem.p95)} | ${ms(vBg.latencyMs.tandem.p50)} / ${ms(vBg.latencyMs.tandem.p95)} | ${ms(v.latencyMs.allCloud.p50)} / ${ms(v.latencyMs.allCloud.p95)} | ${ms(v.latencyMs.allLocal.p50)} / ${ms(v.latencyMs.allLocal.p95)} |
| Quality escalations (rescued) | ${v.escalations} (${v.escalationsThatRescued}) | ${vBg.escalations} (${vBg.escalationsThatRescued}) | | |

**What this says.** On this laptop's integrated GPU, Gemini Nano passes most tasks but answers several times slower than the cloud. At the registered 8-second interactive budget the policy keeps ${pct(v.servedOnDevice)} on-device; with a 30-second budget for background work it keeps ${pct(vBg.servedOnDevice)}. Sensitive content is routed on-device by Tandem Guard regardless of budget. The budget is the developer's choice; Tandem shows what each choice costs.

**Calibration probe by task type** (${cal.length} runs; \`eval/results/probe-calibration-${date}.json\`):

| Task type | On-device pass | Cloud pass | On-device p50 | Cloud p50 | Local-first lengths (8 s) |
|---|---|---|---|---|---|
${rows.join('\n')}

Rate-limited (HTTP 429) and unavailable runs are recorded in the raw files and excluded from pass rates.

**Gate A** (\`eval/results/gate-a-2026-11-26.json\`): Firebase AI Logic \`ONLY_ON_DEVICE\` returned \`inferenceSource: "on_device"\` online and with the network disabled.

**Tandem Guard** (computed by \`runLeakLab()\` at build time): ${guard.total}-case adversarial corpus with an independent oracle: ${guard.caught} caught, ${guard.blocked} blocked, ${guard.missed} missed. Held-out Guard benchmark: run \`pnpm eval:heldout\`.

Machine: ${meta.machine}, Chrome ${meta.chrome}. Validators are deterministic quality proxies (see Limitations).`;

const readme = fs.readFileSync('README.md', 'utf8');
fs.writeFileSync('README.md', readme.replace(/<!-- RESULTS:START -->[\s\S]*<!-- RESULTS:END -->/, `<!-- RESULTS:START -->\n${block}\n<!-- RESULTS:END -->`));
console.log(block);

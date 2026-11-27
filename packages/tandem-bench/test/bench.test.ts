import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validate, runValidator, extractJson, norm, generateBattery, quickProbe, splitFor, ProbeRunner, classifyError
} from '../dist/index.js';
import type { GenerateOutput } from '../dist/index.js';

// ---------------------------------------------------------------- validators (incl. adversarial outputs)

test('validators: exact / contains normalise case, punctuation, Indic digits and thousands separators', () => {
  assert.equal(runValidator({ kind: 'exact', value: 'refund' }, '  Refund. ').passed, true);
  assert.equal(runValidator({ kind: 'exact', value: 'refund' }, 'The category is refund').passed, false);
  assert.equal(runValidator({ kind: 'contains', values: ['3450'] }, 'It stores 3,450 units').passed, true);
  assert.equal(runValidator({ kind: 'contains', values: ['42'] }, 'संख्या ४२ है').passed, true);
  assert.equal(norm('Ⅻ'), 'xii');
});

test('validators: JSON extraction survives fences and prose; partial/invalid JSON fails', () => {
  assert.deepEqual(extractJson('Sure! ```json\n{"a": 1, "b": {"c": "}"}}\n``` done'), { a: 1, b: { c: '}' } });
  assert.equal(extractJson('{"a": 1, "b": '), undefined);
  assert.equal(extractJson(''), undefined);
  const schema = { kind: 'json_schema', required: { total: 'number', vendor: 'string' } } as const;
  assert.equal(runValidator(schema, '{"total": "48,250", "vendor": "Kaveri Textiles"}').passed, true);
  assert.equal(runValidator(schema, '{"total": "about fifty", "vendor": "x"}').passed, false);
  assert.equal(runValidator(schema, '{"total": 5}').score, 0.5);
  assert.equal(runValidator(schema, 'no json here').passed, false);
});

test('validators: field_f1 penalises missing and extra fields', () => {
  const v = { kind: 'field_f1', expected: { a: 'x', b: 2 }, threshold: 0.8 } as const;
  assert.equal(runValidator(v, '{"a":"x","b":2}').passed, true);
  assert.equal(runValidator(v, '{"a":"x"}').passed, false);
  assert.ok(runValidator(v, '{"a":"x","b":2,"c":1,"d":2,"e":3}').score < 0.8);
});

test('validators: refusal, empty output, length, script, bullets', () => {
  assert.equal(runValidator({ kind: 'no_refusal' }, "I'm sorry, but I can't help with that.").passed, false);
  assert.equal(runValidator({ kind: 'no_refusal' }, 'As an AI language model, I cannot translate this.').passed, false);
  assert.equal(runValidator({ kind: 'no_refusal' }, '   ').passed, false);
  assert.equal(runValidator({ kind: 'no_refusal' }, 'Refund').passed, true);
  assert.equal(runValidator({ kind: 'max_len', words: 3 }, 'one two three four').passed, false);
  assert.equal(runValidator({ kind: 'max_len', words: 3 }, '').passed, false, 'empty is not a valid short answer');
  assert.equal(runValidator({ kind: 'script_present', script: 'Tamil' }, 'கிளினிக் இரவு 8 மணி வரை திறந்திருக்கும்').passed, true);
  assert.equal(runValidator({ kind: 'script_present', script: 'Tamil' }, 'The clinic stays open').passed, false);
  assert.equal(runValidator({ kind: 'script_present', script: 'Devanagari' }, 'கிளினிக்').passed, false, 'wrong script');
  assert.equal(runValidator({ kind: 'bullets', count: 3, maxWords: 5 }, '- a b\n- c d\n- e f').passed, true);
  assert.equal(runValidator({ kind: 'bullets', count: 3 }, 'Tips:\n- a\n- b\n- c').passed, false, 'extra title line');
  assert.equal(runValidator({ kind: 'bullets', count: 3 }, '- a\n- b').passed, false);
});

test('validate: failed validators map to escalation triggers', () => {
  const r = validate([{ kind: 'json_schema', required: { a: 'number' } }, { kind: 'max_len', words: 2 }, { kind: 'no_refusal' }], 'I cannot help with that request at all');
  assert.equal(r.passed, false);
  assert.deepEqual(r.failedTriggers.sort(), ['length', 'refusal', 'schema']);
});

// ---------------------------------------------------------------- battery

test('battery: 192 tasks, 8 per (type, length), deterministic, ids unique, hash split balanced', () => {
  const a = generateBattery();
  const b = generateBattery();
  assert.equal(a.length, 192);
  assert.deepEqual(a, b, 'deterministic');
  assert.equal(new Set(a.map(t => t.id)).size, 192);
  for (const t of a) assert.equal(t.split, splitFor(t.id));
  const cal = a.filter(t => t.split === 'calibration').length;
  assert.ok(cal > 70 && cal < 122, `calibration ${cal}`);
  // Every task type has >= 8 calibration tasks (so the policy can decide at type level)
  for (const type of new Set(a.map(t => t.type))) {
    assert.ok(a.filter(t => t.type === type && t.split === 'calibration').length >= 8, `${type} calibration < 8`);
  }
  // Length buckets roughly honoured
  const avg = (bk: string) => a.filter(t => t.lengthBucket === bk).reduce((s, t) => s + t.tokensEst, 0) / 64;
  assert.ok(avg('S') < 200 && avg('M') > 200 && avg('M') < 800 && avg('L') > 800 && avg('L') < 2000, `S ${avg('S')} M ${avg('M')} L ${avg('L')}`);
  assert.ok(a.some(t => t.sensitive));
});

test('battery: every task\'s own reference answer passes its validators (labels are self-consistent)', () => {
  // A cheap oracle per type proves the validators are satisfiable for every generated task.
  for (const t of generateBattery()) {
    let ref = '';
    const v0: any = t.validators[0];
    switch (t.type) {
      case 'classify': ref = v0.value; break;
      case 'qa': ref = v0.values[0]; break;
      case 'extract': {
        const e = (t.validators[1] as any).expected;
        ref = JSON.stringify({ invoice_number: e.invoice_number, date: '1 Jan 2026', vendor: e.vendor, total: e.total, currency: e.currency });
        break;
      }
      case 'json_reliability': {
        const e = (t.validators[1] as any).expected;
        ref = JSON.stringify({ title: 'x', attendees: e.attendees, online: e.online === 'true', tags: ['a'] });
        break;
      }
      case 'instruction': ref = '- one tip\n- two tip\n- three tip'; break;
      case 'translate': ref = { Hindi: 'क्लिनिक ', Tamil: 'கிளினிக் ', Bengali: 'ক্লিনিক ', Telugu: 'క్లినిక్ ' }[t.targetLanguage!]! + (t.validators[1] as any).facts[0]; break;
      default: ref = (t.validators[0] as any).facts.join(' ');
    }
    const r = validate(t.validators, ref);
    assert.equal(r.passed, true, `${t.id}: ${JSON.stringify(r.results.filter(x => !x.passed))}`);
  }
});

test('quick probe: 12 fixed tasks covering all 8 types', () => {
  const q = quickProbe();
  assert.equal(q.length, 12);
  assert.equal(new Set(q.map(t => t.type)).size, 8);
});

// ---------------------------------------------------------------- runner

const ok = (servedBy: 'on_device' | 'in_cloud', text: string): GenerateOutput => ({ text, servedBy, ttftMs: 5, totalMs: 20 });

test('runner: both lanes run, results carry SDK servedBy, cap respected, sensitive needs Guard', async () => {
  const tasks = generateBattery().slice(0, 10);
  let cloudPrompts: string[] = [];
  const r = new ProbeRunner({
    tasks, maxCloudCalls: 4, sleep: async () => {},
    backends: {
      on_device: async () => ok('on_device', 'billing'),
      in_cloud: async p => { cloudPrompts.push(p); return ok('in_cloud', 'billing'); }
    }
  });
  const res = await r.run();
  assert.equal(res.filter(x => x.backend === 'on_device').length, 10);
  assert.equal(res.filter(x => x.backend === 'in_cloud').length, 4, 'cloud cap');
  assert.ok(res.every(x => x.servedBy === x.backend));
});

test('runner: sensitive tasks are never sent to cloud unredacted', async () => {
  const sensitive = generateBattery().filter(t => t.sensitive).slice(0, 3);
  const sent: string[] = [];
  await new ProbeRunner({ tasks: sensitive, backends: { in_cloud: async p => { sent.push(p); return ok('in_cloud', 'x'); } } }).run();
  assert.equal(sent.length, 0, 'skipped without a Guard');
  await new ProbeRunner({ tasks: sensitive, prepareCloudInput: () => '[REDACTED]', backends: { in_cloud: async p => { sent.push(p); return ok('in_cloud', 'x'); } } }).run();
  assert.equal(sent.length, 3);
  assert.ok(sent.every(p => p.includes('[REDACTED]') && !/Aadhaar \d|PAN [A-Z]{5}/.test(p)));
});

test('runner: unavailable vs quota vs timeout classified; quota retried with backoff', async () => {
  assert.equal(classifyError(Object.assign(new Error('x'), { name: 'NotSupportedError' })), 'unavailable');
  assert.equal(classifyError(new Error('[429 Too Many Requests]')), 'quota');
  assert.equal(classifyError(new Error('timeout after 10 ms')), 'timeout');
  assert.equal(classifyError(new Error('timeout after 40300 ms')), 'timeout', 'a number in a timeout is not an HTTP status');
  assert.equal(classifyError(new Error('[401 Unauthorized] Firebase App Check token is invalid.')), 'unavailable');
  let calls = 0;
  const res = await new ProbeRunner({
    tasks: generateBattery().slice(0, 1), sleep: async () => {},
    backends: { in_cloud: async () => { if (++calls < 3) throw new Error('429 quota'); return ok('in_cloud', 'billing'); } }
  }).run();
  assert.equal(calls, 3);
  assert.equal(res[0].ok, true);
  const un = await new ProbeRunner({ tasks: generateBattery().slice(0, 1), backends: { on_device: async () => { throw Object.assign(new Error('model unavailable'), { name: 'NotSupportedError' }); } } }).run();
  assert.equal(un[0].error, 'unavailable');
  const slow = await new ProbeRunner({ tasks: generateBattery().slice(0, 1), timeoutMs: 10, backends: { on_device: () => new Promise(r => setTimeout(() => r(ok('on_device', 'x')), 200)) } }).run();
  assert.equal(slow[0].error, 'timeout');
});

test('runner: abort stops further work; pause/resume', async () => {
  const tasks = generateBattery().slice(0, 20);
  let n = 0;
  const r = new ProbeRunner({ tasks, backends: { on_device: async () => { if (++n === 3) r.abort(); return ok('on_device', 'x'); } } });
  const res = await r.run();
  assert.ok(res.length <= 3, `ran ${res.length}`);
  const r2 = new ProbeRunner({ tasks: tasks.slice(0, 2), backends: { on_device: async () => ok('on_device', 'x') } });
  r2.pause();
  const p = r2.run();
  await new Promise(x => setTimeout(x, 20));
  assert.equal(r2.results.length, 0, 'paused');
  r2.resume();
  assert.equal((await p).length, 2);
});

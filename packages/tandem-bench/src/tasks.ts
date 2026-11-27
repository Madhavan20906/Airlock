/**
 * Synthetic, labelled task battery. Generated from fixed templates with a seeded RNG,
 * so labels are exact and the battery is reproducible. All names and organisations
 * are fictional; identifiers are synthetic.
 *
 * Split (calibration vs heldout) is fixed by a hash of the task id, never chosen by hand.
 */
import { LengthBucket, TaskType, estimateTokens, TASK_TYPES, LENGTH_BUCKETS } from '@tandem/policy';
import { IndicScript, Validator } from './validators.js';

export interface BenchTask {
  id: string;
  type: TaskType;
  lengthBucket: LengthBucket;
  sensitive: boolean;
  split: 'calibration' | 'heldout';
  instruction: string;
  input: string;
  validators: Validator[];
  /** For translate tasks. */
  targetLanguage?: string;
  tokensEst: number;
}

export const BATTERY_VERSION = 'tandem-battery-v1';
const PER_CELL = 8;

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function splitFor(id: string): 'calibration' | 'heldout' {
  return fnv1a(id) % 2 === 0 ? 'calibration' : 'heldout';
}

const NAMES = ['Meera Iyer', 'Arjun Rao', 'Kavya Menon', 'Rohan Desai', 'Ishita Bose', 'Vikram Nair', 'Ananya Kulkarni', 'Farhan Siddiqui', 'Lakshmi Pillai', 'Dev Malhotra'];
const ORGS = ['Kaveri Textiles', 'Bluepeak Logistics', 'Nilgiri Design Studio', 'Saffron Leaf Foods', 'Indus Bright Solar', 'Monsoon Craft Works', 'Deccan Byte Labs', 'Lotus Lane Clinics'];
const CITIES = ['Pune', 'Coimbatore', 'Indore', 'Kochi', 'Nagpur', 'Mysuru', 'Vadodara', 'Guwahati', 'Bhubaneswar', 'Jaipur'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const FILLER = [
  'The operations team reviewed the schedule for the coming quarter and noted that training sessions would move to Thursday afternoons.',
  'Several staff members asked for clearer guidance on expense submissions, and the finance desk agreed to publish a short checklist.',
  'Facilities confirmed that the meeting rooms on the second floor will be repainted, so bookings there are paused for two weeks.',
  'A reminder was shared that all visitors must sign in at the front desk and wear a badge while on the premises.',
  'The newsletter will now be sent on the first Monday of each month instead of the last Friday.',
  'Feedback from the last workshop was positive overall, with most participants asking for more hands-on exercises.',
  'The IT helpdesk recommended restarting laptops at least once a week so that updates install correctly.',
  'Parking near the east gate will be limited during the road repairs, and carpooling is encouraged.',
  'The library corner has new reference books on project planning and customer communication.',
  'Team leads were asked to confirm holiday plans by the end of the month so that coverage can be arranged.',
  'The canteen menu will include more regional dishes after a staff survey showed strong interest.',
  'A short fire drill is planned for next week; everyone should follow the marked exits and gather at the assembly point.'
];

function filler(rnd: () => number, targetTokens: number): string {
  const out: string[] = [];
  let i = Math.floor(rnd() * FILLER.length);
  while (estimateTokens(out.join(' ')) < targetTokens) out.push(FILLER[i++ % FILLER.length]);
  return out.join(' ');
}

const pick = <T>(rnd: () => number, a: T[]): T => a[Math.floor(rnd() * a.length)];
const int = (rnd: () => number, lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
const inr = (n: number) => n.toLocaleString('en-IN');

const PAD: Record<LengthBucket, number> = { S: 0, M: 380, L: 1150 };

/** Synthetic sensitive identifiers (fixed, Verhoeff-valid Aadhaar format; not real). */
const SYNTH_IDS = ['Aadhaar 4712 0938 5618', 'PAN BQKPS4821L', 'Aadhaar 6184 7203 9257', 'PAN DLWPK5517H'];

type Gen = (rnd: () => number, b: LengthBucket, i: number) => Omit<BenchTask, 'id' | 'split' | 'type' | 'lengthBucket' | 'tokensEst'>;

const CLASS_MSGS: Record<string, string[]> = {
  billing: ['I was charged twice for the same order this month.', 'My invoice shows the wrong GST amount.', 'Why did my subscription price go up without notice?'],
  delivery: ['My parcel has not arrived and tracking has not moved for five days.', 'The courier delivered my package to the wrong address.', 'Can you tell me when my order will be shipped?'],
  refund: ['I returned the shoes last week and still have not got my money back.', 'Please cancel my order and refund the full amount.', 'The refund I was promised has not reached my account.'],
  technical: ['The app crashes every time I open the payments screen.', 'I cannot log in because the OTP never arrives.', 'The website shows an error when I upload my documents.'],
  account: ['I want to change the email address on my profile.', 'How do I delete my account permanently?', 'Please update the phone number linked to my account.']
};
const LABELS = Object.keys(CLASS_MSGS);

const LANGS: Array<{ name: string; script: IndicScript }> = [
  { name: 'Hindi', script: 'Devanagari' }, { name: 'Tamil', script: 'Tamil' },
  { name: 'Bengali', script: 'Bengali' }, { name: 'Telugu', script: 'Telugu' }
];

const GENERATORS: Record<TaskType, Gen> = {
  classify: (rnd, b) => {
    const label = pick(rnd, LABELS);
    const msg = pick(rnd, CLASS_MSGS[label]);
    const ctx = b === 'S' ? '' : `Earlier messages in this thread (for context only):\n${filler(rnd, PAD[b])}\n\nLatest customer message:\n`;
    return {
      sensitive: false,
      instruction: `Classify the latest customer message into exactly one category: ${LABELS.join(', ')}. Reply with the category word only.`,
      input: ctx + msg,
      validators: [{ kind: 'exact', value: label }, { kind: 'no_refusal' }]
    };
  },
  extract: (rnd, b, i) => {
    const inv = `INV-${int(rnd, 1000, 9999)}`;
    const vendor = pick(rnd, ORGS);
    const total = int(rnd, 1200, 98000);
    const day = int(rnd, 1, 28), mon = pick(rnd, MONTHS);
    const sensitive = i % 4 === 0;
    const body = `Tax invoice ${inv}\nIssued by: ${vendor}, ${pick(rnd, CITIES)}\nDate: ${day} ${mon} 2026\nBilled to: ${pick(rnd, NAMES)}${sensitive ? `, ${pick(rnd, SYNTH_IDS)}` : ''}\nTotal payable: INR ${inr(total)}\nPayment due within 15 days.`;
    const input = b === 'S' ? body : `${filler(rnd, PAD[b] / 2)}\n\n${body}\n\n${filler(rnd, PAD[b] / 2)}`;
    return {
      sensitive,
      instruction: 'Extract the invoice details as a JSON object with keys invoice_number, date, vendor, total (a number, no commas), currency. Output only the JSON.',
      input,
      validators: [
        { kind: 'json_schema', required: { invoice_number: 'string', date: 'string', vendor: 'string', total: 'number', currency: 'string' } },
        { kind: 'field_f1', expected: { invoice_number: inv, vendor, total, currency: 'INR' }, threshold: 0.75 }
      ]
    };
  },
  rewrite: (rnd, b, i) => {
    const name = pick(rnd, NAMES), time = `${int(rnd, 9, 11)}:30 am`, n = int(rnd, 12, 60), city = pick(rnd, CITIES);
    const sensitive = i % 4 === 1;
    const para = `hey team, ${name} here${sensitive ? ` (${pick(rnd, SYNTH_IDS)})` : ''}. the review is moved to ${time} tomorrow, we expect around ${n} people at the ${city} office so pls come on time and bring ur laptops ok`;
    const input = b === 'S' ? para : `Background notes (do not rewrite):\n${filler(rnd, PAD[b])}\n\nMessage to rewrite:\n${para}`;
    return {
      sensitive,
      instruction: 'Rewrite the message in a polite, professional tone in at most 60 words. Keep every name, time and number exactly.',
      input,
      validators: [{ kind: 'required_facts', facts: [name.split(' ')[0], time.replace(' am', ''), String(n)] }, { kind: 'max_len', words: 70 }, { kind: 'no_refusal' }]
    };
  },
  summarize: (rnd, b, i) => {
    const org = pick(rnd, ORGS), pctv = int(rnd, 6, 41), city = pick(rnd, CITIES), mon = pick(rnd, MONTHS);
    const sensitive = i % 4 === 2;
    const key = `${org} reported that revenue grew ${pctv} percent this year. The company will open a new office in ${city} in ${mon}.${sensitive ? ` The filing was signed by ${pick(rnd, NAMES)}, ${pick(rnd, SYNTH_IDS)}.` : ''}`;
    const input = b === 'S' ? `${key} ${FILLER[i % FILLER.length]}` : `${filler(rnd, PAD[b] / 2)} ${key} ${filler(rnd, PAD[b] / 2)}`;
    return {
      sensitive,
      instruction: 'Summarise the text in at most 50 words. Include the growth figure and the city of the new office.',
      input,
      validators: [{ kind: 'required_facts', facts: [String(pctv), city] }, { kind: 'max_len', words: 60 }, { kind: 'no_refusal' }]
    };
  },
  translate: (rnd, b, i) => {
    const lang = LANGS[i % LANGS.length];
    const n = int(rnd, 3, 95);
    const base = `The clinic will stay open until 8 pm on weekdays. Please bring ${n} copies of the form and arrive ten minutes early.`;
    const extra = b === 'S' ? '' : ' ' + filler(rnd, b === 'M' ? 220 : 520);
    return {
      sensitive: false,
      targetLanguage: lang.name,
      instruction: `Translate the text into ${lang.name}. Output only the translation. Keep numbers as digits.`,
      input: base + extra,
      validators: [{ kind: 'script_present', script: lang.script, minRatio: 0.6 }, { kind: 'required_facts', facts: [String(n)] }, { kind: 'no_refusal' }]
    };
  },
  qa: (rnd, b) => {
    const cities = [...CITIES].sort(() => rnd() - 0.5).slice(0, 3);
    const units = cities.map(() => int(rnd, 1200, 9800));
    const facts = cities.map((c, k) => `The warehouse in ${c} currently stores ${inr(units[k])} units.`).join(' ');
    const q = int(rnd, 0, 2);
    const input = b === 'S' ? facts : `${filler(rnd, PAD[b] / 2)} ${facts} ${filler(rnd, PAD[b] / 2)}`;
    return {
      sensitive: false,
      instruction: `How many units does the ${cities[q]} warehouse store? Answer with the number only.`,
      input,
      validators: [{ kind: 'contains', values: [String(units[q])] }, { kind: 'max_len', words: 12 }, { kind: 'no_refusal' }]
    };
  },
  json_reliability: (rnd, b) => {
    const title = `${pick(rnd, ['Design', 'Budget', 'Safety', 'Hiring'])} review`, n = int(rnd, 4, 140), online = rnd() < 0.5;
    const desc = `The ${title.toLowerCase()} will have ${n} attendees and will be held ${online ? 'online over video call' : 'in person at the main hall'}. Topics include planning and follow-ups.`;
    const input = b === 'S' ? desc : `${filler(rnd, PAD[b])}\n\nEvent description:\n${desc}`;
    return {
      sensitive: false,
      instruction: 'Return a JSON object for the event with keys title (string), attendees (number), online (boolean), tags (array of strings). Output only the JSON.',
      input,
      validators: [
        { kind: 'json_schema', required: { title: 'string', attendees: 'number', online: 'boolean', tags: 'array' } },
        { kind: 'field_f1', expected: { attendees: n, online: String(online) }, threshold: 0.6 }
      ]
    };
  },
  instruction: (rnd, b) => {
    const topic = pick(rnd, ['saving electricity at home', 'preparing for a job interview', 'keeping passwords safe', 'studying for exams', 'reducing food waste']);
    const ctx = b === 'S' ? '' : `Notes for reference:\n${filler(rnd, PAD[b])}\n\n`;
    return {
      sensitive: false,
      instruction: `Give exactly 3 tips about ${topic}. Format: exactly 3 lines, each starting with "- ", each at most 12 words. No title and no other text.`,
      input: ctx + `Topic: ${topic}`,
      validators: [{ kind: 'bullets', count: 3, maxWords: 12 }, { kind: 'no_refusal' }]
    };
  }
};

export function generateBattery(): BenchTask[] {
  const tasks: BenchTask[] = [];
  for (const type of TASK_TYPES) {
    for (const b of LENGTH_BUCKETS) {
      for (let i = 0; i < PER_CELL; i++) {
        const id = `${type}-${b}-${String(i + 1).padStart(2, '0')}`;
        const rnd = mulberry32(fnv1a(`${BATTERY_VERSION}:${id}`));
        const g = GENERATORS[type](rnd, b, i);
        tasks.push({ id, type, lengthBucket: b, split: splitFor(id), tokensEst: estimateTokens(g.instruction + '\n' + g.input), ...g });
      }
    }
  }
  return tasks;
}

/** 12 tasks covering every type, mostly short, for a judge-friendly ~90 s probe. Fixed selection. */
export const QUICK_PROBE_IDS = [
  'classify-S-01', 'classify-M-01', 'extract-S-02', 'rewrite-S-03', 'summarize-S-02', 'summarize-M-01',
  'translate-S-01', 'translate-S-02', 'qa-S-01', 'qa-M-02', 'json_reliability-S-01', 'instruction-S-01'
];

export function quickProbe(battery = generateBattery()): BenchTask[] {
  return QUICK_PROBE_IDS.map(id => battery.find(t => t.id === id)!).filter(Boolean);
}

export function promptFor(t: BenchTask): string {
  return `${t.instruction}\n\n${t.input}`;
}

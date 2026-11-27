import {
  runDeterministicDetectors,
  redactText,
  normalizeInputText
} from '../packages/tandem-guard/dist/index.js';
import type { Entity } from '../packages/tandem-guard/dist/index.js';

export interface HeldoutDoc {
  id: string;
  domain: string;
  text: string;
  expectedEntities: { type: string; value: string }[];
  mustNotLeak: string[]; // Raw values that MUST be 100% absent in redacted egress text
}

export const HELDOUT_DATASET: HeldoutDoc[] = [
  {
    id: 'HLD-01',
    domain: 'Healthcare / Telemedicine',
    text: 'Dr. Priya Patel examined patient Anita Deshmukh (Aadhaar 2345 6789 0124, phone +91 98765 43210). Diagnosed with chronic bronchial asthma.',
    expectedEntities: [
      { type: 'PERSON', value: 'Priya Patel' },
      { type: 'PERSON', value: 'Anita Deshmukh' },
      { type: 'AADHAAR', value: '2345 6789 0124' },
      { type: 'PHONE', value: '+91 98765 43210' }
    ],
    mustNotLeak: ['2345 6789 0124', '9876543210', 'Anita Deshmukh']
  },
  {
    id: 'HLD-02',
    domain: 'Legal / Tenancy Agreement',
    text: 'Lease executed between Lessor Vikramaditya Singhania (PAN: AAAPS1234K) and Lessee Sneha Kulkarni (Aadhaar: 2345 6789 0124). Rent Rs. 38,000 to SBI account 20491820194 IFSC SBIN0001428.',
    expectedEntities: [
      { type: 'PERSON', value: 'Vikramaditya Singhania' },
      { type: 'PAN', value: 'AAAPS1234K' },
      { type: 'PERSON', value: 'Sneha Kulkarni' },
      { type: 'AADHAAR', value: '2345 6789 0124' },
      { type: 'ACCOUNT', value: '20491820194' },
      { type: 'ACCOUNT', value: 'SBIN0001428' }
    ],
    mustNotLeak: ['AAAPS1234K', '2345 6789 0124', '20491820194', 'SBIN0001428']
  },
  {
    id: 'HLD-03',
    domain: 'Taxation / CA Working Papers',
    text: 'Client Deepak Chawla, Assessee PAN: ABCPD1234F, filed GST return under GSTIN 07ABCPD1234F1Z5. Refund credited to ICICI Bank A/C 000405001234, IFSC ICIC0000004.',
    expectedEntities: [
      { type: 'PERSON', value: 'Deepak Chawla' },
      { type: 'PAN', value: 'ABCPD1234F' },
      { type: 'GSTIN', value: '07ABCPD1234F1Z5' },
      { type: 'ACCOUNT', value: '000405001234' },
      { type: 'ACCOUNT', value: 'ICIC0000004' }
    ],
    mustNotLeak: ['ABCPD1234F', '07ABCPD1234F1Z5', '000405001234']
  },
  {
    id: 'HLD-04',
    domain: 'Fintech / UPI Transaction Log',
    text: 'Payment of Rs. 4,250 initiated by Suresh Nair to UPI ID suresh.nair@okhdfcbank from mobile 94471 23456 with reference UTR 409182749102.',
    expectedEntities: [
      { type: 'PERSON', value: 'Suresh Nair' },
      { type: 'UPI', value: 'suresh.nair@okhdfcbank' },
      { type: 'PHONE', value: '94471 23456' }
    ],
    mustNotLeak: ['suresh.nair@okhdfcbank', '9447123456']
  },
  {
    id: 'HLD-05',
    domain: 'HR / Employee Onboarding',
    text: 'Candidate Rajesh Sharma, DOB: 14/08/1992, Passport: Z1234567, Voter ID: WMD1234567, contact email: rajesh.sharma@enterprise.org, PIN code 400001.',
    expectedEntities: [
      { type: 'PERSON', value: 'Rajesh Sharma' },
      { type: 'DOB', value: '14/08/1992' },
      { type: 'PASSPORT', value: 'Z1234567' },
      { type: 'VOTER_ID', value: 'WMD1234567' },
      { type: 'EMAIL', value: 'rajesh.sharma@enterprise.org' },
      { type: 'ADDRESS', value: '400001' }
    ],
    mustNotLeak: ['Z1234567', 'WMD1234567', 'rajesh.sharma@enterprise.org']
  },
  {
    id: 'HLD-06',
    domain: 'Adversarial / Zero-Width & Unicode Numerals',
    text: 'Client P\u200Briya P\u200Catel with Aadhaar २३४५ ६७८९ ०१२४ and PAN A\u200DBC\u200CPE1234F transferred funds to IFSC HDFC0000128.',
    expectedEntities: [
      { type: 'PERSON', value: 'Priya Patel' },
      { type: 'AADHAAR', value: '2345 6789 0124' },
      { type: 'PAN', value: 'ABCPE1234F' },
      { type: 'ACCOUNT', value: 'HDFC0000128' }
    ],
    mustNotLeak: ['2345 6789 0124', 'ABCPE1234F', 'HDFC0000128']
  },
  {
    id: 'HLD-07',
    domain: 'Transport / Vehicle Registration',
    text: 'Commercial driver Manoj Verma driving vehicle MH 12 AB 1234 with Driving Licence DL-1420110012345, mobile +91 91234 56789.',
    expectedEntities: [
      { type: 'PERSON', value: 'Manoj Verma' },
      { type: 'VEHICLE', value: 'MH 12 AB 1234' },
      { type: 'DL', value: 'DL-1420110012345' },
      { type: 'PHONE', value: '+91 91234 56789' }
    ],
    mustNotLeak: ['MH 12 AB 1234', 'DL-1420110012345', '9123456789']
  },
  {
    id: 'HLD-08',
    domain: 'Multilingual / Hinglish Consultation',
    text: 'Mera naam Amit Banerjee hai, mera PAN number BCDPB5678G hai aur phone number 98301 23456 pe call kijiye. Kolkata PIN 700001.',
    expectedEntities: [
      { type: 'PERSON', value: 'Amit Banerjee' },
      { type: 'PAN', value: 'BCDPB5678G' },
      { type: 'PHONE', value: '98301 23456' },
      { type: 'ADDRESS', value: '700001' }
    ],
    mustNotLeak: ['BCDPB5678G', '98301 23456', 'Amit Banerjee']
  },
  {
    id: 'HLD-09',
    domain: 'Banking / Credit Card Statement',
    text: 'Cardholder Sunita Rao, Card: 4532 0123 4567 8910, Bank Account: 109283746501, IFSC: BARB0KOLKAT, registered email: sunita.rao@mail.com.',
    expectedEntities: [
      { type: 'PERSON', value: 'Sunita Rao' },
      { type: 'CARD', value: '4532 0123 4567 8910' },
      { type: 'ACCOUNT', value: '109283746501' },
      { type: 'ACCOUNT', value: 'BARB0KOLKAT' },
      { type: 'EMAIL', value: 'sunita.rao@mail.com' }
    ],
    mustNotLeak: ['4532 0123 4567 8910', '109283746501', 'BARB0KOLKAT', 'sunita.rao@mail.com']
  },
  {
    id: 'HLD-10',
    domain: 'Legal / Affidavit',
    text: 'Deponent Arvind Kumar, residing at House 52, Sector 21, Gurugram PIN 122001, solemn oath with Aadhaar 9999 9999 0019 and mobile 99100 11223.',
    expectedEntities: [
      { type: 'PERSON', value: 'Arvind Kumar' },
      { type: 'ADDRESS', value: '122001' },
      { type: 'AADHAAR', value: '9999 9999 0019' },
      { type: 'PHONE', value: '99100 11223' }
    ],
    mustNotLeak: ['Arvind Kumar', '9999 9999 0019', '99100 11223']
  },
  {
    id: 'HLD-11',
    domain: 'Insurance / Health Claim Pre-Auth',
    text: 'Patient Sunita Rao (DOB: 23/11/1985) admitted at Care Hospital. Claim filed by policyholder Rajesh Sharma with PAN ABCPS1234F, contact dr.priya@carehospital.org.',
    expectedEntities: [
      { type: 'PERSON', value: 'Sunita Rao' },
      { type: 'DOB', value: '23/11/1985' },
      { type: 'PERSON', value: 'Rajesh Sharma' },
      { type: 'PAN', value: 'ABCPS1234F' },
      { type: 'EMAIL', value: 'dr.priya@carehospital.org' }
    ],
    mustNotLeak: ['ABCPS1234F', 'Sunita Rao', 'dr.priya@carehospital.org']
  },
  {
    id: 'HLD-12',
    domain: 'Fintech / Microfinance Loan Disbursal',
    text: 'Beneficiary Anita Deshmukh (Aadhaar 2345 6789 0124) disbursed Rs 25000 to Canara Bank account 109283746501 IFSC CNRB0001234. Witness: Deepak Chawla.',
    expectedEntities: [
      { type: 'PERSON', value: 'Anita Deshmukh' },
      { type: 'AADHAAR', value: '2345 6789 0124' },
      { type: 'ACCOUNT', value: '109283746501' },
      { type: 'ACCOUNT', value: 'CNRB0001234' },
      { type: 'PERSON', value: 'Deepak Chawla' }
    ],
    mustNotLeak: ['2345 6789 0124', '109283746501', 'CNRB0001234']
  },
  {
    id: 'HLD-13',
    domain: 'Judicial / Police FIR Transcript',
    text: 'Complainant Suresh Nair filed report against contractor Manoj Verma. Vehicle registration MH 02 CD 5678, mobile 98200 98200. Investigating officer: Vikramaditya Singhania.',
    expectedEntities: [
      { type: 'PERSON', value: 'Suresh Nair' },
      { type: 'PERSON', value: 'Manoj Verma' },
      { type: 'VEHICLE', value: 'MH 02 CD 5678' },
      { type: 'PHONE', value: '98200 98200' },
      { type: 'PERSON', value: 'Vikramaditya Singhania' }
    ],
    mustNotLeak: ['MH 02 CD 5678', '9820098200']
  },
  {
    id: 'HLD-14',
    domain: 'Corporate / Startup Term Sheet',
    text: 'Term sheet signed by Founder Ananya Deshmukh and Investor Amit Banerjee. Investment remittance to Axis Bank A/C 912010041234567 IFSC UTIB0000004.',
    expectedEntities: [
      { type: 'PERSON', value: 'Ananya Deshmukh' },
      { type: 'PERSON', value: 'Amit Banerjee' },
      { type: 'ACCOUNT', value: '912010041234567' },
      { type: 'ACCOUNT', value: 'UTIB0000004' }
    ],
    mustNotLeak: ['912010041234567', 'UTIB0000004', 'Ananya Deshmukh']
  },
  {
    id: 'HLD-15',
    domain: 'Real Estate / Sale Deed',
    text: 'Vendor Sneha Kulkarni conveys property in Indiranagar Bengaluru PIN 560038 to Purchaser Arvind Kumar. Advance paid via UPI sneha.k@okaxis.',
    expectedEntities: [
      { type: 'PERSON', value: 'Sneha Kulkarni' },
      { type: 'ADDRESS', value: '560038' },
      { type: 'PERSON', value: 'Arvind Kumar' },
      { type: 'UPI', value: 'sneha.k@okaxis' }
    ],
    mustNotLeak: ['sneha.k@okaxis', 'Sneha Kulkarni']
  }
];

export async function runHeldoutBenchmark() {
  console.log('===============================================================');
  console.log('   TANDEM GUARD HELD-OUT BENCHMARK');
  console.log('===============================================================');

  let totalTP = 0;
  let totalFP = 0;
  let totalFN = 0;
  let totalLeaks = 0;

  for (const doc of HELDOUT_DATASET) {
    const detected = runDeterministicDetectors(doc.text);
    const { sanitizedText } = redactText(doc.text, detected);

    // Check entity matches
    for (const exp of doc.expectedEntities) {
      const matched = detected.some(d => {
        const typeMatch = d.type === exp.type;
        const stripChars = (s: string) => normalizeInputText(s).normalizedText.replace(/[\s-]/g, '').toLowerCase();
        const normDet = stripChars(d.value);
        const normExp = stripChars(exp.value);
        return typeMatch && (normDet.includes(normExp) || normExp.includes(normDet));
      });

      if (matched) {
        totalTP++;
      } else {
        totalFN++;
        console.warn(`[MISS] ${doc.id} (${doc.domain}): Missing ${exp.type} "${exp.value}"`);
      }
    }

    // Check false positives
    for (const det of detected) {
      const valid = doc.expectedEntities.some(exp => {
        const typeMatch = det.type === exp.type;
        const normDet = det.value.replace(/[\s-]/g, '').toLowerCase();
        const normExp = exp.value.replace(/[\s-]/g, '').toLowerCase();
        return typeMatch && (normDet.includes(normExp) || normExp.includes(normDet));
      });
      if (!valid) {
        totalFP++;
      }
    }

    // Check leak resistance (mustNotLeak items must NEVER appear in outbound sanitized text)
    for (const secret of doc.mustNotLeak) {
      if (sanitizedText.includes(secret)) {
        totalLeaks++;
        console.error(`[CRITICAL LEAK] ${doc.id}: Secret "${secret}" leaked into outbound text!`);
      }
    }
  }

  const precision = totalTP / (totalTP + totalFP);
  const recall = totalTP / (totalTP + totalFN);
  const f1 = (2 * precision * recall) / (precision + recall);

  console.log('---------------------------------------------------------------');
  console.log(`Evaluated Held-Out Documents : ${HELDOUT_DATASET.length}`);
  console.log(`True Positives (TP)          : ${totalTP}`);
  console.log(`False Positives (FP)         : ${totalFP}`);
  console.log(`False Negatives (FN)         : ${totalFN}`);
  console.log(`Held-Out Precision           : ${(precision * 100).toFixed(1)}%`);
  console.log(`Held-Out Recall              : ${(recall * 100).toFixed(1)}%`);
  console.log(`Held-Out F1 Score            : ${(f1 * 100).toFixed(1)}%`);
  console.log(`Outbound Leaks Detected      : ${totalLeaks} (Target: 0)`);
  console.log('===============================================================\n');

  if (totalLeaks > 0) {
    throw new Error(`Held-out benchmark failed: ${totalLeaks} confidential identifiers leaked!`);
  }
}

if (process.argv[1]?.endsWith('heldout_benchmark.ts') || process.argv[1]?.endsWith('heldout_benchmark.js')) {
  runHeldoutBenchmark().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

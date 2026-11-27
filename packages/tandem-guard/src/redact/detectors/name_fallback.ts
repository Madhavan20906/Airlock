import { Entity } from '../../types.js';

// Common stop words to not mistake for names
const NAME_STOP_WORDS = new Set([
  'The', 'This', 'That', 'These', 'Those', 'Invoice', 'Hospital', 'Clinic',
  'Agreement', 'Contract', 'Services', 'Consulting', 'Company', 'Limited',
  'Private', 'Pvt', 'Ltd', 'Bank', 'Branch', 'Street', 'Road', 'India',
  'Report', 'Summary', 'Total', 'Amount', 'Date', 'Month', 'Year', 'Vehicle',
  'National', 'Driver', 'Commercial', 'General', 'Office', 'Between', 'Clause',
  'Notice', 'Primary', 'Emergency', 'Registered', 'Booking', 'Order', 'Dispatch',
  'My', 'Your', 'His', 'Her', 'Our', 'Their', 'Please', 'Kindly', 'Hello', 'Hi', 'Dear',
  'Consultation', 'Prescription', 'Diagnosis', 'Treatment', 'State', 'Central', 'Court',
  'Police', 'Station', 'Incident', 'Case', 'Number', 'Serial', 'Section', 'Act', 'Rule'
]);

// High-confidence Indian surnames
const INDIAN_SURNAMES = new Set([
  'Sharma', 'Verma', 'Patel', 'Kumar', 'Singh', 'Chawla', 'Rao', 'Reddy',
  'Gupta', 'Nair', 'Iyer', 'Iyengar', 'Sen', 'Das', 'Banerjee', 'Banerji',
  'Singhania', 'Agarwal', 'Aggarwal', 'Joshi', 'Mehta', 'Kulkarni', 'Mukherjee',
  'Bose', 'Chatterjee', 'Pillai', 'Menon', 'Bhatt', 'Desai', 'Shah', 'Chauhan',
  'Yadav', 'Mishra', 'Pandey', 'Tripathi', 'Tiwari', 'Bhatia', 'Kapoor', 'Malhotra',
  'Saxena', 'Chopra', 'Dubey', 'Sengupta', 'Subramaniam', 'Kaur', 'Grewal', 'Dhillon',
  'Pawar', 'Shinde', 'Patil', 'Deshmukh', 'Jadhav', 'Gaikwad', 'Bhosale', 'Kadam',
  'Ghosh', 'Dutta', 'Chakraborty', 'Majumdar', 'Bhattacharya', 'Roy', 'Barman',
  'Choudhury', 'Naidu', 'Raju', 'Goud', 'Murthy', 'Hegde', 'Gowda', 'Shetty',
  'Rathore', 'Solanki', 'Bhat', 'Dhar', 'Kakkar', 'Mehra', 'Sethi', 'Bhasin'
]);

// High-confidence Indian given names
const INDIAN_GIVEN_NAMES = new Set([
  'Rajesh', 'Priya', 'Deepak', 'Sangeeta', 'Vikramaditya', 'Rahul', 'Amit', 'Ananya',
  'Sunita', 'Pooja', 'Rohit', 'Suresh', 'Ramesh', 'Neha', 'Sneha', 'Manoj', 'Sanjay',
  'Vivek', 'Alok', 'Arvind', 'Anita', 'Anand', 'Gaurav', 'Kavita', 'Manish', 'Nitin',
  'Sachin', 'Sandeep', 'Swati', 'Vikas', 'Vishal', 'Ajay', 'Ashok', 'Dinesh', 'Karan',
  'Meena', 'Rakesh', 'Suman', 'Sunil', 'Vijay', 'Abhishek', 'Aditya', 'Divya', 'Harish',
  'Kiran', 'Mahesh', 'Pradeep', 'Praveen', 'Rekha', 'Shilpa', 'Varun', 'Aniruddh',
  'Muthukumar', 'Gurpreet', 'Vikram', 'Ramanathan', 'Naveen', 'Sudhir', 'Preeti'
]);

export function detectDeterministicNames(text: string): Entity[] {
  const entities: Entity[] = [];
  const detectedSpans: Array<[number, number]> = [];

  const addEntity = (nameVal: string, start: number, confidence: number) => {
    const end = start + nameVal.length;
    // Prevent overlapping duplicate names
    if (!detectedSpans.some(([s, e]) => Math.max(s, start) < Math.min(e, end))) {
      detectedSpans.push([start, end]);
      entities.push({
        type: 'PERSON',
        value: nameVal,
        span: [start, end],
        confidence,
        source: 'deterministic'
      });
    }
  };

  // 1. Names after honorifics (e.g. Mr. Rajesh Sharma, Dr. Priya Patel, Shri Arvind Kumar)
  const honorificRegex = /\b(?:Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.|Shri|Smt\.?|Kumari|Adv\.|Advocate)[ \t]+((?:[A-Z]\.?|[A-Z][a-z]+)(?:[ \t]+(?:[A-Z]\.?|[A-Z][a-z]+)){1,3})\b/g;
  let hMatch: RegExpExecArray | null;
  while ((hMatch = honorificRegex.exec(text)) !== null) {
    const nameVal = hMatch[1].trim();
    const words = nameVal.split(/\s+/);
    const firstWord = words[0];
    const isValidCasing = words.every(w => /^[A-Z]([a-z]+|\.?)$/.test(w));
    if (isValidCasing && !NAME_STOP_WORDS.has(firstWord) && nameVal.length >= 3) {
      const start = hMatch.index + hMatch[0].lastIndexOf(nameVal);
      addEntity(nameVal, start, 0.94);
    }
  }

  // 2. Names after document labels & conversation cues (case-insensitive for JSON/CSV/forms)
  const labelRegex = /["']?\b(?:name(?:\s*on\s*record(?:\s*is)?)?|(?:my\s+)?name\s+is|(?:mera\s+)?naam|client(?:\s*name)?|patient(?:\s*name)?|doctor|physician|attending\s*physician|candidate|employee(?:\s*name)?|emp_name|applicant(?:\s*name)?|primary\s*applicant|co-applicant|nominee|claimant|beneficiary(?:\s*name)?|consultant|payee|payer|assessee|landlord|tenant|lessor|lessee|licensor|licensee|borrower|lender|vendor|partner(?:\s*name)?|investor|passenger|traveler|customer(?:\s*name)?|user(?:\s*name)?|contractor|assignor|assignee|signatory|signed\s*by|driver|owner(?:\s*name)?|author|authorized\s*signatory|individual|account\s*holder|delivery\s*to|deponent|testator|principal|attorney|founder|guardian|officer|presiding\s*officer|complainant|witness|director)["']?[\s:"'=]+["']?((?:[A-Z]\.?|[A-Z][a-z]+)(?:[ \t]+(?:[A-Z]\.?|[A-Z][a-z]+)){1,3})\b/gi;
  let lMatch: RegExpExecArray | null;
  while ((lMatch = labelRegex.exec(text)) !== null) {
    const nameVal = lMatch[1].trim();
    const words = nameVal.split(/\s+/);
    const firstWord = words[0];
    const isValidCasing = words.every(w => /^[A-Z]([a-z]+|\.?)$/.test(w));
    if (isValidCasing && !NAME_STOP_WORDS.has(firstWord) && nameVal.length >= 3) {
      const start = lMatch.index + lMatch[0].lastIndexOf(nameVal);
      addEntity(nameVal, start, 0.92);
    }
  }

  // 3. Indian Name Gazetteer Heuristics (matches 2-3 word capitalized names where at least one word is a known Indian given name or surname)
  const namePairRegex = /\b([A-Z][a-z]{2,15})[ \t]+([A-Z][a-z]{2,15})(?:[ \t]+([A-Z][a-z]{2,15}))?\b/g;
  let npMatch: RegExpExecArray | null;
  while ((npMatch = namePairRegex.exec(text)) !== null) {
    const w1 = npMatch[1];
    const w2 = npMatch[2];
    const w3 = npMatch[3];

    // Exclude common phrases / stop words
    if (NAME_STOP_WORDS.has(w1) || NAME_STOP_WORDS.has(w2) || (w3 && NAME_STOP_WORDS.has(w3))) {
      continue;
    }

    const isW1Given = INDIAN_GIVEN_NAMES.has(w1);
    const isW2Surname = INDIAN_SURNAMES.has(w2);
    const isW3Surname = w3 ? INDIAN_SURNAMES.has(w3) : false;

    if (isW1Given || isW2Surname || isW3Surname) {
      const fullVal = w3 ? `${w1} ${w2} ${w3}` : `${w1} ${w2}`;
      const start = npMatch.index;
      addEntity(fullVal, start, 0.88);
    }
  }

  return entities;
}

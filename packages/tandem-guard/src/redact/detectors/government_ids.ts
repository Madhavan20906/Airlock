import { Entity } from '../../types.js';

export function detectGovernmentIDs(text: string): Entity[] {
  const entities: Entity[] = [];

  // 1. GSTIN (15 characters: 2 state digits + 10-char PAN + 1 entity + 'Z' + 1 check character)
  // E.g., 29ABCDE1234F1Z5, 07ABCPE1234F2Z8
  const gstinRegex = /\b([0-3][0-9][a-zA-Z]{5}[0-9]{4}[a-zA-Z][1-9a-zA-Z][zZ][0-9a-zA-Z])\b/g;
  let gstinMatch: RegExpExecArray | null;
  while ((gstinMatch = gstinRegex.exec(text)) !== null) {
    entities.push({
      type: 'GSTIN',
      value: gstinMatch[0],
      span: [gstinMatch.index, gstinMatch.index + gstinMatch[0].length],
      confidence: 0.98,
      source: 'deterministic'
    });
  }

  // 2. Indian Passport (1 letter + 7 digits) near context keywords
  // E.g., Passport No: A1234567, Passport: Z9876543, Indian passport travel document Z1234567
  const passportRegex = /(?:passport[a-z\s]{0,20}?)(?:[\s:#.-]{1,15})\b([A-Za-z][0-9]{7})\b/gi;
  let pptMatch: RegExpExecArray | null;
  while ((pptMatch = passportRegex.exec(text)) !== null) {
    const full = pptMatch[0];
    const val = pptMatch[1];
    const start = pptMatch.index + full.lastIndexOf(val);
    entities.push({
      type: 'PASSPORT',
      value: val,
      span: [start, start + val.length],
      confidence: 0.95,
      source: 'deterministic'
    });
  }

  // 3. Indian Voter ID / EPIC (3 letters + 7 digits)
  // E.g., WBF1234567, ABC0123456 (or near voter/epic keywords)
  const voterRegex = /(?:voter\s*id|epic\s*no\.?|epic\s*#?|voter\s*card)?(?:[\s:#.-]{1,15})?\b([A-Za-z]{3}[0-9]{7})\b/gi;
  let voterMatch: RegExpExecArray | null;
  while ((voterMatch = voterRegex.exec(text)) !== null) {
    const val = voterMatch[1];
    // Check if it's near voter context or distinct uppercase EPIC format
    const hasContext = /(?:voter|epic)/i.test(voterMatch[0]);
    const start = voterMatch.index + voterMatch[0].lastIndexOf(val);
    // If no context, only include if strictly uppercase and not a common word
    if (hasContext || /^[A-Z]{3}[0-9]{7}$/.test(val)) {
      entities.push({
        type: 'VOTER_ID',
        value: val,
        span: [start, start + val.length],
        confidence: hasContext ? 0.95 : 0.80,
        source: 'deterministic'
      });
    }
  }

  // 4. Indian Driving Licence (e.g. DL-1420110012345, DL04 20110012345, MH0220110012345)
  // Format: 2-char state code + 2-digit RTO + 4-digit year + 7-digit unique number (with optional spaces/dashes)
  const dlRegex = /\b([a-zA-Z]{2}[-\s]?[0-9]{2}[-\s]?[0-9]{4}[-\s]?[0-9]{7})\b/g;
  let dlMatch: RegExpExecArray | null;
  while ((dlMatch = dlRegex.exec(text)) !== null) {
    entities.push({
      type: 'DL',
      value: dlMatch[0],
      span: [dlMatch.index, dlMatch.index + dlMatch[0].length],
      confidence: 0.92,
      source: 'deterministic'
    });
  }

  // 5. Indian Vehicle Registration (e.g. MH 12 AB 1234, DL-1C-AA-1111, 22BH1234AA)
  // State series: 2 letters, 2 digits, 1-2 letters, 4 digits
  // BH series: 2 digits (year) + BH + 4 digits + 1-2 letters
  const vehicleRegex = /\b([a-zA-Z]{2}[\s\-]?[0-9]{1,2}[\s\-]?[a-zA-Z]{1,3}[\s\-]?[0-9]{4}|[0-9]{2}[\s\-]?BH[\s\-]?[0-9]{4}[\s\-]?[a-zA-Z]{1,2})\b/gi;
  let vehMatch: RegExpExecArray | null;
  while ((vehMatch = vehicleRegex.exec(text)) !== null) {
    const val = vehMatch[0];
    // Avoid false positives like dates or standard short codes
    if (!/^[0-9]+$/.test(val)) {
      entities.push({
        type: 'VEHICLE',
        value: val,
        span: [vehMatch.index, vehMatch.index + val.length],
        confidence: 0.85,
        source: 'deterministic'
      });
    }
  }

  return entities;
}

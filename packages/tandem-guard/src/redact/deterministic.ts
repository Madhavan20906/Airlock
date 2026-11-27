import { Entity } from '../types.js';
import { normalizeInputText } from './normalization.js';
import { detectAadhaar } from './detectors/aadhaar.js';
import { detectPAN } from './detectors/pan.js';
import { detectCard } from './detectors/card.js';
import { detectBankDetails } from './detectors/bank.js';
import { detectContactDetails } from './detectors/contact.js';
import { detectAddress } from './detectors/address.js';
import { detectGovernmentIDs } from './detectors/government_ids.js';
import { detectDeterministicNames } from './detectors/name_fallback.js';
import { detectObfuscatedIdentifiers } from './detectors/obfuscated.js';

export function runDeterministicDetectors(text: string, enabledDetectors?: string[]): Entity[] {
  const isEnabled = (name: string) => !enabledDetectors || enabledDetectors.includes(name);

  // Normalize text to handle Indic numerals and strip invisible zero-width chars
  const { normalizedText, indexMap } = normalizeInputText(text);

  const rawEntities: Entity[] = [];

  if (isEnabled('aadhaar')) rawEntities.push(...detectAadhaar(normalizedText));
  if (isEnabled('pan')) rawEntities.push(...detectPAN(normalizedText));
  if (isEnabled('card')) rawEntities.push(...detectCard(normalizedText));
  if (isEnabled('account')) rawEntities.push(...detectBankDetails(normalizedText));
  if (isEnabled('email') || isEnabled('phone') || isEnabled('dob')) rawEntities.push(...detectContactDetails(normalizedText));
  if (isEnabled('address')) rawEntities.push(...detectAddress(normalizedText));
  if (isEnabled('government_id')) rawEntities.push(...detectGovernmentIDs(normalizedText));
  if (isEnabled('name_fallback')) rawEntities.push(...detectDeterministicNames(normalizedText));

  // Obfuscated identifiers: spaced/hyphenated/line-split/spelled-out digits and base64 wrapping
  const detectPlainStructured = (s: string): Entity[] => {
    const n = normalizeInputText(s).normalizedText;
    return [
      ...(isEnabled('aadhaar') ? detectAadhaar(n) : []),
      ...(isEnabled('pan') ? detectPAN(n) : []),
      ...(isEnabled('account') ? detectBankDetails(n) : []),
      ...(isEnabled('email') || isEnabled('phone') ? detectContactDetails(n) : []),
      ...(isEnabled('government_id') ? detectGovernmentIDs(n) : [])
    ];
  };
  // Gap-filling only: never override a span a primary detector already claimed
  const primary = rawEntities.slice();
  for (const ob of detectObfuscatedIdentifiers(normalizedText, detectPlainStructured)) {
    if (primary.every(p => ob.span[1] <= p.span[0] || ob.span[0] >= p.span[1])) rawEntities.push(ob);
  }

  // Map detected entity spans and values back to the original input text
  const mappedEntities: Entity[] = rawEntities.map(ent => {
    const origStart = indexMap[ent.span[0]] ?? ent.span[0];
    const origEnd = indexMap[ent.span[1]] ?? ent.span[1];
    return {
      ...ent,
      value: text.slice(origStart, origEnd),
      span: [origStart, origEnd]
    };
  });

  // Filter if specific entity types were disabled in enabledDetectors
  const filtered = mappedEntities.filter(ent => {
    if (!enabledDetectors) return true;
    const typeLower = ent.type.toLowerCase();
    return enabledDetectors.includes(typeLower) ||
      (ent.type === 'UPI' && (enabledDetectors.includes('upi') || enabledDetectors.includes('account'))) ||
      (ent.type === 'DOB' && (enabledDetectors.includes('dob') || enabledDetectors.includes('phone'))) ||
      (['GSTIN', 'PASSPORT', 'VOTER_ID', 'DL', 'VEHICLE'].includes(ent.type) && (enabledDetectors.includes('government_id') || enabledDetectors.includes(typeLower))) ||
      (ent.type === 'PERSON' && (enabledDetectors.includes('name_fallback') || enabledDetectors.includes('person')));
  });

  // Sort entities by start span ascending, then length descending
  filtered.sort((a, b) => {
    if (a.span[0] !== b.span[0]) return a.span[0] - b.span[0];
    return (b.span[1] - b.span[0]) - (a.span[1] - a.span[0]);
  });

  // Deduplicate and resolve overlapping spans (Layer A structured IDs win)
  const nonOverlapping: Entity[] = [];
  let lastEnd = -1;

  for (const ent of filtered) {
    if (ent.span[0] >= lastEnd) {
      nonOverlapping.push(ent);
      lastEnd = ent.span[1];
    } else {
      // Overlap detected: structured IDs (AADHAAR, PAN, CARD, GSTIN, PASSPORT) take priority
      const prev = nonOverlapping[nonOverlapping.length - 1];
      const isStructured = (t: string) => ['AADHAAR', 'PAN', 'CARD', 'GSTIN', 'PASSPORT'].includes(t);

      if (isStructured(ent.type) && !isStructured(prev.type)) {
        nonOverlapping[nonOverlapping.length - 1] = ent;
        lastEnd = ent.span[1];
      } else if (ent.confidence > prev.confidence && ent.span[1] > prev.span[1]) {
        nonOverlapping[nonOverlapping.length - 1] = ent;
        lastEnd = ent.span[1];
      }
    }
  }

  return nonOverlapping;
}

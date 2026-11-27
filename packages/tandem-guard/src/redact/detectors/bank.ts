import { Entity } from '../../types.js';

export function detectBankDetails(text: string): Entity[] {
  const entities: Entity[] = [];

  // 1. IFSC Code (4 letters, 0, 6 alphanumeric characters - case-insensitive)
  const ifscRegex = /\b([a-zA-Z]{4})0([a-zA-Z0-9]{6})\b/g;
  let ifscMatch: RegExpExecArray | null;
  while ((ifscMatch = ifscRegex.exec(text)) !== null) {
    entities.push({
      type: 'ACCOUNT',
      value: ifscMatch[0],
      span: [ifscMatch.index, ifscMatch.index + ifscMatch[0].length],
      confidence: 0.96,
      source: 'deterministic'
    });
  }

  // 2. Bank Account Numbers near context keywords
  // Matches any contextual account indicator (Bank, Settlement, Salary, Savings, Current, Beneficiary, Designated, Deposit, Payee, Wire, Payout)
  // followed by (account|a/c|acct|wire|transfer|payout) and optional (no|number|#), followed by delimiters and 9-18 digits.
  const accountContextRegex = /(?:\b(?:bank|settlement|salary|savings|current|beneficiary|designated|deposit|payee|wire|disbursement|vendor|client|primary|payout)?[\s\w.-]{0,25}?\b(?:account|a\/c|acct|wire|transfer|payout)(?:\s*(?:no\.?|number|#))?[\s\w:#."'=-]{1,30}?)\b(\d{9,18})\b/gi;
  let accMatch: RegExpExecArray | null;
  const detectedSpans: Array<[number, number]> = [];

  while ((accMatch = accountContextRegex.exec(text)) !== null) {
    const fullMatch = accMatch[0];
    const accDigits = accMatch[1];
    const startIndex = accMatch.index + fullMatch.lastIndexOf(accDigits);
    const endIndex = startIndex + accDigits.length;
    detectedSpans.push([startIndex, endIndex]);
    entities.push({
      type: 'ACCOUNT',
      value: accDigits,
      span: [startIndex, endIndex],
      confidence: 0.95,
      source: 'deterministic'
    });
  }

  // 2b. Bank Account Numbers adjacent to IFSC codes (e.g. "50100412345678 IFSC HDFC0000128", "50100412345678,HDFC0000128" or "IFSC: SBIN0001234 A/C: 987654321098")
  const ifscProximityRegex = /(?:\b([a-zA-Z]{4}0[a-zA-Z0-9]{6})\b[\s\w:#."'=,;-]{1,35}?\b(\d{9,18})\b)|(?:\b(\d{9,18})\b[\s\w:#."'=,;-]{1,35}?\b([a-zA-Z]{4}0[a-zA-Z0-9]{6})\b)/gi;
  let proxMatch: RegExpExecArray | null;
  while ((proxMatch = ifscProximityRegex.exec(text)) !== null) {
    const accDigits = proxMatch[2] || proxMatch[3];
    if (accDigits) {
      const startIndex = proxMatch.index + proxMatch[0].indexOf(accDigits);
      const endIndex = startIndex + accDigits.length;
      const isOverlapping = detectedSpans.some(([s, e]) => Math.max(s, startIndex) < Math.min(e, endIndex));
      if (!isOverlapping) {
        detectedSpans.push([startIndex, endIndex]);
        entities.push({
          type: 'ACCOUNT',
          value: accDigits,
          span: [startIndex, endIndex],
          confidence: 0.96,
          source: 'deterministic'
        });
      }
    }
  }

  // Reverse pattern: digits followed by account keyword (e.g. "50100412345678 is the account")
  const reverseAccountRegex = /\b(\d{9,18})\b[\s\w:#."'=-]{1,30}?\b(?:account|a\/c|acct)\b/gi;
  let revMatch: RegExpExecArray | null;
  while ((revMatch = reverseAccountRegex.exec(text)) !== null) {
    const accDigits = revMatch[1];
    const startIndex = revMatch.index;
    const endIndex = startIndex + accDigits.length;
    const isOverlapping = detectedSpans.some(([s, e]) => Math.max(s, startIndex) < Math.min(e, endIndex));
    if (!isOverlapping) {
      detectedSpans.push([startIndex, endIndex]);
      entities.push({
        type: 'ACCOUNT',
        value: accDigits,
        span: [startIndex, endIndex],
        confidence: 0.93,
        source: 'deterministic'
      });
    }
  }

  // 3. UPI ID (Virtual Payment Address / VPA)
  // Any handle@provider with no dot-TLD after the provider (an email has one).
  // Not limited to a known-PSP list: new PSP handles appear constantly (Leak Lab finding).
  const upiRegex = /(?<![A-Za-z0-9._%+-])[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z][a-zA-Z0-9]{1,40}(?![A-Za-z0-9]|\.[A-Za-z])/g;
  let upiMatch: RegExpExecArray | null;
  while ((upiMatch = upiRegex.exec(text)) !== null) {
    entities.push({
      type: 'UPI',
      value: upiMatch[0],
      span: [upiMatch.index, upiMatch.index + upiMatch[0].length],
      confidence: 0.95,
      source: 'deterministic'
    });
  }

  return entities;
}

import { Entity } from '../../types.js';

export function validateLuhn(numStr: string): boolean {
  const digits = numStr.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let isEven = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    isEven = !isEven;
  }
  return sum % 10 === 0;
}

export function detectCard(text: string): Entity[] {
  const entities: Entity[] = [];
  // Match 13 to 19 digits formatted with optional spaces or dashes
  const regex = /\b(?:\d[ -]?){13,19}\b/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const rawVal = match[0];
    const cleanDigits = rawVal.replace(/\D/g, '');
    if (cleanDigits.length >= 13 && cleanDigits.length <= 19 && validateLuhn(cleanDigits)) {
      entities.push({
        type: 'CARD',
        value: rawVal,
        span: [match.index, match.index + rawVal.length],
        confidence: 0.96,
        source: 'deterministic'
      });
    }
  }

  return entities;
}

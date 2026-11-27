import { Entity } from '../../types.js';

export function detectAddress(text: string): Entity[] {
  const entities: Entity[] = [];

  // 6-digit PIN code near address keywords (supports JSON/quotes, colons, equals)
  const pinWithContextRegex = /(?:pin|postal|pincode|zip|code|nagar|road|street|colony|sector|dist|district|state)[\s\w:#."'=-]{1,30}\b([1-9][0-9]{5})\b/gi;
  let match: RegExpExecArray | null;

  while ((match = pinWithContextRegex.exec(text)) !== null) {
    const fullMatch = match[0];
    const pin = match[1];
    const startIndex = match.index + fullMatch.lastIndexOf(pin);
    entities.push({
      type: 'ADDRESS',
      value: pin,
      span: [startIndex, startIndex + pin.length],
      confidence: 0.88,
      source: 'deterministic'
    });
  }

  return entities;
}

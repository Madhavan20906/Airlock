import { Entity, EntityType } from '../types.js';

export interface NERPromptSpec {
  systemPrompt: string;
  userPrompt: string;
}

export function buildNERPrompt(text: string): NERPromptSpec {
  return {
    systemPrompt: 'You are an on-device privacy entity extraction system. Identify named entities: PERSON (people names), ORG (organizations/companies), and MEDICAL (medical diagnoses, medications, health conditions). Output strictly a JSON array of objects: [{"type": "PERSON"|"ORG"|"MEDICAL", "text": "exact matching substring"}]. Do not include markdown codeblocks or explanations, only valid JSON.',
    userPrompt: `Extract entities from this text:\n"""\n${text}\n"""`
  };
}

export function chunkTextForNER(text: string, maxChunkLength = 1200): { text: string; offset: number }[] {
  if (text.length <= maxChunkLength) {
    return [{ text, offset: 0 }];
  }

  const chunks: { text: string; offset: number }[] = [];
  let currentOffset = 0;

  while (currentOffset < text.length) {
    let end = Math.min(currentOffset + maxChunkLength, text.length);
    if (end < text.length) {
      // Find sentence or newline boundary
      const lastPeriod = text.lastIndexOf('\n', end);
      const lastDot = text.lastIndexOf('. ', end);
      const boundary = Math.max(lastPeriod, lastDot !== -1 ? lastDot + 1 : -1);

      if (boundary > currentOffset + 200) {
        end = boundary;
      }
    }

    chunks.push({
      text: text.slice(currentOffset, end),
      offset: currentOffset
    });
    currentOffset = end;
  }

  return chunks;
}

export function parseNERResponse(rawOutput: string, sourceText: string, chunkOffset = 0): Entity[] {
  const entities: Entity[] = [];
  try {
    // Strip markdown formatting if present
    const cleaned = rawOutput.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    const jsonMatch = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    for (const item of parsed) {
      if (!item.text || !item.type) continue;
      const typeStr = String(item.type).toUpperCase() as EntityType;
      const textVal = String(item.text).trim();
      if (!textVal || textVal.length < 2) continue;

      let searchIdx = 0;
      while ((searchIdx = sourceText.indexOf(textVal, searchIdx)) !== -1) {
        entities.push({
          type: typeStr,
          value: textVal,
          span: [chunkOffset + searchIdx, chunkOffset + searchIdx + textVal.length],
          confidence: 0.88,
          source: 'ner'
        });
        searchIdx += textVal.length;
      }
    }
  } catch (err) {
    return [];
  }

  return entities;
}

/**
 * Merges Layer A (Deterministic) and Layer B (NER) entities.
 * Layer A structured identifiers always take precedence over NER on overlap.
 */
export function mergeLayerAAndNEREntities(layerA: Entity[], nerEntities: Entity[]): Entity[] {
  const structuredTypes = new Set(['AADHAAR', 'PAN', 'CARD', 'ACCOUNT', 'GSTIN', 'PASSPORT', 'VOTER_ID', 'DL', 'UPI', 'PHONE', 'EMAIL', 'DOB']);

  const all = [...layerA, ...nerEntities];

  // Sort by start span ascending, then length descending
  all.sort((a, b) => {
    if (a.span[0] !== b.span[0]) return a.span[0] - b.span[0];
    return (b.span[1] - b.span[0]) - (a.span[1] - a.span[0]);
  });

  const merged: Entity[] = [];
  let lastEnd = -1;

  for (const ent of all) {
    if (ent.span[0] >= lastEnd) {
      merged.push(ent);
      lastEnd = ent.span[1];
    } else {
      const prev = merged[merged.length - 1];
      // Structured ID from Layer A always takes priority over NER
      if (structuredTypes.has(ent.type) && !structuredTypes.has(prev.type)) {
        merged[merged.length - 1] = ent;
        lastEnd = ent.span[1];
      }
    }
  }

  return merged;
}

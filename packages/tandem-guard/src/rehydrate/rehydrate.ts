import { RehydrationResult } from '../types.js';

export function rehydrateText(
  cloudResponse: string,
  placeholderMap: Map<string, string>
): RehydrationResult {
  const placeholderRegex = /\[[A-Z_]+_\d+\]/g;
  let rehydrated = cloudResponse;
  let restoredCount = 0;
  const missingPlaceholders: string[] = [];
  const foundInResponse = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = placeholderRegex.exec(cloudResponse)) !== null) {
    const placeholder = match[0];
    foundInResponse.add(placeholder);
  }

  for (const placeholder of foundInResponse) {
    if (placeholderMap.has(placeholder)) {
      const originalValue = placeholderMap.get(placeholder)!;
      // Global replacement of placeholder
      rehydrated = rehydrated.split(placeholder).join(originalValue);
      restoredCount++;
    } else {
      missingPlaceholders.push(placeholder);
    }
  }

  // Check if any expected placeholders from placeholderMap were completely omitted by the model
  const expectedTotal = placeholderMap.size;
  const omittedPlaceholders: string[] = [];
  for (const key of placeholderMap.keys()) {
    if (!foundInResponse.has(key)) {
      omittedPlaceholders.push(key);
    }
  }

  return {
    rehydratedText: rehydrated,
    totalPlaceholders: expectedTotal,
    restoredCount,
    missingPlaceholders: [...missingPlaceholders, ...omittedPlaceholders],
    isClean: missingPlaceholders.length === 0
  };
}

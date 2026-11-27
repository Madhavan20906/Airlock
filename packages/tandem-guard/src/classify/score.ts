import { Entity, RoutingPolicy } from '../types.js';

export function calculateSensitivityScore(entities: Entity[], policy: RoutingPolicy): { score: number; entityCounts: Record<string, number> } {
  const entityCounts: Record<string, number> = {};

  if (!entities.length) {
    return { score: 0, entityCounts };
  }

  let totalWeight = 0;
  for (const ent of entities) {
    entityCounts[ent.type] = (entityCounts[ent.type] || 0) + 1;
    const weight = policy.entityWeights[ent.type] ?? 0.3;
    totalWeight += weight * ent.confidence;
  }

  // Saturating non-linear score function bounded in [0, 1]
  const rawScore = 1 - Math.exp(-totalWeight / 1.2);
  const score = Math.round(Math.min(1.0, Math.max(0.0, rawScore)) * 100) / 100;

  return { score, entityCounts };
}

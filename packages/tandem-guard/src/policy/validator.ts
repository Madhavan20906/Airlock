import { RoutingPolicy, PolicyMode } from '../types.js';
import { DEFAULT_ROUTING_POLICY } from './defaults.js';

export function parseAndValidatePolicy(input: unknown): RoutingPolicy {
  if (!input || typeof input !== 'object') {
    return DEFAULT_ROUTING_POLICY;
  }

  try {
    const raw = input as Partial<RoutingPolicy>;

    const mode: PolicyMode =
      raw.mode === 'private-first' || raw.mode === 'balanced' || raw.mode === 'performance'
        ? raw.mode
        : DEFAULT_ROUTING_POLICY.mode;

    const thresholds = {
      localOnly: typeof raw.thresholds?.localOnly === 'number'
        ? Math.max(0, Math.min(1, raw.thresholds.localOnly))
        : DEFAULT_ROUTING_POLICY.thresholds.localOnly,
      hardBlock: typeof raw.thresholds?.hardBlock === 'number'
        ? Math.max(0, Math.min(1, raw.thresholds.hardBlock))
        : DEFAULT_ROUTING_POLICY.thresholds.hardBlock
    };

    const entityWeights = {
      ...DEFAULT_ROUTING_POLICY.entityWeights,
      ...(raw.entityWeights || {})
    };

    const complexity = {
      highCharCount: typeof raw.complexity?.highCharCount === 'number' && raw.complexity.highCharCount > 0
        ? raw.complexity.highCharCount
        : DEFAULT_ROUTING_POLICY.complexity.highCharCount
    };

    const killSwitchLocalOnly = Boolean(raw.killSwitchLocalOnly);

    const enabledDetectors = Array.isArray(raw.enabledDetectors)
      ? raw.enabledDetectors.map(String)
      : DEFAULT_ROUTING_POLICY.enabledDetectors;

    return {
      version: typeof raw.version === 'number' ? raw.version : 1,
      thresholds,
      entityWeights,
      complexity,
      mode,
      killSwitchLocalOnly,
      enabledDetectors
    };
  } catch (err) {
    return DEFAULT_ROUTING_POLICY;
  }
}

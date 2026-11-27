import {
  RouteDecision,
  RoutingPolicy,
  TaskInput,
  Entity
} from '../types.js';
import { calculateSensitivityScore } from '../classify/score.js';
import { calculateComplexity } from '../classify/complexity.js';

export interface RouteContext {
  task: TaskInput;
  entities: Entity[];
  localModelAvailable: boolean;
  online: boolean;
  policy: RoutingPolicy;
  hasNERLayer: boolean;
}

export function evaluateRoute(ctx: RouteContext): RouteDecision {
  const { task, entities, localModelAvailable, online, policy, hasNERLayer } = ctx;
  const { score: sensitivityScore, entityCounts } = calculateSensitivityScore(entities, policy);
  const complexity = calculateComplexity(task, policy);
  const classifierMode = hasNERLayer ? 'hybrid' : 'deterministic-only';

  // 1. Emergency Kill Switch
  if (policy.killSwitchLocalOnly) {
    if (localModelAvailable) {
      return {
        route: 'LOCAL_ONLY',
        reason: 'Emergency privacy kill-switch enabled: strictly forced on-device.',
        sensitivityScore,
        complexity,
        classifierMode,
        entityCounts
      };
    } else {
      return {
        route: 'BLOCKED_NEEDS_CONSENT',
        reason: 'Kill-switch is active but no on-device model is accessible on this device.',
        sensitivityScore,
        complexity,
        classifierMode,
        entityCounts
      };
    }
  }

  // 2. Offline Mode
  if (!online) {
    if (localModelAvailable) {
      return {
        route: 'LOCAL_ONLY',
        reason: 'Device is offline. Running locally on-device.',
        sensitivityScore,
        complexity,
        classifierMode,
        entityCounts
      };
    } else {
      return {
        route: 'BLOCKED_NEEDS_CONSENT',
        reason: 'Offline: Network is unavailable and no local model is ready.',
        sensitivityScore,
        complexity,
        classifierMode,
        entityCounts
      };
    }
  }

  // 3. Hard Block Check
  if (sensitivityScore >= policy.thresholds.hardBlock && !localModelAvailable) {
    return {
      route: 'BLOCKED_NEEDS_CONSENT',
      reason: 'Extremely sensitive data detected and no on-device model exists. Cloud transmission blocked until verified.',
      sensitivityScore,
      complexity,
      classifierMode,
      entityCounts
    };
  }

  // 4. Policy Mode Execution
  if (policy.mode === 'private-first') {
    if (localModelAvailable) {
      return {
        route: 'LOCAL_ONLY',
        reason: 'Private-First mode active: running entirely on-device.',
        sensitivityScore,
        complexity,
        classifierMode,
        entityCounts
      };
    }
    if (sensitivityScore >= policy.thresholds.localOnly) {
      return {
        route: 'REDACTED_CLOUD',
        reason: 'Private-First mode: sensitive data sanitized locally before cloud inference.',
        sensitivityScore,
        complexity,
        classifierMode,
        entityCounts
      };
    }
    return {
      route: 'CLOUD_DIRECT',
      reason: 'Private-First mode: non-sensitive task routed to cloud as local model is missing.',
      sensitivityScore,
      complexity,
      classifierMode,
      entityCounts
    };
  }

  if (policy.mode === 'performance') {
    if (sensitivityScore >= policy.thresholds.localOnly) {
      return {
        route: 'REDACTED_CLOUD',
        reason: 'Performance mode: high-throughput cloud model selected with on-device PII redaction.',
        sensitivityScore,
        complexity,
        classifierMode,
        entityCounts
      };
    }
    return {
      route: 'CLOUD_DIRECT',
      reason: 'Performance mode: non-sensitive prompt routed to cloud for maximum speed.',
      sensitivityScore,
      complexity,
      classifierMode,
      entityCounts
    };
  }

  // Default: 'balanced' mode
  if (sensitivityScore >= policy.thresholds.localOnly) {
    if (complexity !== 'high' && localModelAvailable) {
      return {
        route: 'LOCAL_ONLY',
        reason: 'Sensitive data with low/medium complexity processed completely on-device. Zero network exposure.',
        sensitivityScore,
        complexity,
        classifierMode,
        entityCounts
      };
    } else {
      return {
        route: 'REDACTED_CLOUD',
        reason: 'Sensitive data with high complexity: sanitizing on-device before sending to cloud.',
        sensitivityScore,
        complexity,
        classifierMode,
        entityCounts
      };
    }
  }

  // Low or zero sensitivity
  if (localModelAvailable && complexity === 'low') {
    return {
      route: 'LOCAL_ONLY',
      reason: 'Low complexity task routed locally for instant latency and zero cloud costs.',
      sensitivityScore,
      complexity,
      classifierMode,
      entityCounts
    };
  }

  return {
    route: 'CLOUD_DIRECT',
    reason: 'Non-sensitive content routed directly to cloud AI.',
    sensitivityScore,
    complexity,
    classifierMode,
    entityCounts
  };
}

import { LedgerEvent, RouteDecision } from '../types.js';

export interface CreateEventOptions {
  routeDecision: RouteDecision;
  latencyMs: number;
  servedBy: 'on-device' | 'cloud' | 'blocked';
  placeholdersRestored?: number;
  userConsentRequired?: boolean;
  previousEvent?: LedgerEvent;
  policyVersion?: number;
}

export const GENESIS_PREVIOUS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

/** Fields covered by the hash: everything except `hash` itself. */
type HashedFields = Omit<LedgerEvent, 'hash'>;

/** Deterministic serialisation: fixed field order, entity counts sorted by key. */
export function canonicalLedgerPayload(e: HashedFields): string {
  const counts: Record<string, number> = {};
  for (const k of Object.keys(e.entityCounts || {}).sort()) counts[k] = e.entityCounts[k];
  return JSON.stringify([
    e.id, e.index, e.previousHash, e.timestamp, e.route, e.reason, e.classifierMode,
    e.sensitivityScore, counts, e.complexity, e.latencyMs, e.servedBy,
    e.placeholdersRestored, e.userConsentRequired, e.policyVersion ?? 0
  ]);
}

async function sha256Hex(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('WebCrypto SHA-256 unavailable: cannot build a tamper-evident ledger');
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

/** Real SHA-256 (WebCrypto) over the canonical event payload. */
export async function computeLedgerHash(e: HashedFields): Promise<string> {
  return sha256Hex(canonicalLedgerPayload(e));
}

function randomId(): string {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export async function createLedgerEvent(options: CreateEventOptions): Promise<LedgerEvent> {
  const { routeDecision, latencyMs, servedBy, placeholdersRestored = 0, userConsentRequired = false, previousEvent, policyVersion = 0 } = options;
  const timestamp = Date.now();
  const body: HashedFields = {
    id: `ev_${timestamp}_${randomId()}`,
    index: previousEvent ? previousEvent.index + 1 : 0,
    previousHash: previousEvent ? previousEvent.hash : GENESIS_PREVIOUS_HASH,
    timestamp,
    route: routeDecision.route,
    reason: routeDecision.reason,
    classifierMode: routeDecision.classifierMode,
    sensitivityScore: routeDecision.sensitivityScore,
    entityCounts: { ...routeDecision.entityCounts },
    complexity: routeDecision.complexity,
    latencyMs: Math.max(0, Math.round(latencyMs)),
    servedBy,
    placeholdersRestored,
    userConsentRequired,
    policyVersion
  };
  return { ...body, hash: await computeLedgerHash(body) };
}

/**
 * Recomputes every hash and link. `events` must be ordered oldest first.
 * An edit to any hashed field, a reorder, an insertion or a deletion is detected.
 */
export async function verifyLedgerChain(events: LedgerEvent[]): Promise<{ valid: boolean; error?: string; brokenIndex?: number }> {
  for (let i = 0; i < events.length; i++) {
    const current = events[i];
    if (current.index !== i) {
      return { valid: false, error: `Event ${i}: index is ${current.index}, expected ${i} (missing or reordered event)`, brokenIndex: i };
    }
    const expectedPrev = i === 0 ? GENESIS_PREVIOUS_HASH : events[i - 1].hash;
    if (current.previousHash !== expectedPrev) {
      return { valid: false, error: `Event ${i}: link to the previous event is broken`, brokenIndex: i };
    }
    const { hash, ...rest } = current;
    if (hash !== await computeLedgerHash(rest)) {
      return { valid: false, error: `Event ${i}: contents changed after it was recorded (SHA-256 mismatch)`, brokenIndex: i };
    }
  }
  return { valid: true };
}

export function computeLedgerSummary(events: LedgerEvent[]) {
  const total = events.length;
  if (!total) {
    return { totalPrompts: 0, percentLocal: 0, totalRedactedEntities: 0, entitiesByCategory: {}, cloudCallsAvoided: 0, averageLatencyMs: 0 };
  }
  let localCount = 0;
  let totalEntities = 0;
  let totalLatency = 0;
  const entitiesByCategory: Record<string, number> = {};
  for (const ev of events) {
    if (ev.servedBy === 'on-device') localCount++;
    totalLatency += ev.latencyMs;
    for (const [category, count] of Object.entries(ev.entityCounts || {})) {
      entitiesByCategory[category] = (entitiesByCategory[category] || 0) + count;
      totalEntities += count;
    }
  }
  return {
    totalPrompts: total,
    percentLocal: Math.round((localCount / total) * 100),
    totalRedactedEntities: totalEntities,
    entitiesByCategory,
    cloudCallsAvoided: localCount,
    averageLatencyMs: Math.round(totalLatency / total)
  };
}

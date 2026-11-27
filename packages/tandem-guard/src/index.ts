export * from './types.js';

// Classification & Scoring
export { calculateSensitivityScore } from './classify/score.js';
export { calculateComplexity } from './classify/complexity.js';

// Redaction & Detectors
export { validateVerhoeff, detectAadhaar } from './redact/detectors/aadhaar.js';
export { validatePAN, detectPAN } from './redact/detectors/pan.js';
export { validateLuhn, detectCard } from './redact/detectors/card.js';
export { detectBankDetails } from './redact/detectors/bank.js';
export { detectContactDetails } from './redact/detectors/contact.js';
export { detectAddress } from './redact/detectors/address.js';
export { detectGovernmentIDs } from './redact/detectors/government_ids.js';
export { detectDeterministicNames } from './redact/detectors/name_fallback.js';
export { normalizeInputText, NormalizedResult } from './redact/normalization.js';
export { runDeterministicDetectors } from './redact/deterministic.js';
export { buildNERPrompt, parseNERResponse, chunkTextForNER, mergeLayerAAndNEREntities } from './redact/ner.js';
export { redactText } from './redact/engine.js';
export { runVerifierPass, VerifierOptions, VerifierResult } from './redact/verifier.js';

// Routing Policy Engine
export { evaluateRoute, RouteContext } from './route/policy-engine.js';

// Rehydration
export { rehydrateText } from './rehydrate/rehydrate.js';

// Ledger & Receipts
export { createLedgerEvent, computeLedgerSummary, verifyLedgerChain, computeLedgerHash, canonicalLedgerPayload, GENESIS_PREVIOUS_HASH, CreateEventOptions } from './ledger/event.js';
export { generateEgressReceipt, computeSHA256, EgressReceipt, GenerateReceiptOptions } from './ledger/receipt.js';
export { EgressObserver, globalEgressObserver, EgressCaptureReport, EgressFrame } from './ledger/egress-observer.js';

// Policy
export {
  DEFAULT_ROUTING_POLICY,
  HEALTHCARE_POLICY_PACK,
  LEGAL_POLICY_PACK,
  FINANCE_TAX_POLICY_PACK,
  STUDENT_POLICY_PACK,
  FREELANCER_POLICY_PACK,
  POLICY_PACKS,
  PolicyPackName
} from './policy/defaults.js';
export { parseAndValidatePolicy } from './policy/validator.js';


// Leak Lab adversarial corpus
export { generateLeakLabCorpus, runLeakLab, runLeakCase, findLeakedCanaries, canonicalForLeak, LeakCase, LeakCaseResult, LeakLabReport, LeakOutcome, LeakTechnique, LeakCanaryType } from './leaklab/corpus.js';

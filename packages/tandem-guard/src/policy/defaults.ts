import { RoutingPolicy } from '../types.js';

export const DEFAULT_ROUTING_POLICY: RoutingPolicy = {
  version: 1,
  thresholds: {
    localOnly: 0.35,
    hardBlock: 0.70
  },
  entityWeights: {
    AADHAAR: 0.90,
    PAN: 0.80,
    ACCOUNT: 0.85,
    CARD: 0.95,
    PERSON: 0.35,
    PHONE: 0.40,
    EMAIL: 0.30,
    ADDRESS: 0.40,
    MEDICAL: 0.70,
    ORG: 0.15,
    GSTIN: 0.75,
    PASSPORT: 0.85,
    VOTER_ID: 0.80,
    DL: 0.75,
    UPI: 0.75,
    VEHICLE: 0.40,
    DOB: 0.50
  },
  complexity: {
    highCharCount: 6000
  },
  mode: 'balanced',
  killSwitchLocalOnly: false,
  enabledDetectors: [
    'aadhaar',
    'pan',
    'account',
    'card',
    'phone',
    'email',
    'address',
    'government_id',
    'upi',
    'vehicle',
    'dob',
    'name_fallback',
    'ner'
  ]
};

// 1. Healthcare Policy Pack (Clinics, Diagnostic Labs, Hospitals)
export const HEALTHCARE_POLICY_PACK: RoutingPolicy = {
  ...DEFAULT_ROUTING_POLICY,
  version: 2,
  mode: 'private-first',
  thresholds: {
    localOnly: 0.20,
    hardBlock: 0.50
  },
  entityWeights: {
    ...DEFAULT_ROUTING_POLICY.entityWeights,
    MEDICAL: 1.0,
    PERSON: 0.80,
    AADHAAR: 0.95,
    DOB: 0.75,
    PHONE: 0.60,
    ADDRESS: 0.60
  }
};

// 2. Legal Policy Pack (Law Firms, Legal Interns, Corporate Counsel)
export const LEGAL_POLICY_PACK: RoutingPolicy = {
  ...DEFAULT_ROUTING_POLICY,
  version: 2,
  mode: 'private-first',
  thresholds: {
    localOnly: 0.25,
    hardBlock: 0.55
  },
  entityWeights: {
    ...DEFAULT_ROUTING_POLICY.entityWeights,
    PERSON: 0.75,
    PAN: 0.95,
    AADHAAR: 0.95,
    PASSPORT: 0.90,
    ORG: 0.60,
    VOTER_ID: 0.85
  }
};

// 3. Finance & Tax Policy Pack (Chartered Accountants, Tax Filers, Payroll)
export const FINANCE_TAX_POLICY_PACK: RoutingPolicy = {
  ...DEFAULT_ROUTING_POLICY,
  version: 2,
  mode: 'private-first',
  thresholds: {
    localOnly: 0.25,
    hardBlock: 0.55
  },
  entityWeights: {
    ...DEFAULT_ROUTING_POLICY.entityWeights,
    PAN: 1.0,
    ACCOUNT: 1.0,
    GSTIN: 0.95,
    UPI: 0.95,
    CARD: 1.0,
    AADHAAR: 0.95
  }
};

// 4. Student Policy Pack (Academic Research, Study Notes, Homework Q&A)
export const STUDENT_POLICY_PACK: RoutingPolicy = {
  ...DEFAULT_ROUTING_POLICY,
  version: 2,
  mode: 'performance',
  thresholds: {
    localOnly: 0.45,
    hardBlock: 0.80
  },
  entityWeights: {
    ...DEFAULT_ROUTING_POLICY.entityWeights,
    PERSON: 0.20,
    EMAIL: 0.20,
    PHONE: 0.30
  }
};

// 5. Freelancer Policy Pack (Independent Consultants, Web Designers, Content Creators)
export const FREELANCER_POLICY_PACK: RoutingPolicy = {
  ...DEFAULT_ROUTING_POLICY,
  version: 2,
  mode: 'balanced',
  thresholds: {
    localOnly: 0.30,
    hardBlock: 0.65
  },
  entityWeights: {
    ...DEFAULT_ROUTING_POLICY.entityWeights,
    UPI: 0.85,
    ACCOUNT: 0.90,
    PAN: 0.85,
    PHONE: 0.50
  }
};

export type PolicyPackName = 'default' | 'healthcare' | 'legal' | 'finance' | 'student' | 'freelancer';

export const POLICY_PACKS: Record<PolicyPackName, RoutingPolicy> = {
  default: DEFAULT_ROUTING_POLICY,
  healthcare: HEALTHCARE_POLICY_PACK,
  legal: LEGAL_POLICY_PACK,
  finance: FINANCE_TAX_POLICY_PACK,
  student: STUDENT_POLICY_PACK,
  freelancer: FREELANCER_POLICY_PACK
};

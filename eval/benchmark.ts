import {
  runDeterministicDetectors,
  redactText,
  parseNERResponse,
  buildNERPrompt,
  mergeLayerAAndNEREntities
} from '../packages/tandem-guard/dist/index.js';
import type { Entity } from '../packages/tandem-guard/dist/index.js';
import { BENCHMARK_DATASET_110 } from './dataset_110.ts';
export { BENCHMARK_DATASET_110 };

export interface GroundTruthDocument {
  id: string;
  name: string;
  category: 'invoice' | 'medical' | 'contract' | 'chat' | 'kyc' | 'banking' | 'api' | 'multilingual' | 'ocr' | 'unstructured' | 'adversarial';
  text: string;
  expectedEntities: { type: string; value: string; isHardCase?: boolean }[];
  negativeExamples?: string[]; // strings that must NOT be flagged as PII
}

export const BENCHMARK_DATASET_40: GroundTruthDocument[] = [
  // ==================== INVOICES (1-8) ====================
  {
    id: 'INV-01',
    name: 'Freelance Consulting Tax Invoice',
    category: 'invoice',
    text: `INVOICE #INV-2026-881\nDate: 12/03/2026\nPayee: Ananya Deshmukh\nPAN: AAAPD1234F\nAadhaar: 9999 9999 0019\nBank Account: 50100412345678\nIFSC: HDFC0000128\nGSTIN: 27AAAPD1234F1Z3\nEmail: ananya.deshmukh@freelance.in\nPhone: +91 98200 12345\nAddress: Flat 402, Bellandur, Bengaluru PIN 560103\nAmount: Rs. 1,45,000`,
    expectedEntities: [
      { type: 'PERSON', value: 'Ananya Deshmukh' },
      { type: 'PAN', value: 'AAAPD1234F' },
      { type: 'AADHAAR', value: '9999 9999 0019' },
      { type: 'ACCOUNT', value: '50100412345678' },
      { type: 'ACCOUNT', value: 'HDFC0000128' },
      { type: 'GSTIN', value: '27AAAPD1234F1Z3' },
      { type: 'EMAIL', value: 'ananya.deshmukh@freelance.in' },
      { type: 'PHONE', value: '+91 98200 12345' },
      { type: 'ADDRESS', value: '560103' }
    ],
    negativeExamples: ['145000', '2026', '12/03/2026']
  },
  {
    id: 'INV-02',
    name: 'Hardware Vendor Invoice with Spaced IDs & Near Misses',
    category: 'invoice',
    text: `Hardware Invoice #HW-90214\nOrder ID: 123456789012 (Tracking barcode - NOT Aadhaar)\nSupplier PAN: AAACB 1234 F\nAadhaar: 2345-6789-0124\nUPI VPA: hardware.supplies@okhdfcbank\nContact: 98110-22334\nDispatch: Warehousing Hub 12, Sector 18, PIN 110001`,
    expectedEntities: [
      { type: 'PAN', value: 'AAACB 1234 F', isHardCase: true },
      { type: 'AADHAAR', value: '2345-6789-0124', isHardCase: true },
      { type: 'UPI', value: 'hardware.supplies@okhdfcbank' },
      { type: 'PHONE', value: '98110-22334' },
      { type: 'ADDRESS', value: '110001' }
    ],
    negativeExamples: ['123456789012', '90214'] // 12-digit order number must not trigger Verhoeff
  },
  {
    id: 'INV-03',
    name: 'IT Services Bill with Transliterated Tamil Names',
    category: 'invoice',
    text: `Tax Bill for Muthukumar Subramaniam\nClient: Senthil Velmurugan\nPAN: BZRPK5678M\nBank A/C: 919293949596\nIFSC: SBIN0004567\nDelivery Vehicle: TN 07 AB 1234\nOffice: Anna Salai, Chennai PIN 600002\nSupport: muthu.subra@chennaitech.co.in`,
    expectedEntities: [
      { type: 'PERSON', value: 'Senthil Velmurugan' },
      { type: 'PAN', value: 'BZRPK5678M' },
      { type: 'ACCOUNT', value: '919293949596' },
      { type: 'ACCOUNT', value: 'SBIN0004567' },
      { type: 'VEHICLE', value: 'TN 07 AB 1234' },
      { type: 'EMAIL', value: 'muthu.subra@chennaitech.co.in' },
      { type: 'ADDRESS', value: '600002' }
    ]
  },
  {
    id: 'INV-04',
    name: 'Legal Retainer Invoice with Lowercase PAN',
    category: 'invoice',
    text: `Chambers of Adv. Arvind Swaminathan\nRetainer Fee Invoice\nClient Name: Rajesh Mehra\nTax ID (PAN): abcpe1234f\nAccount No: 201000998877\nIFSC: ICIC0000002\nUPI: arvind.law@icici\nMobile: 9845012345\nChambers: High Court Road, PIN 110003`,
    expectedEntities: [
      { type: 'PERSON', value: 'Rajesh Mehra' },
      { type: 'PERSON', value: 'Arvind Swaminathan' },
      { type: 'PAN', value: 'abcpe1234f', isHardCase: true },
      { type: 'ACCOUNT', value: '201000998877' },
      { type: 'ACCOUNT', value: 'ICIC0000002' },
      { type: 'UPI', value: 'arvind.law@icici' },
      { type: 'PHONE', value: '9845012345' },
      { type: 'ADDRESS', value: '110003' }
    ]
  },
  {
    id: 'INV-05',
    name: 'Logistics Bill with Vehicle Number & E-way Ref',
    category: 'invoice',
    text: `National Fast Cargo Bill\nVehicle Plate: MH 12 AB 1234\nDriver Licence: DL-0420110012345\nContact Driver: 9876543210\nDelivery To: Smt. Sunita Rao\nConsignment Ref: 987654321098\nDestination Hub: Pune Bypass, PIN 411001`,
    expectedEntities: [
      { type: 'VEHICLE', value: 'MH 12 AB 1234' },
      { type: 'DL', value: 'DL-0420110012345' },
      { type: 'PHONE', value: '9876543210' },
      { type: 'PERSON', value: 'Sunita Rao' },
      { type: 'ADDRESS', value: '411001' }
    ]
  },
  {
    id: 'INV-06',
    name: 'Cloud Hosting Invoice with Near Miss Date/IP',
    category: 'invoice',
    text: `CloudStack Billing Invoice\nServer IP: 192.168.1.1\nBilling Period: 2026-01-01 to 2026-01-31\nCorporate Card Paid: 4532 0151 1283 0366\nRegistered Admin: admin@cloudstack.io\nGSTIN: 06AAACH1234F1Z9\nBilling Entity: CloudStack Labs India Ltd`,
    expectedEntities: [
      { type: 'CARD', value: '4532 0151 1283 0366' },
      { type: 'EMAIL', value: 'admin@cloudstack.io' },
      { type: 'GSTIN', value: '06AAACH1234F1Z9' }
    ],
    negativeExamples: ['192.168.1.1', '2026-01-01', '2026-01-31']
  },
  {
    id: 'INV-07',
    name: 'Dental Care Invoice with OCR Noise',
    category: 'invoice',
    text: `Bright Dental Care Clinic\nPatient: Harpreet Singh Dhillon\nAadhaar: 9999 9999 OO19 (OCR scan text)\nDoctor: Dr. Priya Patel\nEmergency Contact: +91 97112 34567\nPayment via UPI: harpreet@paytm\nClinic Address: Chandigarh Road, PIN 160017`,
    expectedEntities: [
      { type: 'PERSON', value: 'Harpreet Singh Dhillon' },
      { type: 'AADHAAR', value: '9999 9999 OO19', isHardCase: true },
      { type: 'PERSON', value: 'Priya Patel' },
      { type: 'PHONE', value: '+91 97112 34567' },
      { type: 'UPI', value: 'harpreet@paytm' },
      { type: 'ADDRESS', value: '160017' }
    ]
  },
  {
    id: 'INV-08',
    name: 'Architectural Retainer with Hinglish Annotations',
    category: 'invoice',
    text: `Babu & Associates Retainer Invoice\nClient: Suresh Babu\nKaam ke paise transfer karo to A/C: 102030405060\nIFSC: BARB0KOLKAT\nPAN number diya hai: AAAPS9999K\nPhone number pe baat karein: 98300 98300\nKolkata Park Street PIN 700016`,
    expectedEntities: [
      { type: 'PERSON', value: 'Suresh Babu' },
      { type: 'ACCOUNT', value: '102030405060' },
      { type: 'ACCOUNT', value: 'BARB0KOLKAT' },
      { type: 'PAN', value: 'AAAPS9999K' },
      { type: 'PHONE', value: '98300 98300' },
      { type: 'ADDRESS', value: '700016' }
    ]
  },

  // ==================== MEDICAL NOTES (9-16) ====================
  {
    id: 'MED-09',
    name: 'Apollo Hospital Outpatient Clinical Summary',
    category: 'medical',
    text: `APOLLO HOSPITALS OUTPATIENT SUMMARY\nPatient: Anita Desai, 54F\nDOB: 14/07/1971\nAadhaar: 999999990019\nEmergency Phone: 98199 88776\nEmail: anita.desai@mumbaicare.org\nDiagnosis: Hypertension & Chronic Migraine\nPrescription: Amlodipine 5mg OD\nAddress: Marine Drive, PIN 400020, Mumbai`,
    expectedEntities: [
      { type: 'PERSON', value: 'Anita Desai' },
      { type: 'DOB', value: '14/07/1971' },
      { type: 'AADHAAR', value: '999999990019' },
      { type: 'PHONE', value: '98199 88776' },
      { type: 'EMAIL', value: 'anita.desai@mumbaicare.org' },
      { type: 'ADDRESS', value: '400020' }
    ]
  },
  {
    id: 'MED-10',
    name: 'Pathology Lab Blood Report with Medical Flags',
    category: 'medical',
    text: `SRL DIAGNOSTICS LAB REPORT #LAB-7712\nPatient: Vikramaditya Singhania\nAge/Gender: 48M\nDoctor: Dr. Meenakshi Sundaram\nContact: +91 98840 11223\nSpecimen Collected: Fasting Blood Sugar 186 mg/dL\nHbA1c: 8.4%\nReport Email: reports.vikram@singh.in\nRegistered Lab: Sector 29, Gurugram PIN 122002`,
    expectedEntities: [
      { type: 'PERSON', value: 'Vikramaditya Singhania' },
      { type: 'PERSON', value: 'Meenakshi Sundaram' },
      { type: 'PHONE', value: '+91 98840 11223' },
      { type: 'EMAIL', value: 'reports.vikram@singh.in' },
      { type: 'ADDRESS', value: '122002' }
    ]
  },
  {
    id: 'MED-11',
    name: 'Discharge Summary with Medication & Insurance ID',
    category: 'medical',
    text: `DISCHARGE SUMMARY - Fortis Healthcare\nPatient: Rameshwar Prasad Gupta\nInsurance ID: HDFC-MED-998811\nPAN: AABPG1234D\nAadhaar: 2345-6789-0124\nTreating Consultant: Dr. Arvind Swaminathan\nMedications: Clopidogrel 75mg, Atorvastatin 20mg\nFollow-up Contact: 98210 54321`,
    expectedEntities: [
      { type: 'PERSON', value: 'Rameshwar Prasad Gupta' },
      { type: 'PAN', value: 'AABPG1234D' },
      { type: 'AADHAAR', value: '2345-6789-0124' },
      { type: 'PERSON', value: 'Arvind Swaminathan' },
      { type: 'PHONE', value: '98210 54321' }
    ]
  },
  {
    id: 'MED-12',
    name: 'Psychiatric Note with Sensitive Mental Health Context',
    category: 'medical',
    text: `Confidential Consultation Record\nClient: Priya Ramanathan\nDOB: 23-11-1994\nEmergency Guardian: Mr. K Ramanathan (+91 94440 98765)\nDiagnosis: Generalized Anxiety Disorder & Mild Depressive Episode\nPrescription: Escitalopram 10mg daily\nEmail: priya.r@outlook.in`,
    expectedEntities: [
      { type: 'PERSON', value: 'Priya Ramanathan' },
      { type: 'DOB', value: '23-11-1994' },
      { type: 'PERSON', value: 'K Ramanathan' },
      { type: 'PHONE', value: '+91 94440 98765' },
      { type: 'EMAIL', value: 'priya.r@outlook.in' }
    ]
  },
  {
    id: 'MED-13',
    name: 'Ophthalmology Referral Note',
    category: 'medical',
    text: `Eye Care Foundation Referral\nPatient: Aniruddh Sengupta\nDoctor: Dr. Sunita Rao\nPassport: Z9876543\nContact: 98311 22334\nReferral for Diabetic Retinopathy screening\nClinic PIN 700029, Kolkata`,
    expectedEntities: [
      { type: 'PERSON', value: 'Aniruddh Sengupta' },
      { type: 'PERSON', value: 'Sunita Rao' },
      { type: 'PASSPORT', value: 'Z9876543' },
      { type: 'PHONE', value: '98311 22334' },
      { type: 'ADDRESS', value: '700029' }
    ]
  },
  {
    id: 'MED-14',
    name: 'Pediatric Vaccine Chart with Parent Details',
    category: 'medical',
    text: `Pediatric Immunization Card\nChild Name: Aarav Sharma\nParent: Mr. Rajesh Sharma\nMother Phone: +91 98100 44556\nParent PAN: ABCPE1234F\nResidential PIN: 110092\nVaccines: MMR booster, Hepatitis B completed`,
    expectedEntities: [
      { type: 'PERSON', value: 'Aarav Sharma' },
      { type: 'PERSON', value: 'Rajesh Sharma' },
      { type: 'PHONE', value: '+91 98100 44556' },
      { type: 'PAN', value: 'ABCPE1234F' },
      { type: 'ADDRESS', value: '110092' }
    ]
  },
  {
    id: 'MED-15',
    name: 'Oncology Followup Record',
    category: 'medical',
    text: `TATA Memorial Referral\nPatient: Gurpreet Kaur\nUHID Aadhaar: 9999 9999 0019\nOncologist: Dr. Priya Patel\nPhone: 98188 77665\nEmail: g.kaur1980@gmail.com\nAdjuvant Chemotherapy cycle 4 completed`,
    expectedEntities: [
      { type: 'PERSON', value: 'Gurpreet Kaur' },
      { type: 'AADHAAR', value: '9999 9999 0019' },
      { type: 'PERSON', value: 'Priya Patel' },
      { type: 'PHONE', value: '98188 77665' },
      { type: 'EMAIL', value: 'g.kaur1980@gmail.com' }
    ]
  },
  {
    id: 'MED-16',
    name: 'Dental Surgery Consent with Pre-op Medical Note',
    category: 'medical',
    text: `Surgical Extraction Consent Form\nPatient Name: Suresh Babu\nDOB: 05/10/1983\nAllergies: Penicillin allergic\nSurgeon: Dr. Arvind Swaminathan\nEmergency Contact: 98400 11223\nCard Payment: 4532 0151 1283 0366`,
    expectedEntities: [
      { type: 'PERSON', value: 'Suresh Babu' },
      { type: 'DOB', value: '05/10/1983' },
      { type: 'PERSON', value: 'Arvind Swaminathan' },
      { type: 'PHONE', value: '98400 11223' },
      { type: 'CARD', value: '4532 0151 1283 0366' }
    ]
  },

  // ==================== CONTRACTS & LEGAL (17-24) ====================
  {
    id: 'CON-17',
    name: 'Mutual Non-Disclosure Agreement (NDA)',
    category: 'contract',
    text: `NON-DISCLOSURE AGREEMENT\nThis Agreement is entered by CloudScale Labs Pvt Ltd and:\nConsultant: Rajesh Sharma\nPAN ID: ABCPE1234F\nAadhaar: 9999 9999 0019\nEmail: rajesh.sharma@techadvisor.in\nPhone: +91 98111 22233\nRegistered Residence: Bandra West, Mumbai PIN 400050`,
    expectedEntities: [
      { type: 'PERSON', value: 'Rajesh Sharma' },
      { type: 'PAN', value: 'ABCPE1234F' },
      { type: 'AADHAAR', value: '9999 9999 0019' },
      { type: 'EMAIL', value: 'rajesh.sharma@techadvisor.in' },
      { type: 'PHONE', value: '+91 98111 22233' },
      { type: 'ADDRESS', value: '400050' }
    ]
  },
  {
    id: 'CON-18',
    name: 'Employment Offer & Compensation Clause',
    category: 'contract',
    text: `EMPLOYMENT CONTRACT ANNEXURE\nEmployee: Anita Desai\nPF Account Number: 100998877665\nSalary Account: 002101567890\nBank IFSC: ICIC0000002\nIncome Tax PAN: aaapd1234f\nCorporate Email: anita.desai@corp.net\nContact: 98200 98200`,
    expectedEntities: [
      { type: 'PERSON', value: 'Anita Desai' },
      { type: 'ACCOUNT', value: '002101567890' },
      { type: 'ACCOUNT', value: 'ICIC0000002' },
      { type: 'PAN', value: 'aaapd1234f', isHardCase: true },
      { type: 'EMAIL', value: 'anita.desai@corp.net' },
      { type: 'PHONE', value: '98200 98200' }
    ]
  },
  {
    id: 'CON-19',
    name: 'Commercial Property Lease Deed',
    category: 'contract',
    text: `LEASE DEED FOR COMMERCIAL PREMISES\nLessor: Vikramaditya Singhania\nLessee: Muthukumar Subramaniam\nProperty: Shop 14, Commercial Complex, Sector 18, PIN 201301 Noida\nMonthly Rent: Rs. 65,000 paid to A/C: 987654321098\nIFSC: SBIN0001234\nDeposit Paid by Cheque / Card: 4532 0151 1283 0366`,
    expectedEntities: [
      { type: 'PERSON', value: 'Vikramaditya Singhania' },
      { type: 'PERSON', value: 'Muthukumar Subramaniam' },
      { type: 'ADDRESS', value: '201301' },
      { type: 'ACCOUNT', value: '987654321098' },
      { type: 'ACCOUNT', value: 'SBIN0001234' },
      { type: 'CARD', value: '4532 0151 1283 0366' }
    ]
  },
  {
    id: 'CON-20',
    name: 'Software Licensing Agreement Clause',
    category: 'contract',
    text: `MASTER SOFTWARE LICENSE\nLicensee: Priya Ramanathan\nCompany GSTIN: 33BLLPR4321K1Z4\nAuthorized Admin: priya@ramantech.com\nEmergency Notice Phone: +91 94440 12345\nBank Wire: 50100412345678 IFSC HDFC0000128\nChennai Office PIN 600004`,
    expectedEntities: [
      { type: 'PERSON', value: 'Priya Ramanathan' },
      { type: 'GSTIN', value: '33BLLPR4321K1Z4' },
      { type: 'EMAIL', value: 'priya@ramantech.com' },
      { type: 'PHONE', value: '+91 94440 12345' },
      { type: 'ACCOUNT', value: '50100412345678' },
      { type: 'ACCOUNT', value: 'HDFC0000128' },
      { type: 'ADDRESS', value: '600004' }
    ]
  },
  {
    id: 'CON-21',
    name: 'Promissory Note & Unsecured Loan Agreement',
    category: 'contract',
    text: `PROMISSORY NOTE\nI, Borrower Suresh Babu, residing at PIN 700020 Kolkata,\npromise to pay Lender Harpreet Singh Dhillon sum of Rs 2,00,000.\nBorrower PAN: AAAPS9999K\nAadhaar: 2345-6789-0124\nSettlement UPI: suresh.babu@okaxis\nPhone: 98310 98310`,
    expectedEntities: [
      { type: 'PERSON', value: 'Suresh Babu' },
      { type: 'ADDRESS', value: '700020' },
      { type: 'PERSON', value: 'Harpreet Singh Dhillon' },
      { type: 'PAN', value: 'AAAPS9999K' },
      { type: 'AADHAAR', value: '2345-6789-0124' },
      { type: 'UPI', value: 'suresh.babu@okaxis' },
      { type: 'PHONE', value: '98310 98310' }
    ]
  },
  {
    id: 'CON-22',
    name: 'Independent Contractor Agreement with Driving Licence',
    category: 'contract',
    text: `CONTRACTOR ONBOARDING\nContractor: Aniruddh Sengupta\nDriving Licence: DL-0420110012345\nVehicle Registered: DL 01 C 1234\nPrimary Phone: +91 98111 88990\nContractor Email: aniruddh.sen@deliveries.in\nPayout Account: 12345678901234\nIFSC Code: HDFC0001234`,
    expectedEntities: [
      { type: 'PERSON', value: 'Aniruddh Sengupta' },
      { type: 'DL', value: 'DL-0420110012345' },
      { type: 'VEHICLE', value: 'DL 01 C 1234' },
      { type: 'PHONE', value: '+91 98111 88990' },
      { type: 'EMAIL', value: 'aniruddh.sen@deliveries.in' },
      { type: 'ACCOUNT', value: '12345678901234' },
      { type: 'ACCOUNT', value: 'HDFC0001234' }
    ]
  },
  {
    id: 'CON-23',
    name: 'IP Assignment Deed with Passport Identifier',
    category: 'contract',
    text: `INTELLECTUAL PROPERTY ASSIGNMENT\nAssignor: Gurpreet Kaur\nIndian Passport No: A1234567\nPAN Identification: AAAPG1234K\nResident of Sector 44, Chandigarh PIN 160047\nMobile Contact: 98722 33445\nEmail: g.kaur@ipcreators.org`,
    expectedEntities: [
      { type: 'PERSON', value: 'Gurpreet Kaur' },
      { type: 'PASSPORT', value: 'A1234567' },
      { type: 'PAN', value: 'AAAPG1234K' },
      { type: 'ADDRESS', value: '160047' },
      { type: 'PHONE', value: '98722 33445' },
      { type: 'EMAIL', value: 'g.kaur@ipcreators.org' }
    ]
  },
  {
    id: 'CON-24',
    name: 'Vendor Partnership Agreement Clause',
    category: 'contract',
    text: `PARTNERSHIP AGREEMENT\nBetween FinTech Services Ltd and:\nPartner Name: Rameshwar Prasad Gupta\nGSTIN: 09AABPG1234D1Z8\nBank A/C: 987654321098\nIFSC: SBIN0001234\nUPI Settlement: rameshwar@ybl\nHead Office: Mall Road, Kanpur PIN 208001`,
    expectedEntities: [
      { type: 'PERSON', value: 'Rameshwar Prasad Gupta' },
      { type: 'GSTIN', value: '09AABPG1234D1Z8' },
      { type: 'ACCOUNT', value: '987654321098' },
      { type: 'ACCOUNT', value: 'SBIN0001234' },
      { type: 'UPI', value: 'rameshwar@ybl' },
      { type: 'ADDRESS', value: '208001' }
    ]
  },

  // ==================== SUPPORT CHAT & COMMUNICATIONS (25-32) ====================
  {
    id: 'CHT-25',
    name: 'E-Commerce Double-Charge Dispute Chat',
    category: 'chat',
    text: `Customer: Hi, I noticed a duplicate transaction for Rs 4,999.\nAgent: Could you please provide your registered details?\nCustomer: My name is Kavita Narang, email is kavita.n@outlook.com.\nCard used was 4532 0151 1283 0366.\nMy phone is +91 99887 65432.\nPostal code is 400001 Mumbai.`,
    expectedEntities: [
      { type: 'PERSON', value: 'Kavita Narang' },
      { type: 'EMAIL', value: 'kavita.n@outlook.com' },
      { type: 'CARD', value: '4532 0151 1283 0366' },
      { type: 'PHONE', value: '+91 99887 65432' },
      { type: 'ADDRESS', value: '400001' }
    ]
  },
  {
    id: 'CHT-26',
    name: 'Fintech UPI Transaction Failure Query',
    category: 'chat',
    text: `User: Mera UPI payment fail ho gaya par paise cut gaye.\nSupport: Please share your UPI VPA and registered mobile number.\nUser: VPA: arjun.kumar@oksbi, phone: 98400 98400.\nBeneficiary A/C: 50100412345678 IFSC HDFC0000128.\nRef ID: 981240192841.`,
    expectedEntities: [
      { type: 'UPI', value: 'arjun.kumar@oksbi' },
      { type: 'PHONE', value: '98400 98400' },
      { type: 'ACCOUNT', value: '50100412345678' },
      { type: 'ACCOUNT', value: 'HDFC0000128' }
    ],
    negativeExamples: ['981240192841'] // Transaction ref ID must not be flagged as Aadhaar
  },
  {
    id: 'CHT-27',
    name: 'Telecom Sim Card KYC Verification Chat',
    category: 'chat',
    text: `Customer: I need to update my KYC for mobile 98210 11223.\nAgent: Please confirm your Aadhaar and PAN.\nCustomer: Aadhaar is 9999 9999 0019.\nPAN: ABCPE1234F.\nName on record is Rajesh Sharma.\nEmail: rajesh.s@telecom-user.in`,
    expectedEntities: [
      { type: 'PHONE', value: '98210 11223' },
      { type: 'AADHAAR', value: '9999 9999 0019' },
      { type: 'PAN', value: 'ABCPE1234F' },
      { type: 'PERSON', value: 'Rajesh Sharma' },
      { type: 'EMAIL', value: 'rajesh.s@telecom-user.in' }
    ]
  },
  {
    id: 'CHT-28',
    name: 'Airlines Re-booking with Passport & Flying Returns',
    category: 'chat',
    text: `Traveler: Need to reschedule international flight to London.\nBooking Agent: Please state passport number and passenger name.\nTraveler: Passenger: Ananya Deshmukh, Passport No: A1234567.\nEmail: ananya.d@travelnet.co.uk.\nContact: +91 98200 12345.`,
    expectedEntities: [
      { type: 'PERSON', value: 'Ananya Deshmukh' },
      { type: 'PASSPORT', value: 'A1234567' },
      { type: 'EMAIL', value: 'ananya.d@travelnet.co.uk' },
      { type: 'PHONE', value: '+91 98200 12345' }
    ]
  },
  {
    id: 'CHT-29',
    name: 'Banking NetBanking Password Reset Triage',
    category: 'chat',
    text: `Customer: Locked out of my netbanking account.\nAgent: For verification, provide your registered PAN and Date of Birth.\nCustomer: PAN is AAAPD1234F, DOB: 12/03/1985.\nRegistered A/C No: 123456789012.\nEmail alert sent to: ananya.d@mail.com.`,
    expectedEntities: [
      { type: 'PAN', value: 'AAAPD1234F' },
      { type: 'DOB', value: '12/03/1985' },
      { type: 'ACCOUNT', value: '123456789012' },
      { type: 'EMAIL', value: 'ananya.d@mail.com' }
    ]
  },
  {
    id: 'CHT-30',
    name: 'WhatsApp Onboarding Chat with Vehicle Photo Ref',
    category: 'chat',
    text: `Driver: Bhai onboarding document photo bheja hai.\nVehicle Plate: MH 12 AB 1234.\nDriving Licence: DL-0420110012345.\nMera naam Suresh Babu hai, mobile 98300 98300.\nUPI ID: suresh.cab@paytm.`,
    expectedEntities: [
      { type: 'VEHICLE', value: 'MH 12 AB 1234' },
      { type: 'DL', value: 'DL-0420110012345' },
      { type: 'PERSON', value: 'Suresh Babu' },
      { type: 'PHONE', value: '98300 98300' },
      { type: 'UPI', value: 'suresh.cab@paytm' }
    ]
  },
  {
    id: 'CHT-31',
    name: 'WhatsApp Clinic Appointment Confirmation',
    category: 'chat',
    text: `Clinic Bot: Appointment confirmed with Dr. Arvind Swaminathan.\nPatient: Anita Desai for tomorrow 10am.\nEmergency Mobile: +91 98199 88776.\nClinic location: Bellandur, Bengaluru PIN 560103.`,
    expectedEntities: [
      { type: 'PERSON', value: 'Arvind Swaminathan' },
      { type: 'PERSON', value: 'Anita Desai' },
      { type: 'PHONE', value: '+91 98199 88776' },
      { type: 'ADDRESS', value: '560103' }
    ]
  },
  {
    id: 'CHT-32',
    name: 'HR Benefits Support Inquiry on Maternity / PF',
    category: 'chat',
    text: `Employee: Hello HR, need help claiming medical insurance for hospital bills.\nHR: Please share policy holder name and PAN.\nEmployee: Name: Priya Ramanathan, PAN: BLLPR4321K.\nEmail: priya.r@techcorp.in, Phone: 98450 98765.\nReimbursement A/C: 002101567890.`,
    expectedEntities: [
      { type: 'PERSON', value: 'Priya Ramanathan' },
      { type: 'PAN', value: 'BLLPR4321K' },
      { type: 'EMAIL', value: 'priya.r@techcorp.in' },
      { type: 'PHONE', value: '98450 98765' },
      { type: 'ACCOUNT', value: '002101567890' }
    ]
  },

  // ==================== KYC & BANKING (33-40) ====================
  {
    id: 'KYC-33',
    name: 'Mutual Fund Video KYC Verification Sheet',
    category: 'kyc',
    text: `CENTRAL KYC REGISTRY FORM\nInvestor: Vikramaditya Singhania\nPAN: ABCPE1234F\nAadhaar: 9999 9999 0019\nDOB: 15/08/1976\nBank A/C: 987654321098 IFSC SBIN0001234\nEmail: vikram.s@investors.org\nPhone: +91 98840 11223\nAddress: Sector 14, Gurugram PIN 122001`,
    expectedEntities: [
      { type: 'PERSON', value: 'Vikramaditya Singhania' },
      { type: 'PAN', value: 'ABCPE1234F' },
      { type: 'AADHAAR', value: '9999 9999 0019' },
      { type: 'DOB', value: '15/08/1976' },
      { type: 'ACCOUNT', value: '987654321098' },
      { type: 'ACCOUNT', value: 'SBIN0001234' },
      { type: 'EMAIL', value: 'vikram.s@investors.org' },
      { type: 'PHONE', value: '+91 98840 11223' },
      { type: 'ADDRESS', value: '122001' }
    ]
  },
  {
    id: 'KYC-34',
    name: 'Demat & Trading Account Opening Form',
    category: 'kyc',
    text: `ZERODHA BROKING ACCOUNT OPENING\nApplicant Name: Harpreet Singh Dhillon\nIncome Tax PAN: BZRPK5678M\nAadhaar Card: 2345-6789-0124\nUPI Handle: harpreet.d@okhdfcbank\nLinked Bank A/C: 50100412345678\nMobile: 98110 55443\nPostal Code: 160017`,
    expectedEntities: [
      { type: 'PERSON', value: 'Harpreet Singh Dhillon' },
      { type: 'PAN', value: 'BZRPK5678M' },
      { type: 'AADHAAR', value: '2345-6789-0124' },
      { type: 'UPI', value: 'harpreet.d@okhdfcbank' },
      { type: 'ACCOUNT', value: '50100412345678' },
      { type: 'PHONE', value: '98110 55443' },
      { type: 'ADDRESS', value: '160017' }
    ]
  },
  {
    id: 'KYC-35',
    name: 'Housing Loan Sanction Letter',
    category: 'banking',
    text: `HDFC BANK HOME LOAN SANCTION\nPrimary Applicant: Rajesh Sharma\nCo-Applicant: Sunita Sharma\nSanctioned Loan Account: 987654321098\nDisbursement IFSC: HDFC0000128\nBorrower PAN: ABCPE1234F\nAadhaar: 999999990019\nRegistered Mobile: +91 98111 22233\nProperty PIN: 400050`,
    expectedEntities: [
      { type: 'PERSON', value: 'Rajesh Sharma' },
      { type: 'ACCOUNT', value: '987654321098' },
      { type: 'ACCOUNT', value: 'HDFC0000128' },
      { type: 'PAN', value: 'ABCPE1234F' },
      { type: 'AADHAAR', value: '999999990019' },
      { type: 'PHONE', value: '+91 98111 22233' },
      { type: 'ADDRESS', value: '400050' }
    ]
  },
  {
    id: 'KYC-36',
    name: 'Fixed Deposit Receipt with Nominee Details',
    category: 'banking',
    text: `STATE BANK OF INDIA - TERM DEPOSIT RECEIPT\nDeposit A/C: 201000998877\nAccount Holder: Ananya Deshmukh\nNominee: Mr. Arvind Swaminathan\nIFSC: SBIN0001234\nCustomer PAN: AAAPD1234F\nEmail: ananya.deshmukh@sbi-user.in\nBranch PIN: 400020`,
    expectedEntities: [
      { type: 'ACCOUNT', value: '201000998877' },
      { type: 'PERSON', value: 'Ananya Deshmukh' },
      { type: 'PERSON', value: 'Arvind Swaminathan' },
      { type: 'ACCOUNT', value: 'SBIN0001234' },
      { type: 'PAN', value: 'AAAPD1234F' },
      { type: 'EMAIL', value: 'ananya.deshmukh@sbi-user.in' },
      { type: 'ADDRESS', value: '400020' }
    ]
  },
  {
    id: 'KYC-37',
    name: 'Income Tax Return Acknowledgement (ITR-V)',
    category: 'kyc',
    text: `INDIAN INCOME TAX DEPARTMENT - ITR-V ACKNOWLEDGEMENT\nAssessment Year: 2025-26\nName: Rameshwar Prasad Gupta\nPAN: AABPG1234D\nAadhaar: 9999 9999 0019\nFiling Status: Verified via EVC\nMobile OTP Dispatched: 98210 54321\nEmail ID: rameshwar.gupta@taxnet.gov.in\nRefund Bank A/C: 987654321098 IFSC SBIN0001234`,
    expectedEntities: [
      { type: 'PERSON', value: 'Rameshwar Prasad Gupta' },
      { type: 'PAN', value: 'AABPG1234D' },
      { type: 'AADHAAR', value: '9999 9999 0019' },
      { type: 'PHONE', value: '98210 54321' },
      { type: 'EMAIL', value: 'rameshwar.gupta@taxnet.gov.in' },
      { type: 'ACCOUNT', value: '987654321098' },
      { type: 'ACCOUNT', value: 'SBIN0001234' }
    ]
  },
  {
    id: 'KYC-38',
    name: 'Health Insurance Claim Settlement Voucher',
    category: 'banking',
    text: `STAR HEALTH INSURANCE SETTLEMENT VOUCHER\nClaimant: Priya Ramanathan\nPolicy Number: STAR-IND-881920\nHospital Bill Paid: Rs 1,12,000\nBank Transfer to A/C: 002101567890\nBank IFSC: ICIC0000002\nClaimant PAN: BLLPR4321K\nContact: +91 94440 98765\nDischarge Hospital PIN: 600002`,
    expectedEntities: [
      { type: 'PERSON', value: 'Priya Ramanathan' },
      { type: 'ACCOUNT', value: '002101567890' },
      { type: 'ACCOUNT', value: 'ICIC0000002' },
      { type: 'PAN', value: 'BLLPR4321K' },
      { type: 'PHONE', value: '+91 94440 98765' },
      { type: 'ADDRESS', value: '600002' }
    ]
  },
  {
    id: 'KYC-39',
    name: 'Credit Card Application with Voter ID Verification',
    category: 'kyc',
    text: `SBI CARD ONLINE APPLICATION\nApplicant: Suresh Babu\nVoter ID (EPIC): WBF1234567\nPAN: AAAPS9999K\nDOB: 05/10/1983\nMonthly Income: Rs 85,000\nSalary Bank A/C: 102030405060 IFSC BARB0KOLKAT\nRegistered Mobile: 98300 98300\nCommunication PIN: 700016`,
    expectedEntities: [
      { type: 'PERSON', value: 'Suresh Babu' },
      { type: 'VOTER_ID', value: 'WBF1234567' },
      { type: 'PAN', value: 'AAAPS9999K' },
      { type: 'DOB', value: '05/10/1983' },
      { type: 'ACCOUNT', value: '102030405060' },
      { type: 'ACCOUNT', value: 'BARB0KOLKAT' },
      { type: 'PHONE', value: '98300 98300' },
      { type: 'ADDRESS', value: '700016' }
    ]
  },
  {
    id: 'KYC-40',
    name: 'RTO Vehicle Hypothecation Clearance Certificate',
    category: 'banking',
    text: `REGIONAL TRANSPORT OFFICE - NOC HYPOTHECATION REMOVAL\nVehicle Reg No: KA 05 MH 9999\nEngine Number: ENG98712345\nOwner Name: Aniruddh Sengupta\nFinancier: Kotak Mahindra Prime Ltd\nLoan Account Settled: 12345678901234\nOwner Contact: 98111 88990\nRTO Jurisdiction: Jayanagar, Bengaluru PIN 560011`,
    expectedEntities: [
      { type: 'VEHICLE', value: 'KA 05 MH 9999' },
      { type: 'PERSON', value: 'Aniruddh Sengupta' },
      { type: 'ACCOUNT', value: '12345678901234' },
      { type: 'PHONE', value: '98111 88990' },
      { type: 'ADDRESS', value: '560011' }
    ]
  }
];

export function runBenchmark(dataset: GroundTruthDocument[] = (process.argv.includes('--docs-40') ? BENCHMARK_DATASET_40 : BENCHMARK_DATASET_110)) {
  const docCount = dataset.length;
  console.log('===============================================================');
  console.log(`   TANDEM GUARD DEV BENCHMARK (${docCount} DOCS)`);
  console.log('===============================================================\n');

  const statsByType: Record<string, { tp: number; fp: number; fn: number }> = {};
  const hardCaseStats = { total: 0, caught: 0 };
  const negativeCases = { total: 0, falsePositives: 0 };
  const failures: { docId: string; docName: string; type: string; expected: string; reason: string }[] = [];

  for (const doc of dataset) {
    // 1. Run deterministic Layer A detectors
    const detected = runDeterministicDetectors(doc.text);

    // 2. Evaluate expected entities (Recall & TP)
    for (const exp of doc.expectedEntities) {
      if (!statsByType[exp.type]) {
        statsByType[exp.type] = { tp: 0, fp: 0, fn: 0 };
      }

      if (exp.isHardCase) hardCaseStats.total++;

      // Check if any detected entity matches expected value or normalized value
      const match = detected.find(d => {
        const dClean = d.value.replace(/[\s\-]/g, '').toLowerCase();
        const expClean = exp.value.replace(/[\s\-]/g, '').toLowerCase();
        return (d.type === exp.type || (exp.type === 'ACCOUNT' && d.type === 'UPI')) &&
          (dClean === expClean || dClean.includes(expClean) || expClean.includes(dClean));
      });

      if (match) {
        statsByType[exp.type].tp++;
        if (exp.isHardCase) hardCaseStats.caught++;
      } else {
        statsByType[exp.type].fn++;
        failures.push({
          docId: doc.id,
          docName: doc.name,
          type: exp.type,
          expected: exp.value,
          reason: 'Entity not detected by deterministic pass (on-device NER not yet measured on these cases)'
        });
      }
    }

    // 3. Evaluate false positives (FP)
    for (const det of detected) {
      if (!statsByType[det.type]) {
        statsByType[det.type] = { tp: 0, fp: 0, fn: 0 };
      }

      const isExpected = doc.expectedEntities.some(exp => {
        const dClean = det.value.replace(/[\s\-]/g, '').toLowerCase();
        const expClean = exp.value.replace(/[\s\-]/g, '').toLowerCase();
        return (det.type === exp.type || (exp.type === 'ACCOUNT' && det.type === 'UPI')) &&
          (dClean === expClean || dClean.includes(expClean) || expClean.includes(dClean));
      });

      if (!isExpected) {
        // Check if it's an explicit negative example (like order ID, IP, or date)
        if (doc.negativeExamples?.some(neg => det.value.includes(neg))) {
          negativeCases.falsePositives++;
        }
        statsByType[det.type].fp++;
      }
    }

    // Track total negative examples
    if (doc.negativeExamples) {
      negativeCases.total += doc.negativeExamples.length;
    }
  }

  // Display results
  console.log('-----------------------------------------------------------------------------------------');
  console.log(
    'ENTITY TYPE'.padEnd(14) +
    'PRECISION'.padEnd(12) +
    'RECALL'.padEnd(12) +
    'F1 SCORE'.padEnd(12) +
    'METRICS (TP / FP / FN)'
  );
  console.log('-----------------------------------------------------------------------------------------');

  let totalTP = 0;
  let totalFP = 0;
  let totalFN = 0;

  for (const [type, stat] of Object.entries(statsByType)) {
    const precision = (stat.tp + stat.fp) > 0 ? (stat.tp / (stat.tp + stat.fp)) * 100 : 100;
    const recall = (stat.tp + stat.fn) > 0 ? (stat.tp / (stat.tp + stat.fn)) * 100 : 100;
    const f1 = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    totalTP += stat.tp;
    totalFP += stat.fp;
    totalFN += stat.fn;

    console.log(
      type.padEnd(14) +
      `${precision.toFixed(1)}%`.padEnd(12) +
      `${recall.toFixed(1)}%`.padEnd(12) +
      `${f1.toFixed(1)}%`.padEnd(12) +
      `(TP: ${stat.tp}, FP: ${stat.fp}, FN: ${stat.fn})`
    );
  }

  const overallPrecision = (totalTP + totalFP) > 0 ? (totalTP / (totalTP + totalFP)) * 100 : 100;
  const overallRecall = (totalTP + totalFN) > 0 ? (totalTP / (totalTP + totalFN)) * 100 : 100;
  const overallF1 = (overallPrecision + overallRecall) > 0 ? (2 * overallPrecision * overallRecall) / (overallPrecision + overallRecall) : 0;

  console.log('-----------------------------------------------------------------------------------------');
  console.log(`TOTAL EVALUATED DOCUMENTS : ${docCount}`);
  console.log(`OVERALL PRECISION         : ${overallPrecision.toFixed(1)}%`);
  console.log(`OVERALL RECALL            : ${overallRecall.toFixed(1)}%`);
  console.log(`OVERALL F1 SCORE          : ${overallF1.toFixed(1)}%`);
  console.log(`HARD-CASE RECALL          : ${((hardCaseStats.caught / hardCaseStats.total) * 100).toFixed(1)}% (${hardCaseStats.caught}/${hardCaseStats.total} difficult edge cases identified)`);
  console.log(`NEAR-MISS RESISTANCE      : ${(((negativeCases.total - negativeCases.falsePositives) / negativeCases.total) * 100).toFixed(1)}% (Order IDs, IPs, and dates successfully ignored)`);
  console.log('=========================================================================================\n');

  if (failures.length > 0) {
    console.log('--- HONEST LIMITATIONS & FAILURE ANALYSIS ---');
    console.log(`Detected ${failures.length} edge-case misses in deterministic-only mode (on-device NER impact not yet measured):`);
    for (const f of failures.slice(0, 5)) {
      console.log(`  - [${f.docId}] ${f.docName}: ${f.type} "${f.expected}" -> ${f.reason}`);
    }
    if (failures.length > 5) {
      console.log(`  ... and ${failures.length - 5} more documented in docs/LIMITATIONS.md`);
    }
    console.log('---------------------------------------------\n');
  }

  return {
    documentsTested: dataset.length,
    overallPrecision,
    overallRecall,
    overallF1,
    failures
  };
}

import { fileURLToPath } from 'node:url';
import path from 'node:path';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runBenchmark();
}

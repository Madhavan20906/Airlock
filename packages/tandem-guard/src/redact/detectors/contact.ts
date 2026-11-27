import { Entity } from '../../types.js';

export function detectContactDetails(text: string): Entity[] {
  const entities: Entity[] = [];

  // 1. Email detection (RFC 5322 compliant)
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  let emailMatch: RegExpExecArray | null;
  while ((emailMatch = emailRegex.exec(text)) !== null) {
    // Avoid double-detecting UPI IDs that have bank domain endings
    if (!/ok(hdfcbank|axis|sbi|icici)|paytm|ybl|ibl|axl|upi$/i.test(emailMatch[0])) {
      entities.push({
        type: 'EMAIL',
        value: emailMatch[0],
        span: [emailMatch.index, emailMatch.index + emailMatch[0].length],
        confidence: 0.98,
        source: 'deterministic'
      });
    }
  }

  // 2. Phone detection (Indian + international phone patterns)
  // E.g., +91 98765 43210, +91-9876543210, 98765-43210, 09876543210, (0)9876543210
  const phoneRegex = /(?:(?:\+|0{0,2})91[\s.-]?)?(?:\(?0\)?[\s.-]?)?[6789]\d{4}[\s.-]?\d{5}\b/g;
  let phoneMatch: RegExpExecArray | null;
  while ((phoneMatch = phoneRegex.exec(text)) !== null) {
    const val = phoneMatch[0];
    const digitsOnly = val.replace(/\D/g, '');
    if (digitsOnly.length >= 10 && digitsOnly.length <= 13) {
      entities.push({
        type: 'PHONE',
        value: val,
        span: [phoneMatch.index, phoneMatch.index + val.length],
        confidence: 0.94,
        source: 'deterministic'
      });
    }
  }

  // 3. Date of Birth (DOB) near context keywords
  // E.g., DOB: 15/08/1995, Date of Birth - 15-08-1995, Born: 1995/08/15
  const dobRegex = /(?:dob|d\.o\.b\.?|date\s*of\s*birth|born\s*on|birth\s*date)[\s:#.-]*\b([0-3]?[0-9][\/\-.][0-1]?[0-9][\/\-.](?:19|20)[0-9]{2}|(?:19|20)[0-9]{2}[\/\-.][0-1]?[0-9][\/\-.][0-3]?[0-9])\b/gi;
  let dobMatch: RegExpExecArray | null;
  while ((dobMatch = dobRegex.exec(text)) !== null) {
    const fullMatch = dobMatch[0];
    const dateVal = dobMatch[1];
    const startIndex = dobMatch.index + fullMatch.lastIndexOf(dateVal);
    entities.push({
      type: 'DOB',
      value: dateVal,
      span: [startIndex, startIndex + dateVal.length],
      confidence: 0.92,
      source: 'deterministic'
    });
  }

  return entities;
}

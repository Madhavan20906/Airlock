/** Synthetic seed notes. Fictional people and organisations; identifiers are synthetic (not real). */
export interface Note { id: string; title: string; body: string; updated: number; seed?: boolean }

export const SEEDS: Note[] = [
  {
    id: 'seed-tax', seed: true, updated: 0, title: 'Tax filing checklist (FY 2025-26)',
    body: `Freelance income this year: INR 9,40,000 from three clients. Advance tax paid: INR 62,000 in two instalments.
PAN BQKPS4821L. Aadhaar 4712 0938 5618 (linked).
Still need: Form 16A from Bluepeak Logistics, rent receipts for 12 months, and the 80C proof for the PPF deposit of INR 1,50,000.
Deadline to file is 31 July. Book a call with the CA, Ishita Bose, before 15 July.`
  },
  {
    id: 'seed-meeting', seed: true, updated: 0, title: 'Design review notes',
    body: `Design review for the Kaveri Textiles storefront, Tuesday.
Attendees: Arjun, Kavya, Rohan.
Decisions: move checkout to a single page; drop the guest wishlist for now; keep the size guide.
Open questions: who owns the new product photos? Do we need Tamil and Hindi copy at launch?
Actions: Kavya to send revised mock-ups by Friday. Rohan to check payment provider limits. Arjun to draft the launch email by 3 December.
Next review in two weeks.`
  },
  {
    id: 'seed-invoice', seed: true, updated: 0, title: 'Invoice to Nilgiri Design Studio',
    body: `Invoice INV-2048 for Nilgiri Design Studio, dated 20 November 2026.
Logo refresh and brand guide: INR 48,250. GST 18%.
Pay to account 50100488217763, IFSC KRSB0004417, or UPI meera.iyer@okdemo.
Due within 15 days. Contact Meera Iyer, 98200 45137.`
  },
  {
    id: 'seed-hinglish', seed: true, updated: 0, title: 'Kal ka plan (Hinglish)',
    body: `Kal subah 9 baje gym, phir 11 baje client call with Dev. Lunch ke baad report ka draft finish karna hai, 12 pages.
Shaam ko market se 2 kg tamatar aur doodh lana. Raat ko 30 minute Tamil practice.`
  },
  {
    id: 'seed-clinic', seed: true, updated: 0, title: 'Clinic visit summary (synthetic)',
    body: `Visit on 18 November at Lotus Lane Clinics. Patient: Farhan Siddiqui, DOB 04/09/1990, phone 91766 04228.
Complaint: seasonal cough for 6 days, no fever. Advice: steam twice a day, plenty of fluids, follow up in 7 days if not better.
This is a synthetic example note, not medical advice.`
  }
];

export type GlossaryEntry = {
  term: string;
  pattern: RegExp;
  plain: string;
};

// General explanations only; they are NOT policy terms. A definition inside the policy always takes priority.
export const GLOSSARY: GlossaryEntry[] = [
  { term: "Sum insured", pattern: /sum insured/i, plain: "The maximum amount the insurer will pay in total for covered claims in a policy year." },
  { term: "Sum assured", pattern: /sum assured/i, plain: "The fixed amount a life policy promises to pay on death or maturity." },
  { term: "IDV (insured declared value)", pattern: /\bidv\b|insured declared value/i, plain: "The current market value of your vehicle as agreed with the insurer. It is the most you can get if the vehicle is stolen or totally lost." },
  { term: "Premium", pattern: /\bpremium\b/i, plain: "The price you pay for the policy, usually yearly or monthly." },
  { term: "Deductible", pattern: /\bdeductible\b|compulsory excess|voluntary excess/i, plain: "A fixed amount of each claim that you pay yourself before the insurer pays the rest." },
  { term: "Co-payment", pattern: /co-?pay(?:ment)?/i, plain: "A percentage of every claim that you pay yourself, even when the claim is accepted." },
  { term: "Waiting period", pattern: /waiting period/i, plain: "A time after the policy starts during which claims for certain conditions are not paid." },
  { term: "Pre-existing disease", pattern: /pre-?existing/i, plain: "A health condition you already had (or that was diagnosed) before the policy started. These are usually covered only after a waiting period." },
  { term: "Sub-limit", pattern: /sub-?limit/i, plain: "A cap on what the insurer pays for one item (such as room rent) that is lower than the overall sum insured." },
  { term: "Room rent limit", pattern: /room rent/i, plain: "A daily cap on hospital room charges. Choosing a costlier room can reduce other payouts too if the policy applies proportionate deduction." },
  { term: "Proportionate deduction", pattern: /proportionate(?:ly)? (?:deduct|reduc)|pro[- ]rata/i, plain: "If you pick a room costing more than the cap, other bills can be reduced by the same proportion, not only the room charge." },
  { term: "Cashless", pattern: /cashless/i, plain: "The hospital bills the insurer directly (usually after pre-approval), so you do not pay upfront except for non-covered items." },
  { term: "Reimbursement", pattern: /reimbursement/i, plain: "You pay the hospital first and then claim the money back from the insurer with documents." },
  { term: "TPA (third-party administrator)", pattern: /\btpa\b|third party administrator/i, plain: "A company that handles claim paperwork on behalf of the insurer." },
  { term: "Network hospital", pattern: /network hospital/i, plain: "A hospital that has an agreement with the insurer, where cashless treatment is normally available." },
  { term: "Day care procedure", pattern: /day care/i, plain: "A treatment or surgery that needs less than 24 hours in hospital." },
  { term: "Pre-hospitalisation", pattern: /pre-?hospitali[sz]ation/i, plain: "Medical costs in a set number of days before you are admitted that relate to the same illness." },
  { term: "Post-hospitalisation", pattern: /post-?hospitali[sz]ation/i, plain: "Medical costs in a set number of days after discharge that relate to the same illness." },
  { term: "AYUSH", pattern: /ayush/i, plain: "Ayurveda, Yoga, Unani, Siddha and Homeopathy treatments." },
  { term: "Domiciliary treatment", pattern: /domiciliary/i, plain: "Medical treatment taken at home because you cannot be moved to a hospital." },
  { term: "Grace period", pattern: /grace period/i, plain: "Extra days after the due date to pay the premium. Cover is often not in force during these days." },
  { term: "Free-look period", pattern: /free[- ]look/i, plain: "A short window after you receive the policy in which you can cancel it and get most of your premium back." },
  { term: "Lapse", pattern: /\blapse[sd]?\b/i, plain: "When a policy stops because the premium was not paid in time. Claims are normally not paid while it is lapsed." },
  { term: "Revival", pattern: /revival|revive/i, plain: "Restarting a lapsed policy, usually by paying the dues and sometimes proving good health again." },
  { term: "No-claim bonus (NCB)", pattern: /no[- ]claim bonus|\bncb\b|cumulative bonus/i, plain: "A reward for a claim-free year: extra cover or a premium discount at renewal." },
  { term: "Zero depreciation", pattern: /zero depreciation|nil depreciation/i, plain: "A motor add-on that stops the insurer from subtracting depreciation on replaced parts." },
  { term: "Own damage", pattern: /own damage/i, plain: "The part of a motor policy that pays for damage to your own vehicle." },
  { term: "Third-party liability", pattern: /third[- ]party liability/i, plain: "Cover for harm or damage you cause to other people or their property." },
  { term: "Hypothecation", pattern: /hypothecation/i, plain: "A lender holds a claim on your vehicle until the loan is repaid." },
  { term: "Endorsement", pattern: /endorsement/i, plain: "A written change added to the policy after it is issued." },
  { term: "Rider", pattern: /\brider\b/i, plain: "An optional extra benefit added to a base life policy for an extra premium." },
  { term: "Nominee", pattern: /nominee/i, plain: "The person you name to receive the benefit if you die." },
  { term: "Surrender value", pattern: /surrender value/i, plain: "The amount you get if you end a savings-type life policy early." },
  { term: "Maturity benefit", pattern: /maturity benefit/i, plain: "The amount paid when a life policy reaches the end of its term." },
  { term: "Paid-up", pattern: /paid-?up/i, plain: "A policy kept alive with reduced benefits after you stop paying premiums." },
  { term: "Exclusion", pattern: /\bexclusions?\b/i, plain: "Something the policy specifically does not cover." },
  { term: "Indemnity", pattern: /indemnif|indemnity/i, plain: "Paying you back for an actual loss, up to the policy limits, rather than paying a fixed amount." },
  { term: "Subrogation", pattern: /subrogation/i, plain: "After paying your claim, the insurer can recover the money from whoever caused the loss." },
  { term: "Consequential loss", pattern: /consequential loss/i, plain: "Indirect losses that follow an event (for example lost income), which are commonly excluded." },
  { term: "Non-disclosure / material fact", pattern: /non-?disclosure|material fact|misrepresentation/i, plain: "Hiding or misstating something important when buying the policy. Insurers can use this to reject claims or cancel the policy." },
  { term: "Loading", pattern: /\bloading\b/i, plain: "An extra amount added to your premium because of higher risk, such as a health condition." },
  { term: "Underwriting", pattern: /underwriting/i, plain: "The insurer's assessment of your risk before and when deciding the terms and price." },
  { term: "Portability", pattern: /portability/i, plain: "Moving your health policy to another insurer while keeping credit for time already served." },
];

export function findGlossaryTerms(text: string, limit = 12): GlossaryEntry[] {
  const found: Array<{ entry: GlossaryEntry; index: number }> = [];
  for (const entry of GLOSSARY) {
    const match = entry.pattern.exec(text);
    if (match) {
      found.push({ entry, index: match.index });
    }
  }

  return found.sort((a, b) => a.index - b.index).slice(0, limit).map((item) => item.entry);
}

export function lookupGlossary(query: string): GlossaryEntry | null {
  const trimmed = query.trim();
  if (!trimmed) {
    return null;
  }

  return GLOSSARY.find((entry) => entry.pattern.test(trimmed) || entry.term.toLowerCase() === trimmed.toLowerCase()) ?? null;
}

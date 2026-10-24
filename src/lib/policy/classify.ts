import type { Classification, PageText, PolicyType } from "@/lib/policy/types";

type Lexicon = Record<Exclude<PolicyType, "other">, Array<[string, number]>>;

// [term, weight]. Weights favour terms that are distinctive to one product line.
const LEXICON: Lexicon = {
  health: [
    ["hospitali[sz]ation", 3],
    ["in-?patient", 2],
    ["room rent", 3],
    ["pre-?existing (?:disease|condition)s?", 3],
    ["cashless", 2],
    ["day care (?:procedure|treatment)s?", 3],
    ["ayush", 3],
    ["third party administrator|\\btpa\\b", 2],
    ["sum insured", 2],
    ["medical expenses", 2],
    ["mediclaim|health insurance", 3],
    ["ambulance", 1],
    ["icu|intensive care", 1],
    ["domiciliary", 2],
  ],
  life: [
    ["sum assured", 4],
    ["death benefit", 4],
    ["life assured", 4],
    ["maturity (?:benefit|date)", 3],
    ["surrender value", 3],
    ["nominee", 2],
    ["term (?:plan|assurance)", 3],
    ["annuity", 2],
    ["policyholder'?s? death", 3],
    ["life insurance|life cover", 3],
    ["suicide", 2],
    ["rider", 1],
    ["paid-?up", 2],
  ],
  motor: [
    ["insured declared value|\\bidv\\b", 4],
    ["own damage", 4],
    ["third[- ]party liability", 3],
    ["registration (?:number|no)", 3],
    ["chassis", 3],
    ["engine (?:number|no)", 3],
    ["zero depreciation|nil depreciation", 3],
    ["no[- ]claim bonus|\\bncb\\b", 2],
    ["vehicle|motor|motorcycle|two[- ]wheeler|private car", 2],
    ["hypothecation", 2],
    ["comprehensive (?:policy|package|cover)", 2],
    ["compulsory personal accident", 2],
  ],
  travel: [
    ["trip cancellation", 4],
    ["baggage", 3],
    ["passport", 3],
    ["journey|itinerary", 2],
    ["travel insurance", 4],
    ["emergency (?:medical )?evacuation", 3],
    ["flight delay", 3],
  ],
  home: [
    ["fire and allied perils|standard fire", 4],
    ["burglary|house[- ]breaking", 3],
    ["householder|home insurance|homeowner", 4],
    ["building and contents|contents insurance", 3],
    ["structure of the (?:building|dwelling)", 2],
  ],
  personal_accident: [
    ["accidental death", 4],
    ["permanent total disablement|\\bptd\\b", 4],
    ["permanent partial disablement|\\bppd\\b", 3],
    ["temporary total disablement|\\bttd\\b", 3],
    ["personal accident", 4],
  ],
};

const GENERAL_INSURANCE_TERMS = [
  /\bpolic(?:y|yholder)\b/i,
  /\binsur(?:er|ed|ance)\b/i,
  /\bpremium\b/i,
  /\bclaim\b/i,
  /\bexclusions?\b/i,
  /\bsum (?:insured|assured)\b/i,
];

const MIN_SCORE = 8;
const AMBIGUITY_RATIO = 0.75;

export function classifyPolicy(pages: PageText[]): Classification {
  const scores = new Map<PolicyType, number>();
  const signals: Classification["signals"] = [];
  const joined = pages.map((page) => page.text).join("\n");

  for (const [type, entries] of Object.entries(LEXICON) as Array<[Exclude<PolicyType, "other">, Array<[string, number]>]>) {
    let score = 0;

    for (const [source, weight] of entries) {
      const pattern = new RegExp(source, "gi");
      let hits = 0;
      let firstPage: number | null = null;

      for (const page of pages) {
        const found = page.text.match(pattern)?.length ?? 0;
        if (found > 0 && firstPage === null) {
          firstPage = page.page;
        }
        hits += found;
      }

      if (hits > 0) {
        // Diminishing returns so repetition cannot drown out distinctive terms.
        score += weight * Math.min(hits, 3);
        signals.push({ term: source.replace(/\\b|\(\?:|\)|\\/g, "").split("|")[0], page: firstPage ?? 1, type });
      }
    }

    scores.set(type, score);
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [topType, topScore] = ranked[0] ?? ["other" as PolicyType, 0];
  const [runnerType, runnerScore] = ranked[1] ?? [null, 0];

  const generalHits = GENERAL_INSURANCE_TERMS.filter((pattern) => pattern.test(joined)).length;
  const isInsurancePolicy = generalHits >= 3 || topScore >= MIN_SCORE;

  if (topScore < MIN_SCORE) {
    return {
      type: "other",
      isInsurancePolicy,
      confidence: isInsurancePolicy ? 0.3 : 0.1,
      ambiguous: false,
      runnerUp: null,
      signals: signals.slice(0, 8),
    };
  }

  const ambiguous = runnerScore >= topScore * AMBIGUITY_RATIO;
  const confidence = Math.round((topScore / (topScore + runnerScore + 4)) * 100) / 100;

  return {
    type: topType,
    isInsurancePolicy,
    confidence,
    ambiguous,
    runnerUp: runnerScore > 0 ? (runnerType as PolicyType) : null,
    signals: signals.filter((signal) => signal.type === topType).slice(0, 8),
  };
}

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b([a-z])/g, (letter) => letter.toUpperCase())
    .replace(/\bLtd\b/g, "Ltd");
}

export function detectInsurer(pages: PageText[]): string | null {
  for (const page of pages.slice(0, 2)) {
    for (const raw of page.text.split("\n").slice(0, 10)) {
      const line = raw.trim();
      const isCompanyName =
        line.length >= 8 &&
        line.length <= 120 &&
        /\b(insurance|assurance)\b/i.test(line) &&
        /\b(limited|ltd\.?|company|co\.?|corporation|inc\.?|plc)\b/i.test(line) &&
        !/\b(policy|plan|schedule|certificate)\b/i.test(line);

      if (isCompanyName) {
        return line === line.toUpperCase() ? toTitleCase(line) : line;
      }
    }
  }

  return null;
}

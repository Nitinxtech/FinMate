import { clauseLabel } from "@/lib/policy/clauses";
import type { Clause, DocumentMeta } from "@/lib/policy/types";

export type Passage = {
  id: string;
  documentId: string;
  documentTitle: string;
  clauseIndex: number;
  clauseRef: string | null;
  label: string;
  page: number;
  text: string;
};

export type ScoredPassage = Passage & { score: number; matchedTerms: string[] };

const STOPWORDS = new Set(
  "a an the and or of to in on for is are be was were it this that these those my our your their can could should would will shall do does did i we you they what which who when where how if as at by with from about into than then there not no any all long soon much many tell please explain mean means meaning have has had get got need want like also some very really just still me us him her his back".split(" "),
);

const SYNONYMS: Record<string, string[]> = {
  cover: ["coverage", "covered", "pay", "payable", "indemnify", "benefit"],
  exclude: ["exclusion", "excluded", "not covered", "not liable"],
  wait: ["waiting", "period", "initial"],
  copay: ["co-payment", "copayment", "co-pay", "bear"],
  claim: ["claims", "intimate", "settlement", "reimbursement", "cashless"],
  inform: ["intimate", "notify", "notification", "notice", "notified"],
  notify: ["intimate", "inform", "notification", "notice"],
  cancel: ["cancellation", "terminate", "refund", "free look"],
  renew: ["renewal", "grace", "lapse"],
  premium: ["premiums", "payable"],
  deduct: ["deductible", "excess"],
  limit: ["sub-limit", "capped", "restricted", "maximum"],
  hospital: ["hospitalisation", "hospitalization", "in-patient", "admission"],
  room: ["room rent", "icu"],
  accident: ["accidental", "injury"],
  refund: ["cancellation", "free look", "premium"],
  money: ["refund", "premium", "amount"],
  stay: ["admission", "hospitalisation", "admitted", "in-patient"],
  admitted: ["admission", "hospitalisation", "in-patient"],
  condition: ["disease", "illness", "ailment", "diseases"],
  disease: ["condition", "illness", "ailment", "conditions"],
  illness: ["condition", "disease", "ailment"],
  insurer: ["company"],
};

export function stem(token: string): string {
  let word = token.toLowerCase();
  if (word.length > 5 && word.endsWith("ies")) {
    word = `${word.slice(0, -3)}y`;
  } else if (word.length > 5 && word.endsWith("ing")) {
    word = word.slice(0, -3);
  } else if (word.length > 4 && word.endsWith("ed")) {
    word = word.slice(0, -2);
  } else if (word.length > 4 && word.endsWith("es")) {
    word = word.slice(0, -2);
  } else if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) {
    word = word.slice(0, -1);
  }
  return word;
}

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? [])
    .filter((token) => !STOPWORDS.has(token) && token.length > 1)
    .map(stem);
}

function expansionsOf(token: string): string[] {
  const expanded = new Set([token]);
  for (const [root, extras] of Object.entries(SYNONYMS)) {
    if (token === stem(root) || extras.some((extra) => stem(extra) === token)) {
      expanded.add(stem(root));
      extras.forEach((extra) => tokenize(extra).forEach((piece) => expanded.add(piece)));
    }
  }
  return [...expanded];
}

function expandQuery(tokens: string[]): string[] {
  return [...new Set(tokens.flatMap(expansionsOf))];
}

export function buildPassages(clauses: Clause[], doc: DocumentMeta): Passage[] {
  return clauses
    .filter((clause) => clause.text.trim().length > 0)
    .map((clause) => ({
      id: `${doc.id}:${clause.index}`,
      documentId: doc.id,
      documentTitle: doc.title,
      clauseIndex: clause.index,
      clauseRef: clause.ref,
      label: clauseLabel(clause),
      page: clause.page,
      text: clause.text,
    }));
}

type Reference = { clauseRef: string | null; page: number | null };

function parseReference(question: string): Reference {
  const clause = /\b(?:clause|section|article|para(?:graph)?)\s+(\d{1,2}(?:\.\d{1,3})*(?:\([a-z]\))?)/i.exec(question);
  const page = /\bpage\s+(\d{1,3})\b/i.exec(question);
  return { clauseRef: clause ? clause[1].toLowerCase() : null, page: page ? Number(page[1]) : null };
}

export type RetrievalResult = {
  passages: ScoredPassage[];
  confident: boolean;
  queryTerms: string[];
};

export function retrievePassages(question: string, passages: Passage[], topK = 6): RetrievalResult {
  const baseTokens = tokenize(question);
  const queryTerms = expandQuery(baseTokens);
  const reference = parseReference(question);

  if (passages.length === 0 || (queryTerms.length === 0 && !reference.clauseRef && !reference.page)) {
    return { passages: [], confident: false, queryTerms };
  }

  const documents = passages.map((passage) => ({ passage, tokens: tokenize(`${passage.label} ${passage.text}`) }));
  const averageLength = documents.reduce((sum, item) => sum + item.tokens.length, 0) / documents.length || 1;
  const documentFrequency = new Map<string, number>();
  for (const { tokens } of documents) {
    for (const term of new Set(tokens)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  const k1 = 1.4;
  const b = 0.75;
  const baseSet = new Set(baseTokens);

  const scored: ScoredPassage[] = documents.map(({ passage, tokens }) => {
    const counts = new Map<string, number>();
    tokens.forEach((token) => counts.set(token, (counts.get(token) ?? 0) + 1));

    let score = 0;
    const matched: string[] = [];
    for (const term of queryTerms) {
      const frequency = counts.get(term) ?? 0;
      if (frequency === 0) {
        continue;
      }

      const idf = Math.log(1 + (documents.length - (documentFrequency.get(term) ?? 0) + 0.5) / ((documentFrequency.get(term) ?? 0) + 0.5));
      const weight = baseSet.has(term) ? 1 : 0.45;
      score += weight * idf * ((frequency * (k1 + 1)) / (frequency + k1 * (1 - b + (b * tokens.length) / averageLength)));
      matched.push(term);
    }

    if (reference.clauseRef && passage.clauseRef?.toLowerCase() === reference.clauseRef) {
      score += 8;
    }
    if (reference.page !== null && passage.page === reference.page) {
      score += reference.clauseRef ? 1 : 4;
    }

    return { ...passage, score, matchedTerms: matched };
  });

  const ranked = scored.filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, topK);
  const best = ranked[0];

  // Unmatched rare words ("pet", "dog") must drag confidence down; common words ("policy") barely count.
  const idfOf = (term: string) => {
    const frequency = documentFrequency.get(term) ?? 0;
    return Math.log(1 + (documents.length - frequency + 0.5) / (frequency + 0.5));
  };
  const matchedAll = new Set(best?.matchedTerms ?? []);
  // A question word counts as matched if it, or one of its synonyms, appears in the best passage.
  const isMatched = (term: string) => expansionsOf(term).some((candidate) => matchedAll.has(candidate));
  const totalWeight = [...baseSet].reduce((sum, term) => sum + idfOf(term), 0);
  const matchedWeight = [...baseSet].filter(isMatched).reduce((sum, term) => sum + idfOf(term), 0);
  const weightedCoverage = totalWeight > 0 ? matchedWeight / totalWeight : 0;
  const pointed = Boolean(reference.clauseRef || reference.page);
  const confident = Boolean(best) && (pointed || (best.score >= 2.2 && weightedCoverage >= 0.5));

  return { passages: ranked, confident, queryTerms };
}

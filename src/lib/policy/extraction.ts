import { CONDITION_LEXICON, COST_HEADS, HEDGE_PATTERNS, conditionLabel, matchConditions } from "@/lib/policy/lexicon";
import { clauseLabel } from "@/lib/policy/clauses";
import { detectInsurer } from "@/lib/policy/classify";
import { findDuration, findMoney, findPercent, formatMoney } from "@/lib/policy/money";
import { normalizeForMatch, quoteAppearsIn } from "@/lib/policy/sanitize";
import {
  FACT_CATEGORIES,
  FACT_CATEGORY_LABELS,
  type Citation,
  type Clause,
  type DocumentMeta,
  type Extraction,
  type Fact,
  type FactCategory,
  type Issue,
  type PageText,
} from "@/lib/policy/types";

export const EXTRACTION_VERSION = 1;

const MAX_QUOTE_CHARS = 420;
const CATEGORY_CAPS: Record<FactCategory, number> = {
  sum_insured: 12,
  coverage: 40,
  exclusion: 80,
  waiting_period: 30,
  sub_limit: 30,
  deductible: 15,
  co_payment: 15,
  premium: 15,
  renewal: 20,
  claim_procedure: 25,
  cancellation: 15,
  definition: 60,
};

const ABBREVIATIONS = /\b(Rs|No|Nos|Ltd|Co|Inc|approx|i\.e|e\.g|etc|vs|Sr|Dr|Mr|Mrs|St|Sec|Cl|Art|Pvt)\./gi;

// Join PDF line-wraps (a long line continued in lowercase) but keep schedule rows, list items and tables apart.
function reflow(text: string): string {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  let result = "";

  lines.forEach((line, position) => {
    if (position === 0) {
      result = line;
      return;
    }

    const previous = lines[position - 1];
    const wrapped = !/[.;:!?]$/.test(previous) && previous.length >= 55;
    const continues = /^[a-z]/.test(line) || wrapped;
    const tableRow = line.includes(" | ") || previous.includes(" | ");
    result += continues && !tableRow ? ` ${line}` : `\n${line}`;
  });

  return result;
}

export function splitSentences(text: string): string[] {
  return reflow(text)
    .replace(ABBREVIATIONS, "$1\u0001")
    .split(/(?<=[.;!?])\s+(?=[A-Z0-9("'\u2018\u201C])|\n+/)
    .map((part) => part.replace(/\u0001/g, ".").trim())
    .filter((part) => part.length >= 12);
}

function hash32(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function describeMoney(amount: number, currency: string | null): string {
  return currency ? formatMoney(amount, currency) : amount.toLocaleString("en-IN");
}

type Ctx = { clause: Clause; sentence: string; doc: DocumentMeta };

function windowAround(sentence: string, index: number, width = 90): string {
  return sentence.slice(Math.max(0, index - width), Math.min(sentence.length, index + width));
}

// "accident" mostly appears as an exception ("unless necessitated by an accident"), so it only misleads as a qualifier.
function dropAccidentNoise(keys: string[]): string[] {
  return keys.length > 1 ? keys.filter((key) => key !== "accident") : keys;
}

function qualifiersNear(ctx: Ctx, index: number): string[] {
  const near = matchConditions(windowAround(ctx.sentence, index));
  if (near.length > 0) {
    return dropAccidentNoise(near);
  }

  const inSentence = matchConditions(ctx.sentence);
  return dropAccidentNoise(inSentence.length > 0 ? inSentence : matchConditions(ctx.clause.heading ?? ""));
}

function hedgesOf(sentence: string): string[] {
  return HEDGE_PATTERNS.filter((hedge) => hedge.pattern.test(sentence)).map((hedge) => hedge.label);
}

function citationOf(ctx: Ctx): Citation {
  const quote = ctx.sentence.length > MAX_QUOTE_CHARS ? ctx.sentence.slice(0, MAX_QUOTE_CHARS) : ctx.sentence;
  return {
    documentId: ctx.doc.id,
    documentTitle: ctx.doc.title,
    page: ctx.clause.page,
    clauseRef: ctx.clause.ref,
    quote,
  };
}

function makeFact(
  ctx: Ctx,
  category: FactCategory,
  label: string,
  extra: Partial<Pick<Fact, "value" | "amount" | "percent" | "days" | "currency" | "qualifiers">> = {},
): Fact {
  const citation = citationOf(ctx);
  return {
    id: `${category}-${citation.page}-${hash32(normalizeForMatch(citation.quote) + label)}`,
    category,
    label,
    value: extra.value ?? null,
    amount: extra.amount ?? null,
    percent: extra.percent ?? null,
    days: extra.days ?? null,
    currency: extra.currency ?? null,
    qualifiers: extra.qualifiers ?? [],
    hedges: hedgesOf(ctx.sentence),
    basis: "explicit",
    citation,
  };
}

function shortLabel(text: string, max = 90): string {
  const cleaned = text.replace(/\s+/g, " ").replace(/[:;.]+$/, "").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1).trim()}\u2026` : cleaned;
}

// "Pre-hospitalisation: Expenses incurred..." is better labelled by its short title.
function labelFor(heading: string | null, sentence: string): string {
  if (heading) {
    return shortLabel(heading);
  }

  const title = /^([A-Z][^:]{2,45}):\s+\S/.exec(sentence)?.[1];
  return shortLabel(title ?? sentence);
}

function conditionText(keys: string[]): string {
  return keys.length > 0 ? keys.map(conditionLabel).join(", ") : "general";
}

const DURATION_GLOBAL = /(\d{1,3})\s*(days?|months?|years?|yrs?)\b/gi;
const WAITING_CONTEXT =
  /waiting|(?:first|initial)\s+\d+\s*(?:days?|months?|years?)|(?:after|until|completion of|expiry of|lapse of)\s+(?:a\s+(?:continuous\s+)?period\s+of\s+)?\d+\s*(?:days?|months?|years?)|(?:excluded|not covered|not payable|no claims?)[^.]{0,80}\d+\s*(?:days?|months?|years?)/i;
const NOT_WAITING_CONTEXT = /free[- ]look|grace period|notify|notified|intimat|policy (?:term|period)|tenure|pre-?hospitali|post-?hospitali|before (?:the )?(?:date of )?(?:admission|hospitali)|after (?:the )?(?:date of )?discharge/i;

function detectWaiting(ctx: Ctx): Fact[] {
  if (!WAITING_CONTEXT.test(ctx.sentence)) {
    return [];
  }

  const facts: Fact[] = [];
  for (const match of ctx.sentence.matchAll(DURATION_GLOBAL)) {
    const index = match.index ?? 0;
    if (NOT_WAITING_CONTEXT.test(windowAround(ctx.sentence, index, 50))) {
      continue;
    }

    const duration = findDuration(match[0]);
    if (!duration) {
      continue;
    }

    const qualifiers = qualifiersNear(ctx, index);
    facts.push(
      makeFact(ctx, "waiting_period", `Waiting period: ${conditionText(qualifiers)}`, {
        value: `${duration.value} ${duration.unit}${duration.value === 1 ? "" : "s"}`,
        days: duration.days,
        qualifiers,
      }),
    );
  }

  return facts;
}

function detectCoPayment(ctx: Ctx): Fact[] {
  const match = /co-?pay(?:ment)?|co-?insurance|(?:insured|policyholder|you)\s+(?:shall|will|must)\s+bear/i.exec(ctx.sentence);
  if (!match) {
    return [];
  }

  const percent = findPercent(ctx.sentence);
  const qualifiers = qualifiersNear(ctx, match.index);
  const ageGroup = /(?:above|over|aged?|beyond)\s*(\d{2})/i.exec(ctx.sentence)?.[0];
  const label = `Co-payment${ageGroup ? ` (${ageGroup.toLowerCase()})` : ""}`;

  return [
    makeFact(ctx, "co_payment", label, {
      value: percent !== null ? `${percent}%` : null,
      percent,
      qualifiers,
    }),
  ];
}

function detectDeductible(ctx: Ctx): Fact[] {
  const match =
    /compulsory (?:deductible|excess)|voluntary (?:deductible|excess)|\bdeductible\b|\bexcess (?:amount|payable|applicable|of (?:rs|inr|\u20B9|\$))/i.exec(
      ctx.sentence,
    );
  if (!match || /in excess of/i.test(ctx.sentence)) {
    return [];
  }

  const money = findMoney(ctx.sentence)[0]?.money ?? null;
  const percent = money ? null : findPercent(ctx.sentence);
  const kind = /voluntary/i.test(match[0]) ? "Voluntary deductible" : /compulsory/i.test(match[0]) ? "Compulsory deductible" : "Deductible";

  return [
    makeFact(ctx, "deductible", kind, {
      value: money ? describeMoney(money.amount, money.currency) : percent !== null ? `${percent}%` : null,
      amount: money?.amount ?? null,
      currency: money?.currency ?? null,
      percent,
      qualifiers: qualifiersNear(ctx, match.index),
    }),
  ];
}

const LIMIT_WORDS = /sub-?limit|limited to|capped (?:at|to)|restricted to|maximum (?:of|limit|amount)|not (?:to )?exceed|up to|per day|per claim|per illness|per annum|per policy year/i;

function detectSubLimit(ctx: Ctx): Fact[] {
  if (!LIMIT_WORDS.test(ctx.sentence)) {
    return [];
  }

  const facts: Fact[] = [];
  const seenHeads = new Set<string>();

  for (const head of COST_HEADS) {
    const headMatch = head.pattern.exec(ctx.sentence);
    if (!headMatch || seenHeads.has(head.key)) {
      continue;
    }

    // Read the figure that follows this head, so "room rent ... 1% ... ICU ... 2%" yields two limits.
    const after = ctx.sentence.slice(headMatch.index, headMatch.index + 130);
    const money = findMoney(after)[0]?.money ?? null;
    const percent = findPercent(after);
    if (!money && percent === null) {
      continue;
    }

    seenHeads.add(head.key);
    const usePercent = percent !== null && (!money || (after.search(/%|per\s*cent/i) < after.search(/\u20B9|rs\.?|inr|\$/i)));
    const percentOfBase = usePercent ? /of (?:the )?(?:basic )?(sum insured|sum assured|idv|insured declared value|claim amount|admissible amount)/i.exec(after)?.[1] : null;
    const per = /per (day|claim|illness|annum|year|policy year|event|eye|hospitali[sz]ation)/i.exec(after)?.[0];
    const value = usePercent
      ? `${percent}%${percentOfBase ? ` of ${percentOfBase.toLowerCase()}` : ""}${per ? ` ${per.toLowerCase()}` : ""}`
      : `${describeMoney(money!.amount, money!.currency)}${per ? ` ${per.toLowerCase()}` : ""}`;

    facts.push(
      makeFact(ctx, "sub_limit", `${head.label} limit`, {
        value,
        amount: usePercent ? null : (money?.amount ?? null),
        percent: usePercent ? percent : null,
        currency: usePercent ? null : (money?.currency ?? null),
        qualifiers: [head.key],
      }),
    );
  }

  return facts;
}

function detectSumInsured(ctx: Ctx): Fact[] {
  const match = /sum insured|sum assured|insured declared value|\bidv\b|limit of liability|coverage amount|basic cover/i.exec(ctx.sentence);
  if (!match) {
    return [];
  }

  const money = findMoney(ctx.sentence)[0]?.money ?? null;
  if (!money || /%\s*of\s*(?:the\s*)?(?:sum|idv|insured)/i.test(ctx.sentence)) {
    return [];
  }

  const kind = /idv|insured declared value/i.test(match[0]) ? "Insured declared value (IDV)" : /sum assured/i.test(match[0]) ? "Sum assured" : "Sum insured";
  return [
    makeFact(ctx, "sum_insured", kind, {
      value: describeMoney(money.amount, money.currency),
      amount: money.amount,
      currency: money.currency,
    }),
  ];
}

function detectPremium(ctx: Ctx): Fact[] {
  const match = /premium/i.exec(ctx.sentence);
  if (!match) {
    return [];
  }

  const money = findMoney(ctx.sentence)[0]?.money ?? null;
  if (!money) {
    return [];
  }

  const frequency = /(per annum|annual(?:ly)?|yearly|half-?yearly|quarterly|monthly|single premium|one[- ]time)/i.exec(ctx.sentence)?.[1];
  const gst = /gst|tax/i.test(ctx.sentence) ? " (includes taxes)" : "";
  return [
    makeFact(ctx, "premium", `Premium${frequency ? ` (${frequency.toLowerCase()})` : ""}`, {
      value: `${describeMoney(money.amount, money.currency)}${gst}`,
      amount: money.amount,
      currency: money.currency,
    }),
  ];
}

function detectRenewal(ctx: Ctx): Fact[] {
  const match = /renew|grace period|no[- ]claim bonus|cumulative bonus|\bncb\b|lapse|revival|lifelong/i.exec(ctx.sentence);
  if (!match) {
    return [];
  }

  const grace = /grace period[^.]{0,40}?(\d{1,3})\s*(days?|months?)/i.exec(ctx.sentence);
  if (grace) {
    const duration = findDuration(`${grace[1]} ${grace[2]}`);
    return [
      makeFact(ctx, "renewal", "Grace period", {
        value: duration ? `${duration.value} ${duration.unit}${duration.value === 1 ? "" : "s"}` : null,
        days: duration?.days ?? null,
      }),
    ];
  }

  const label = /no[- ]claim bonus|cumulative bonus|\bncb\b/i.test(match[0])
    ? "Bonus on renewal"
    : /lapse|revival/i.test(match[0])
      ? "Lapse and revival"
      : /lifelong|renewable for life|life-?long/i.test(ctx.sentence)
        ? "Lifelong renewal"
        : "Renewal";
  return [makeFact(ctx, "renewal", label, { value: null })];
}

function detectClaimProcedure(ctx: Ctx): Fact[] {
  const facts: Fact[] = [];
  const notify = /(?:intimat|notif|inform|report)\w*\b/i.exec(ctx.sentence);
  const notifyTiming = notify && /within|not later than|prior to|before|immediately|at least|in advance/i.test(ctx.sentence);

  if (notify && notifyTiming) {
    const duration = findDuration(ctx.sentence.slice(notify.index));
    facts.push(
      makeFact(ctx, "claim_procedure", "Claim notification", {
        value: duration ? `${duration.value} ${duration.unit}${duration.value === 1 ? "" : "s"}` : null,
        days: duration?.days ?? null,
      }),
    );
  }

  const notified = Boolean(notify && notifyTiming);
  if (/cashless/i.test(ctx.sentence) && !notified) {
    facts.push(makeFact(ctx, "claim_procedure", "Cashless claims"));
  }
  if (/reimbursement/i.test(ctx.sentence) && !notified) {
    facts.push(makeFact(ctx, "claim_procedure", "Reimbursement claims"));
  }
  if (/claim form|documents? (?:required|to be (?:submitted|furnished))|supporting documents|discharge summary|\bfir\b|police report/i.test(ctx.sentence) && !notified) {
    facts.push(makeFact(ctx, "claim_procedure", "Claim documents"));
  }
  if (/(?:settle|settlement|decid|decision)\w*[^.]{0,80}?(\d{1,3})\s*days/i.test(ctx.sentence) && !notified) {
    const days = /(\d{1,3})\s*days/i.exec(ctx.sentence);
    facts.push(
      makeFact(ctx, "claim_procedure", "Settlement timeline", {
        value: days ? `${days[1]} days` : null,
        days: days ? Number(days[1]) : null,
      }),
    );
  }

  return facts;
}

function detectCancellation(ctx: Ctx): Fact[] {
  const facts: Fact[] = [];

  const freeLook = /free[- ]look/i.test(ctx.sentence);
  if (freeLook) {
    const duration = findDuration(ctx.sentence);
    facts.push(
      makeFact(ctx, "cancellation", "Free-look period", {
        value: duration ? `${duration.value} ${duration.unit}${duration.value === 1 ? "" : "s"}` : null,
        days: duration?.days ?? null,
      }),
    );
  }

  if (!freeLook && /cancel|terminat|surrender|refund/i.test(ctx.sentence)) {
    const byInsurer = /(?:insurer|company|we)\b[^.]{0,50}(?:may|can|shall|reserve)[^.]{0,40}(?:cancel|terminat)/i.test(ctx.sentence);
    const byInsured = /(?:you|insured|policyholder|policy holder)\b[^.]{0,50}(?:may|can|wish|desire)[^.]{0,40}(?:cancel|terminat|surrender)/i.test(ctx.sentence);
    const label = byInsurer ? "Cancellation by insurer" : byInsured ? "Cancellation by policyholder" : /refund/i.test(ctx.sentence) ? "Refund on cancellation" : "Cancellation / termination";
    facts.push(makeFact(ctx, "cancellation", label));
  }

  return facts;
}

const NEGATIVE_COVER =
  /not covered|(?:shall|will|does|do) not (?:be )?(?:liable|payable|cover|pay|indemnify|reimburse)|is excluded|are excluded|excluded from|no (?:claim|benefit|payment) (?:shall be |will be )?(?:payable|admissible)|not (?:payable|admissible|eligible)|we (?:will|shall) not/i;
const POSITIVE_COVER =
  /(?:we|the (?:company|insurer)) (?:will|shall) (?:pay|cover|indemnify|reimburse|provide)|\b(?:is|are) covered|\bcovers\b|benefits? (?:payable|include|available)|coverage (?:includes|extends)|(?:will|shall) be (?:payable|reimbursed|covered)/i;

function detectDefinition(ctx: Ctx, inDefinitions: boolean): Fact[] {
  const match = /^["\u201C'\u2018]?([A-Z][A-Za-z\- /]{2,50}?)["\u201D'\u2019]?\s*(?:means|shall mean|refers to|is defined as)\s+([\s\S]{12,})$/.exec(ctx.sentence);
  if (!match && !inDefinitions) {
    return [];
  }

  if (!match) {
    return [];
  }

  return [makeFact(ctx, "definition", match[1].trim(), { value: shortLabel(match[2], 300) })];
}

export function extractFactsFromClauses(clauses: Clause[], doc: DocumentMeta): Fact[] {
  const collected: Fact[] = [];
  const seen = new Set<string>();

  for (const clause of clauses) {
    // A bare section title ("EXCLUSIONS", "RENEWAL AND CANCELLATION") is structure, not a policy term.
    const headingOnly = clause.heading !== null && clause.text === clause.heading;
    if (headingOnly && (clause.ref === null || /^[A-Za-z]/.test(clause.ref))) {
      continue;
    }

    const sectionText = `${clause.section ?? ""} ${clause.heading ?? ""}`;
    const inExclusions = /exclusion|not covered|what (?:we|is) (?:do not|not) cover|we (?:do not|will not) cover/i.test(sectionText);
    const inDefinitions = /definition|glossary|interpretation/i.test(sectionText);
    const sentences = splitSentences(clause.heading && !clause.text.includes(clause.heading) ? `${clause.heading}. ${clause.text}` : clause.text);

    sentences.forEach((rawSentence, position) => {
      const ctx: Ctx = { clause, sentence: rawSentence, doc };
      const next = sentences[position + 1];
      const isIntro = rawSentence.endsWith(":") && (next !== undefined || clause.text.endsWith(":"));

      const produced: Fact[] = [
        ...detectDefinition(ctx, inDefinitions),
        ...detectWaiting(ctx),
        ...detectCoPayment(ctx),
        ...detectDeductible(ctx),
        ...detectSubLimit(ctx),
        ...detectSumInsured(ctx),
        ...detectPremium(ctx),
        ...detectRenewal(ctx),
        ...detectClaimProcedure(ctx),
        ...detectCancellation(ctx),
      ];

      const hasWaiting = produced.some((fact) => fact.category === "waiting_period");
      const hasDefinition = produced.some((fact) => fact.category === "definition");

      if (!hasWaiting && !hasDefinition && !isIntro && (inExclusions || NEGATIVE_COVER.test(rawSentence))) {
        const qualifiers = dropAccidentNoise(matchConditions(`${clause.heading ?? ""} ${rawSentence}`));
        produced.push(makeFact(ctx, "exclusion", labelFor(clause.heading, rawSentence), { qualifiers }));
      } else if (!hasWaiting && !hasDefinition && !inExclusions && !isIntro && POSITIVE_COVER.test(rawSentence) && !NEGATIVE_COVER.test(rawSentence)) {
        const qualifiers = dropAccidentNoise(matchConditions(`${clause.heading ?? ""} ${rawSentence}`));
        produced.push(makeFact(ctx, "coverage", labelFor(clause.heading, rawSentence), { qualifiers }));
      }

      for (const fact of produced) {
        const key = `${fact.category}|${normalizeForMatch(fact.citation.quote)}|${fact.label}`;
        if (!seen.has(key)) {
          seen.add(key);
          collected.push(fact);
        }
      }
    });
  }

  const counts = new Map<FactCategory, number>();
  return collected.filter((fact) => {
    const count = counts.get(fact.category) ?? 0;
    counts.set(fact.category, count + 1);
    return count < CATEGORY_CAPS[fact.category];
  });
}

function sameCitationLabel(citation: Citation): string {
  return `p.${citation.page}${citation.clauseRef ? ` \u00A7${citation.clauseRef}` : ""}`;
}

function detectConflicts(facts: Fact[]): Issue[] {
  const issues: Issue[] = [];

  const groupBy = <T,>(items: T[], keyOf: (item: T) => string) => {
    const groups = new Map<string, T[]>();
    for (const item of items) {
      const key = keyOf(item);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return groups;
  };

  const waiting = facts.filter((fact) => fact.category === "waiting_period" && fact.days !== null);
  for (const [key, group] of groupBy(waiting, (fact) => [...fact.qualifiers].sort().join("+") || "general")) {
    const distinct = new Map(group.map((fact) => [Math.round(fact.days ?? 0), fact]));
    if (distinct.size > 1) {
      const entries = [...distinct.values()];
      issues.push({
        kind: "conflict",
        severity: "warning",
        message: `Different waiting periods are stated for ${key === "general" ? "the same or unspecified conditions" : key.split("+").map(conditionLabel).join(", ")}: ${entries
          .map((fact) => `${fact.value} (${sameCitationLabel(fact.citation)})`)
          .join(" vs ")}. The document does not say which prevails; check the policy schedule and any endorsements.`,
        citations: entries.map((fact) => fact.citation),
      });
    }
  }

  const copay = facts.filter((fact) => fact.category === "co_payment" && fact.percent !== null);
  for (const [key, group] of groupBy(copay, (fact) => [...fact.qualifiers].sort().join("+") || "general")) {
    const distinct = new Map(group.map((fact) => [fact.percent, fact]));
    if (distinct.size > 1 && group.every((fact) => !/(?:above|over|aged?|beyond)\s*\d{2}/i.test(fact.label))) {
      const entries = [...distinct.values()];
      issues.push({
        kind: "conflict",
        severity: "warning",
        message: `Different co-payment percentages are stated${key === "general" ? "" : ` for ${key.split("+").map(conditionLabel).join(", ")}`}: ${entries
          .map((fact) => `${fact.value} (${sameCitationLabel(fact.citation)})`)
          .join(" vs ")}. Check which one applies to your situation.`,
        citations: entries.map((fact) => fact.citation),
      });
    }
  }

  const sums = facts.filter((fact) => fact.category === "sum_insured" && fact.amount !== null);
  const distinctSums = new Map(sums.map((fact) => [fact.amount, fact]));
  if (distinctSums.size > 1) {
    const entries = [...distinctSums.values()];
    issues.push({
      kind: "ambiguity",
      severity: "info",
      message: `More than one sum insured / limit figure appears (${entries
        .map((fact) => `${fact.value} on ${sameCitationLabel(fact.citation)}`)
        .join(", ")}). They may relate to different plan options or benefits; the document text alone does not say which is yours.`,
      citations: entries.map((fact) => fact.citation),
    });
  }

  // A waiting-period clause that says the benefit is "covered after N months" is a coverage statement too.
  const coverage = facts.filter(
    (fact) =>
      fact.category === "coverage" ||
      (fact.category === "waiting_period" && /\b(?:covered|payable|admissible|eligible)\b/i.test(fact.citation.quote) && !/\bnot (?:covered|payable|admissible)/i.test(fact.citation.quote)),
  );
  const absoluteExclusions = facts.filter((fact) => fact.category === "exclusion" && !/\d+\s*(?:days?|months?|years?)/i.test(fact.citation.quote));
  for (const entry of CONDITION_LEXICON) {
    const covered = coverage.find((fact) => entry.pattern.test(fact.citation.quote) && !/except|excluding|other than/i.test(fact.citation.quote));
    const excluded = absoluteExclusions.find((fact) => entry.pattern.test(fact.citation.quote));
    if (covered && excluded) {
      issues.push({
        kind: "conflict",
        severity: "warning",
        message: `${entry.label[0].toUpperCase()}${entry.label.slice(1)} appears both as covered (${sameCitationLabel(covered.citation)}) and as excluded (${sameCitationLabel(excluded.citation)}). The document does not reconcile these; the insurer's interpretation and any schedule or endorsement will decide.`,
        citations: [covered.citation, excluded.citation],
      });
    }
  }

  return issues;
}

function detectAmbiguity(facts: Fact[]): Issue[] {
  const issues: Issue[] = [];
  const strongHedges = new Set(HEDGE_PATTERNS.filter((hedge) => hedge.strong).map((hedge) => hedge.label));

  for (const fact of facts) {
    if (issues.length >= 8) {
      break;
    }

    const strong = fact.hedges.filter((label) => strongHedges.has(label));
    const numericCategory = ["co_payment", "deductible", "sub_limit", "waiting_period", "sum_insured"].includes(fact.category);

    if (strong.length > 0) {
      issues.push({
        kind: "ambiguity",
        severity: "info",
        message: `${fact.label}: this term ${strong.join(" and ")}, so the clause alone does not fix the outcome.`,
        citations: [fact.citation],
      });
    } else if (numericCategory && fact.value === null && fact.category !== "waiting_period") {
      issues.push({
        kind: "ambiguity",
        severity: "info",
        message: `${fact.label} is mentioned but no figure is stated in this clause.`,
        citations: [fact.citation],
      });
    }
  }

  return issues;
}

// Discretion language matters even when the sentence is not a numeric term, so clauses are scanned directly.
function detectDiscretion(clauses: Clause[], doc: DocumentMeta): Issue[] {
  const discretion = HEDGE_PATTERNS.filter((hedge) => hedge.strong && hedge.label !== "depends on the policy schedule");
  const issues: Issue[] = [];

  for (const clause of clauses) {
    for (const sentence of splitSentences(clause.text)) {
      const hit = discretion.find((hedge) => hedge.pattern.test(sentence));
      if (hit && issues.length < 4) {
        issues.push({
          kind: "ambiguity",
          severity: "warning",
          message: `A clause leaves the outcome to ${hit.label.replace("at the insurer's discretion", "the insurer's discretion")}. The wording does not set an objective test, so how it applies depends on the insurer's own assessment.`,
          citations: [citationOf({ clause, sentence, doc })],
        });
      }
    }
  }

  return issues;
}

function detectPolicyName(pages: PageText[], insurer: string | null): string | null {
  const lines = (pages[0]?.text ?? "").split("\n").slice(0, 14);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length >= 6 && trimmed.length <= 80 && /\b(policy|plan|cover|care|shield|protect|suraksha|assurance)\b/i.test(trimmed) && trimmed !== insurer && !/\bpolicy (?:number|no|period|schedule)\b/i.test(trimmed)) {
      return trimmed;
    }
  }

  return null;
}

export function extractPolicyFacts(args: { doc: DocumentMeta; pages: PageText[]; clauses: Clause[] }): Extraction {
  const pageText = new Map(args.pages.map((page) => [page.page, page.text]));
  const rawFacts = extractFactsFromClauses(args.clauses, args.doc);

  // Grounding check: a fact whose quote cannot be found on its cited page is discarded, never shown.
  const facts = rawFacts.filter((fact) => quoteAppearsIn(fact.citation.quote, pageText.get(fact.citation.page) ?? ""));

  const insurer = detectInsurer(args.pages);
  const issues: Issue[] = [...detectConflicts(facts), ...detectAmbiguity(facts), ...detectDiscretion(args.clauses, args.doc)];

  const ocrPages = args.pages.filter((page) => page.source === "ocr").map((page) => page.page);
  if (ocrPages.length > 0) {
    issues.push({
      kind: "quality",
      severity: "warning",
      message: `Pages ${ocrPages.join(", ")} were read using OCR and may contain errors, especially in numbers. Verify important figures against the original document.`,
      citations: [],
    });
  }

  const emptyPages = args.pages.filter((page) => page.text.replace(/\s/g, "").length < 20).map((page) => page.page);
  if (emptyPages.length > 0) {
    issues.push({
      kind: "quality",
      severity: "warning",
      message: `No readable text was found on page${emptyPages.length === 1 ? "" : "s"} ${emptyPages.join(", ")}. Anything printed there was not reviewed.`,
      citations: [],
    });
  }

  issues.push({
    kind: "limitation",
    severity: "info",
    message:
      "Only the text of the document you provided was reviewed. A policy schedule, endorsements, riders or later amendments that were not included may change any term shown here.",
    citations: [],
  });

  const present = new Set(facts.map((fact) => fact.category));
  const notLocated = FACT_CATEGORIES.filter((category) => !present.has(category)).map((category) => ({
    category,
    message: `No ${FACT_CATEGORY_LABELS[category].toLowerCase()} could be located in the document text. This does not mean none applies: it may be in a schedule, endorsement or page that was not provided or could not be read.`,
  }));

  return {
    facts,
    notLocated,
    issues,
    insurer,
    policyName: detectPolicyName(args.pages, insurer),
    generatedBy: "rules",
    version: EXTRACTION_VERSION,
  };
}

export function citationLabel(citation: Pick<Citation, "page" | "clauseRef" | "documentTitle">, withDocument = false): string {
  const location = `p.${citation.page}${citation.clauseRef ? `, clause ${citation.clauseRef}` : ""}`;
  return withDocument ? `${citation.documentTitle}: ${location}` : location;
}

export { clauseLabel };

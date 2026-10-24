import { z } from "zod";
import { splitSentences } from "@/lib/policy/extraction";
import { matchConditions } from "@/lib/policy/lexicon";
import { formatMoney } from "@/lib/policy/money";
import { tokenize } from "@/lib/policy/retrieval";
import {
  POLICY_DISCLAIMER,
  type Citation,
  type Clause,
  type DocumentMeta,
  type Extraction,
  type Fact,
  type PolicyType,
} from "@/lib/policy/types";

export const scenarioInputSchema = z.object({
  kind: z.enum(["health_hospitalization", "motor_damage", "life_death", "generic"]),
  claimAmount: z.number().min(0).max(1_000_000_000).nullable().default(null),
  monthsSinceStart: z.number().min(0).max(1200).nullable().default(null),
  circumstance: z.string().trim().max(400).default(""),
  isPreExisting: z.boolean().default(false),
  insuredAge: z.number().int().min(0).max(120).nullable().default(null),
  roomRentPerDay: z.number().min(0).max(10_000_000).nullable().default(null),
  stayDays: z.number().int().min(0).max(365).nullable().default(null),
  sumInsuredOverride: z.number().min(0).max(100_000_000_000).nullable().default(null),
  chooseVoluntaryDeductible: z.boolean().default(false),
});
export type ScenarioInput = z.infer<typeof scenarioInputSchema>;

export type StepBasis = "explicit" | "assumption" | "interpretation" | "not_located";

export type ScenarioStep = {
  title: string;
  detail: string;
  effect: string | null;
  basis: StepBasis;
  citations: Citation[];
};

export type Screening = {
  label: string;
  outcome: "may_apply" | "does_not_appear_to_apply" | "cannot_determine";
  detail: string;
  basis: StepBasis;
  citations: Citation[];
};

export type ScenarioResult = {
  kind: ScenarioInput["kind"];
  assumptions: Array<{ label: string; value: string; source: "you" | "default" | "document" }>;
  screening: Screening[];
  steps: ScenarioStep[];
  estimate: { claimAmount: number; insurerShare: number; yourShare: number; currency: string; complete: boolean } | null;
  notApplied: string[];
  summary: string[];
  disclaimer: string;
};

type Args = {
  input: ScenarioInput;
  doc: DocumentMeta;
  policyType: PolicyType;
  extraction: Extraction;
  clauses: Clause[];
};

const DAYS_PER_MONTH = 30;
const TIME_LIMITED = /(?:within|during|in)\s+(?:the\s+)?(?:first\s+)?(\d{1,3})\s*(days?|months?|years?)/i;

function toMonths(value: number, unit: string): number {
  const u = unit.toLowerCase();
  return u.startsWith("d") ? value / DAYS_PER_MONTH : u.startsWith("y") ? value * 12 : value;
}

function findInClauses(clauses: Clause[], doc: DocumentMeta, pattern: RegExp): Citation | null {
  for (const clause of clauses) {
    const sentence = splitSentences(clause.text).find((item) => pattern.test(item));
    if (sentence) {
      return { documentId: doc.id, documentTitle: doc.title, page: clause.page, clauseRef: clause.ref, quote: sentence.slice(0, 420) };
    }
  }

  return null;
}

function significantTokens(text: string): Set<string> {
  return new Set(tokenize(text).filter((token) => token.length > 3));
}

function ageThreshold(label: string, quote: string): number | null {
  const match = /(?:above|over|beyond|aged?)\s*(\d{2})/i.exec(`${label} ${quote}`);
  return match ? Number(match[1]) : null;
}

export function analyzeScenario({ input, doc, policyType, extraction, clauses }: Args): ScenarioResult {
  const facts = extraction.facts;
  const assumptions: ScenarioResult["assumptions"] = [];
  const screening: Screening[] = [];
  const steps: ScenarioStep[] = [];
  const notApplied: string[] = [];

  const circumstanceKeys = matchConditions(input.circumstance);
  const circumstanceTokens = significantTokens(input.circumstance);
  const currency = facts.find((fact) => fact.currency)?.currency ?? "INR";
  const money = (value: number) => formatMoney(value, currency);

  assumptions.push({ label: "Policy type", value: policyType.replace("_", " "), source: "document" });
  if (input.claimAmount !== null) assumptions.push({ label: "Claim amount", value: money(input.claimAmount), source: "you" });
  if (input.monthsSinceStart !== null) assumptions.push({ label: "Months since the policy started", value: String(input.monthsSinceStart), source: "you" });
  if (input.circumstance) assumptions.push({ label: "Circumstance", value: input.circumstance, source: "you" });
  if (input.isPreExisting) assumptions.push({ label: "Condition existed before the policy", value: "yes", source: "you" });
  if (input.insuredAge !== null) assumptions.push({ label: "Age of insured", value: String(input.insuredAge), source: "you" });

  // 1. Waiting periods and time-limited terms.
  const monthsKnown = input.monthsSinceStart !== null;
  const waiting = facts.filter((fact) => fact.category === "waiting_period" && fact.days !== null);
  const relevantWaiting = waiting.filter((fact) => {
    const keys = new Set(fact.qualifiers);
    if (keys.has("initial")) return true;
    if (keys.has("pre-existing")) return input.isPreExisting;
    return fact.qualifiers.some((key) => circumstanceKeys.includes(key));
  });

  for (const fact of relevantWaiting) {
    const label = `${fact.label} (${fact.value})`;
    const accidentException = /other than (?:an )?accident|except (?:for )?accident|accidents? (?:is|are) (?:not|excluded)/i.test(fact.citation.quote);
    if (accidentException && circumstanceKeys.includes("accident")) {
      screening.push({ label, outcome: "does_not_appear_to_apply", detail: "The clause says accidents are treated differently, and you described an accident.", basis: "explicit", citations: [fact.citation] });
      continue;
    }

    if (!monthsKnown) {
      screening.push({ label, outcome: "cannot_determine", detail: "Tell me how long the policy has been in force to check this.", basis: "not_located", citations: [fact.citation] });
      continue;
    }

    const elapsedDays = (input.monthsSinceStart ?? 0) * DAYS_PER_MONTH;
    const within = elapsedDays < (fact.days ?? 0);
    screening.push({
      label,
      outcome: within ? "may_apply" : "does_not_appear_to_apply",
      detail: within
        ? `The policy has run about ${input.monthsSinceStart} month(s), which is shorter than this waiting period, so a claim for this may not be payable.`
        : `The policy has run about ${input.monthsSinceStart} month(s), which is longer than this waiting period.`,
      basis: "explicit",
      citations: [fact.citation],
    });
  }

  if (input.isPreExisting && !waiting.some((fact) => fact.qualifiers.includes("pre-existing"))) {
    screening.push({ label: "Pre-existing condition waiting period", outcome: "cannot_determine", detail: "No waiting period for pre-existing conditions was located in the document text.", basis: "not_located", citations: [] });
  }

  // 2. Exclusions, including ones limited to the first months of the policy.
  const exclusions = facts.filter((fact) => fact.category === "exclusion");
  if (!input.circumstance) {
    screening.push({ label: "Exclusions", outcome: "cannot_determine", detail: "No circumstance was described, so exclusions were not screened.", basis: "assumption", citations: [] });
  } else {
    const hits = exclusions.filter((fact) => {
      const overlapKeys = fact.qualifiers.some((key) => circumstanceKeys.includes(key));
      const quoteTokens = significantTokens(fact.citation.quote);
      const overlapWords = [...circumstanceTokens].filter((token) => quoteTokens.has(token)).length >= 2;
      return overlapKeys || overlapWords;
    });

    for (const fact of hits.slice(0, 5)) {
      const timed = TIME_LIMITED.exec(fact.citation.quote);
      let detail = "The wording of this exclusion overlaps with what you described. This is a keyword comparison, not a determination.";
      let outcome: Screening["outcome"] = "may_apply";

      if (timed && monthsKnown) {
        const limitMonths = toMonths(Number(timed[1]), timed[2]);
        outcome = (input.monthsSinceStart ?? 0) < limitMonths ? "may_apply" : "does_not_appear_to_apply";
        detail = outcome === "may_apply" ? `This term is limited to the first ${timed[1]} ${timed[2]} and the policy is still within that period.` : `This term is limited to the first ${timed[1]} ${timed[2]} and the policy has run longer than that.`;
      } else if (/unless|except|other than/i.test(fact.citation.quote)) {
        detail += " The clause also contains an exception, so read it in full.";
      }

      screening.push({ label: `Exclusion: ${fact.label}`, outcome, detail, basis: "interpretation", citations: [fact.citation] });
    }

    if (hits.length === 0) {
      screening.push({ label: "Exclusions", outcome: "does_not_appear_to_apply", detail: "None of the exclusions located in the text clearly match what you described. This is a keyword comparison and cannot rule out an exclusion in pages that were not provided.", basis: "interpretation", citations: [] });
    }
  }

  if (policyType === "life" && input.kind === "life_death") {
    const sum = facts.find((fact) => fact.category === "sum_insured" && fact.amount !== null);
    const benefit = findInClauses(clauses, doc, /(?:death benefit|will pay the sum assured|pay the sum assured)/i);
    steps.push(
      sum
        ? { title: "Benefit stated in the policy", detail: `The text states a sum assured of ${sum.value}${benefit ? " and describes the death benefit" : ""}.`, effect: null, basis: "explicit", citations: [sum.citation, ...(benefit ? [benefit] : [])] }
        : { title: "Benefit stated in the policy", detail: "No sum assured figure was located in the document text.", effect: null, basis: "not_located", citations: [] },
    );
  }

  // 3. Amount arithmetic, using only terms that were actually located.
  let estimate: ScenarioResult["estimate"] = null;
  const wantsAmount = input.kind !== "life_death" && input.claimAmount !== null;

  if (wantsAmount) {
    const claim = input.claimAmount ?? 0;
    let payable = claim;

    const sumFacts = facts.filter((fact) => fact.category === "sum_insured" && fact.amount !== null);
    const sumInsured = input.sumInsuredOverride ?? sumFacts[0]?.amount ?? null;
    if (input.sumInsuredOverride !== null) {
      assumptions.push({ label: "Sum insured / IDV used", value: money(input.sumInsuredOverride), source: "you" });
    } else if (sumFacts[0]) {
      assumptions.push({ label: "Sum insured / IDV used", value: `${money(sumFacts[0].amount ?? 0)} (first figure found, p.${sumFacts[0].citation.page})`, source: "document" });
    }

    // Room rent cap.
    const roomLimit = facts.find((fact) => fact.category === "sub_limit" && fact.qualifiers.includes("room-rent"));
    if (input.kind === "health_hospitalization" && input.roomRentPerDay !== null && roomLimit) {
      const perDayLimit = roomLimit.percent !== null && sumInsured !== null ? (roomLimit.percent / 100) * sumInsured : (roomLimit.amount ?? null);
      if (perDayLimit === null) {
        notApplied.push("Room rent limit (the base amount for the percentage was not located)");
      } else if (input.roomRentPerDay > perDayLimit) {
        const proportionate = findInClauses(clauses, doc, /proportionate(?:ly)?\s+(?:deduct|reduc)|pro[- ]rata\s+(?:deduct|reduc)|(?:deduct|reduc)\w*\s+(?:in|on)\s+(?:a\s+)?(?:proportion|pro[- ]rata)|proportion(?:ate)?\s+(?:to|of)\s+(?:the\s+)?room/i);
        if (proportionate) {
          const ratio = perDayLimit / input.roomRentPerDay;
          const before = payable;
          payable *= ratio;
          steps.push({ title: "Room rent above the daily limit", detail: `Your room costs ${money(input.roomRentPerDay)} a day against a limit of ${money(perDayLimit)}. The policy text mentions a proportionate reduction, so the claim is scaled by ${(ratio * 100).toFixed(0)}%.`, effect: `${money(before)} \u2192 ${money(payable)}`, basis: "explicit", citations: [roomLimit.citation, proportionate] });
        } else {
          const days = input.stayDays ?? 1;
          const excess = (input.roomRentPerDay - perDayLimit) * days;
          const before = payable;
          payable = Math.max(0, payable - excess);
          steps.push({ title: "Room rent above the daily limit", detail: `Your room costs ${money(input.roomRentPerDay)} a day against a limit of ${money(perDayLimit)}. No proportionate-reduction wording was located, so only the room-charge excess for ${days} day(s) is removed. Insurers may apply the cap differently.`, effect: `${money(before)} \u2192 ${money(payable)}`, basis: "interpretation", citations: [roomLimit.citation] });
        }
      }
    } else if (input.kind === "health_hospitalization" && input.roomRentPerDay !== null) {
      notApplied.push("Room rent limit (none was located in the text)");
    }

    // Deductibles: only unconditional ones are applied.
    const deductibles = facts.filter((fact) => fact.category === "deductible" && fact.amount !== null);
    let deductible = 0;
    const appliedDeductibles: Fact[] = [];
    for (const fact of deductibles) {
      const optional = /voluntary|may be chosen|option(?:al)?|top-?up/i.test(`${fact.label} ${fact.citation.quote}`);
      if (!optional || (/voluntary/i.test(fact.label) && input.chooseVoluntaryDeductible)) {
        deductible += fact.amount ?? 0;
        appliedDeductibles.push(fact);
      } else {
        notApplied.push(`${fact.label} of ${fact.value} (p.${fact.citation.page}) applies only under an option or if chosen`);
      }
    }
    if (deductible > 0) {
      const before = payable;
      payable = Math.max(0, payable - deductible);
      assumptions.push({ label: "Order of calculation", value: "Deductible is subtracted before any co-payment (the policy text does not state the order).", source: "default" });
      steps.push({ title: "Deductible", detail: `A deductible of ${money(deductible)} is subtracted.`, effect: `${money(before)} \u2192 ${money(payable)}`, basis: "explicit", citations: appliedDeductibles.map((fact) => fact.citation) });
    }

    // Co-payment, which may depend on age.
    for (const fact of facts.filter((item) => item.category === "co_payment")) {
      if (fact.percent === null) {
        notApplied.push(`Co-payment mentioned without a percentage (p.${fact.citation.page})`);
        continue;
      }

      const threshold = ageThreshold(fact.label, fact.citation.quote);
      if (threshold !== null && input.insuredAge === null) {
        notApplied.push(`${fact.value} co-payment for age above ${threshold} (p.${fact.citation.page}); the insured's age was not provided`);
        continue;
      }
      if (threshold !== null && (input.insuredAge ?? 0) <= threshold) {
        steps.push({ title: "Co-payment", detail: `A ${fact.value} co-payment applies above age ${threshold}; the insured is ${input.insuredAge}, so it is not applied.`, effect: null, basis: "explicit", citations: [fact.citation] });
        continue;
      }

      const before = payable;
      payable *= 1 - fact.percent / 100;
      steps.push({ title: "Co-payment", detail: `The insured bears ${fact.value} of the claim.`, effect: `${money(before)} \u2192 ${money(payable)}`, basis: "explicit", citations: [fact.citation] });
    }

    // Sum insured cap.
    if (sumInsured !== null) {
      if (payable > sumInsured) {
        const before = payable;
        payable = sumInsured;
        steps.push({ title: "Sum insured / IDV cap", detail: `Payment cannot exceed ${money(sumInsured)}.`, effect: `${money(before)} \u2192 ${money(payable)}`, basis: "explicit", citations: sumFacts[0] && input.sumInsuredOverride === null ? [sumFacts[0].citation] : [] });
      }
    } else {
      notApplied.push("Sum insured / IDV cap (no figure was located)");
    }

    if (policyType === "motor" && /depreciation/i.test(JSON.stringify(facts.map((fact) => fact.citation.quote)))) {
      notApplied.push("Depreciation on replaced parts (no parts breakdown was provided)");
    }

    const lowered = Math.round(payable * 100) / 100;
    estimate = { claimAmount: claim, insurerShare: lowered, yourShare: Math.round((claim - lowered) * 100) / 100, currency, complete: notApplied.length === 0 };
  } else if (input.kind !== "life_death" && input.claimAmount === null) {
    steps.push({ title: "Amount", detail: "No claim amount was given, so no amounts were calculated.", effect: null, basis: "assumption", citations: [] });
  }

  const mayApply = screening.filter((item) => item.outcome === "may_apply");
  const summary: string[] = [];
  if (mayApply.length > 0) {
    summary.push(`${mayApply.length} term${mayApply.length === 1 ? "" : "s"} in the document may limit or defeat a claim in this scenario: ${mayApply.map((item) => item.label).join("; ")}.`);
  } else {
    summary.push("No waiting period or exclusion located in the text clearly stands in the way in this scenario.");
  }
  if (estimate) {
    summary.push(`If the insurer accepted the claim in full, the located terms point to roughly ${money(estimate.insurerShare)} from the insurer and ${money(estimate.yourShare)} from you.${estimate.complete ? "" : " This figure is incomplete because some terms could not be applied (see below)."}`);
  }
  if (notApplied.length > 0) {
    summary.push(`${notApplied.length} term${notApplied.length === 1 ? " was" : "s were"} not applied because the text did not allow it.`);
  }

  return { kind: input.kind, assumptions, screening, steps, estimate, notApplied, summary, disclaimer: POLICY_DISCLAIMER };
}

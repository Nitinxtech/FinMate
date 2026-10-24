import { conditionLabel } from "@/lib/policy/lexicon";
import {
  FACT_CATEGORY_LABELS,
  POLICY_DISCLAIMER,
  type Citation,
  type Extraction,
  type Fact,
  type FactCategory,
  type PolicyType,
} from "@/lib/policy/types";

export type CompareInput = {
  id: string;
  title: string;
  policyType: PolicyType;
  insurer: string | null;
  extraction: Extraction;
};

export type CompareCell = {
  status: "found" | "not_located";
  items: Array<{ text: string; citation: Citation }>;
};

export type CompareRow = {
  key: string;
  category: FactCategory;
  label: string;
  cells: CompareCell[];
  differs: boolean;
};

export type Comparison = {
  documents: Array<{ id: string; title: string; policyType: PolicyType; insurer: string | null }>;
  rows: CompareRow[];
  warnings: string[];
  summary: string[];
  disclaimer: string;
};

const NOT_LOCATED: CompareCell = { status: "not_located", items: [] };

function factText(fact: Fact): string {
  return fact.value ?? "Mentioned (no figure stated)";
}

function qualifierKey(fact: Fact): string {
  const keys = [...fact.qualifiers].sort();
  return keys.length > 0 ? keys.join("+") : "general";
}

function describeKey(key: string): string {
  return key === "general" ? "general" : key.split("+").map(conditionLabel).join(", ");
}

function cellFor(facts: Fact[]): CompareCell {
  if (facts.length === 0) {
    return NOT_LOCATED;
  }

  return { status: "found", items: facts.slice(0, 4).map((fact) => ({ text: factText(fact), citation: fact.citation })) };
}

function signature(cell: CompareCell): string {
  return cell.status === "not_located" ? "\u0000missing" : cell.items.map((item) => item.text.toLowerCase()).sort().join("|");
}

function makeRow(key: string, category: FactCategory, label: string, cells: CompareCell[]): CompareRow {
  const distinct = new Set(cells.map(signature));
  return { key, category, label, cells, differs: distinct.size > 1 };
}

type Grouper = (fact: Fact) => string;

function groupedRows(inputs: CompareInput[], category: FactCategory, keyOf: Grouper, labelOf: (key: string) => string): CompareRow[] {
  const keys = new Set<string>();
  const byDoc = inputs.map((input) => {
    const groups = new Map<string, Fact[]>();
    for (const fact of input.extraction.facts.filter((item) => item.category === category)) {
      const key = keyOf(fact);
      keys.add(key);
      groups.set(key, [...(groups.get(key) ?? []), fact]);
    }
    return groups;
  });

  return [...keys].sort().map((key) => makeRow(`${category}:${key}`, category, labelOf(key), byDoc.map((groups) => cellFor(groups.get(key) ?? []))));
}

export function comparePolicies(inputs: CompareInput[]): Comparison {
  const rows: CompareRow[] = [];

  rows.push(...groupedRows(inputs, "sum_insured", (fact) => fact.label, (key) => key));
  rows.push(...groupedRows(inputs, "premium", () => "premium", () => FACT_CATEGORY_LABELS.premium));
  rows.push(...groupedRows(inputs, "waiting_period", qualifierKey, (key) => `Waiting period: ${describeKey(key)}`));
  rows.push(...groupedRows(inputs, "co_payment", qualifierKey, (key) => `Co-payment: ${describeKey(key)}`));
  rows.push(...groupedRows(inputs, "deductible", (fact) => fact.label, (key) => key));
  rows.push(...groupedRows(inputs, "sub_limit", (fact) => fact.label, (key) => key));
  rows.push(
    ...groupedRows(
      inputs,
      "exclusion",
      (fact) => (fact.qualifiers.length > 0 ? qualifierKey(fact) : "other"),
      (key) => (key === "other" ? "Other exclusions" : `Exclusion: ${describeKey(key)}`),
    ),
  );
  rows.push(...groupedRows(inputs, "claim_procedure", (fact) => fact.label, (key) => key));
  rows.push(...groupedRows(inputs, "renewal", (fact) => fact.label, (key) => key));
  rows.push(...groupedRows(inputs, "cancellation", (fact) => fact.label, (key) => key));

  const coverageCells = inputs.map((input) => {
    const facts = input.extraction.facts.filter((fact) => fact.category === "coverage");
    return facts.length === 0
      ? NOT_LOCATED
      : ({ status: "found", items: facts.slice(0, 12).map((fact) => ({ text: fact.label, citation: fact.citation })) } satisfies CompareCell);
  });
  rows.push(makeRow("coverage:listed", "coverage", "Benefits described as covered", coverageCells));

  const warnings: string[] = [];
  const types = new Set(inputs.map((input) => input.policyType));
  if (types.size > 1) {
    warnings.push(
      "These documents are different types of policy, so many terms are not directly comparable. Differences below may reflect the product type rather than better or worse terms.",
    );
  }

  const unlocated = rows.filter((row) => row.cells.some((cell) => cell.status === "not_located") && row.cells.some((cell) => cell.status === "found")).length;
  if (unlocated > 0) {
    warnings.push(
      `${unlocated} term${unlocated === 1 ? " was" : "s were"} located in some documents but not others. "Not located" means the text was not found in the document provided, not that the term does not exist.`,
    );
  }

  const differing = rows.filter((row) => row.differs).length;
  const summary = [
    `${differing} of ${rows.length} compared terms differ between the documents.`,
    "This comparison lists what each document says; it does not rank the policies or recommend one.",
  ];

  return {
    documents: inputs.map((input) => ({ id: input.id, title: input.title, policyType: input.policyType, insurer: input.insurer })),
    rows,
    warnings,
    summary,
    disclaimer: POLICY_DISCLAIMER,
  };
}

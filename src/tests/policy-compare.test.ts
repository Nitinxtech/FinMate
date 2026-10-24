import { describe, expect, it } from "vitest";
import { analyze } from "./helpers/policy";
import { healthPolicyA, healthPolicyB, lifePolicy, motorPolicy } from "./fixtures/policies";
import { comparePolicies, type CompareInput, type CompareRow } from "@/lib/policy/compare";

function input(policy: ReturnType<typeof analyze>, type: CompareInput["policyType"]): CompareInput {
  return { id: policy.doc.id, title: policy.doc.title, policyType: type, insurer: policy.extraction.insurer, extraction: policy.extraction };
}

const a = analyze(healthPolicyA, "Care Plus", "doc-a");
const b = analyze(healthPolicyB, "Family Supreme", "doc-b");
const comparison = comparePolicies([input(a, "health"), input(b, "health")]);

const row = (key: RegExp): CompareRow => {
  const found = comparison.rows.find((candidate) => key.test(candidate.label));
  if (!found) {
    throw new Error(`No row matching ${key}`);
  }
  return found;
};

describe("side-by-side comparison", () => {
  it("aligns documents in column order and keeps each document's metadata", () => {
    expect(comparison.documents.map((doc) => doc.title)).toEqual(["Care Plus", "Family Supreme"]);
    expect(comparison.rows.every((candidate) => candidate.cells.length === 2)).toBe(true);
  });

  it("shows differing waiting periods for the same condition, with sources", () => {
    const waiting = row(/Waiting period: pre-existing/i);

    expect(waiting.differs).toBe(true);
    expect(waiting.cells[0].items[0]).toMatchObject({ text: "36 months", citation: { documentTitle: "Care Plus", page: 4, clauseRef: "3.2" } });
    expect(waiting.cells[1].items[0]).toMatchObject({ text: "24 months", citation: { documentTitle: "Family Supreme", clauseRef: "1.2" } });
  });

  it("marks a term as not located when only one document has it", () => {
    const roomRent = row(/Room rent limit/i);

    expect(roomRent.cells[0].status).toBe("found");
    expect(roomRent.cells[1].status).toBe("not_located");
    expect(roomRent.cells[1].items).toEqual([]);
    expect(roomRent.differs).toBe(true);
  });

  it("does not flag identical terms as different", () => {
    const sameExclusion = comparison.rows.find((candidate) => /Exclusion: cosmetic/i.test(candidate.label));
    expect(sameExclusion?.cells.every((cell) => cell.status === "found")).toBe(true);
  });

  it("compares cancellation, grace period and claim timelines", () => {
    expect(row(/^Free-look period/i).cells.map((cell) => cell.items[0].text)).toEqual(["15 days", "30 days"]);
    expect(row(/^Grace period/i).cells.map((cell) => cell.items[0].text)).toEqual(["30 days", "15 days"]);
    expect(row(/^Settlement timeline/i).cells.map((cell) => cell.items[0].text)).toEqual(["30 days", "15 days"]);
  });

  it("compares sum insured and premium", () => {
    const sums = comparison.rows.filter((candidate) => candidate.category === "sum_insured");
    expect(sums.some((candidate) => candidate.cells.some((cell) => cell.items.some((item) => /5,00,000/.test(item.text))))).toBe(true);
    expect(sums.some((candidate) => candidate.cells.some((cell) => cell.items.some((item) => /10,00,000/.test(item.text))))).toBe(true);
    expect(row(/^Premium/i).differs).toBe(true);
  });

  it("every cell item points to a real page and belongs to the right document", () => {
    for (const candidate of comparison.rows) {
      candidate.cells.forEach((cell, column) => {
        for (const item of cell.items) {
          expect(item.citation.documentId).toBe(comparison.documents[column].id);
          expect(item.citation.page).toBeGreaterThanOrEqual(1);
          expect(item.citation.quote.length).toBeGreaterThan(10);
        }
      });
    }
  });

  it("warns that not-located is not the same as absent", () => {
    expect(comparison.warnings.join(" ")).toMatch(/does not exist|not that the term/i);
  });

  it("does not rank policies or recommend one", () => {
    const text = JSON.stringify(comparison).toLowerCase();

    expect(comparison.summary.join(" ")).toMatch(/does not rank/i);
    expect(text).not.toMatch(/\bbest\b|\bbetter\b|\bworse\b|\brecommend(?:ed)? (?:this|that|buying)|\bwinner\b|\bshould (?:buy|choose)\b/);
  });

  it("warns when asked to compare different kinds of policy", () => {
    const mixed = comparePolicies([input(a, "health"), input(analyze(motorPolicy, "Car", "doc-m"), "motor")]);
    expect(mixed.warnings.join(" ")).toMatch(/different types/i);
  });

  it("handles three and four documents", () => {
    const c = analyze(lifePolicy, "Life", "doc-l");
    const many = comparePolicies([input(a, "health"), input(b, "health"), input(c, "life"), input(analyze(motorPolicy, "Car", "doc-m"), "motor")]);

    expect(many.documents).toHaveLength(4);
    expect(many.rows.every((candidate) => candidate.cells.length === 4)).toBe(true);
  });

  it("includes the standard disclaimer", () => {
    expect(comparison.disclaimer).toMatch(/not legal or insurance advice/i);
    expect(comparison.disclaimer).toMatch(/guarantees/i);
  });
});

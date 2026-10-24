import { describe, expect, it } from "vitest";
import { analyze } from "./helpers/policy";
import {
  healthPolicyA,
  healthPolicyConflicting,
  lifePolicy,
  motorPolicy,
  notAPolicy,
  silentPolicy,
} from "./fixtures/policies";
import { segmentClauses } from "@/lib/policy/clauses";
import { quoteAppearsIn } from "@/lib/policy/sanitize";
import type { Fact, FactCategory } from "@/lib/policy/types";

function find(facts: Fact[], category: FactCategory, label: RegExp): Fact | undefined {
  return facts.find((fact) => fact.category === category && label.test(fact.label));
}

describe("policy classification", () => {
  it.each([
    ["health", healthPolicyA],
    ["motor", motorPolicy],
    ["life", lifePolicy],
  ])("classifies a %s policy", (expected, pages) => {
    const result = analyze(pages).classification;

    expect(result.type).toBe(expected);
    expect(result.isInsurancePolicy).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.signals.length).toBeGreaterThan(0);
  });

  it("does not pretend a non-insurance document is a policy", () => {
    const result = analyze(notAPolicy).classification;

    expect(result.isInsurancePolicy).toBe(false);
    expect(result.type).toBe("other");
    expect(result.confidence).toBeLessThan(0.3);
  });
});

describe("clause segmentation", () => {
  const { clauses } = analyze(healthPolicyA);

  it("keeps clause numbers and the page each clause is on", () => {
    const roomRent = clauses.find((clause) => clause.ref === "2.5");
    expect(roomRent?.page).toBe(3);
    expect(roomRent?.text).toContain("Room rent is limited to 1%");

    const coPay = clauses.find((clause) => clause.ref === "5.1");
    expect(coPay?.page).toBe(5);
  });

  it("tracks the section a clause sits under", () => {
    expect(clauses.find((clause) => clause.ref === "4.1")?.section).toMatch(/EXCLUSIONS/);
  });

  it("splits a clause that runs across a page break and marks the continuation", () => {
    const result = segmentClauses([
      { page: 1, source: "text", text: "SECTION 1: BENEFITS\n1.1 We will pay hospital expenses including the following items of cost incurred by the insured" },
      { page: 2, source: "text", text: "during the stay such as nursing charges and medicines.\n1.2 We will pay ambulance charges." },
    ]);

    const continuation = result.find((clause) => clause.page === 2 && clause.ref === "1.1");
    expect(continuation?.continued).toBe(true);
    expect(continuation?.text).toContain("nursing charges");
    expect(result.find((clause) => clause.ref === "1.2")?.page).toBe(2);
  });

  it("drops running headers and page numbers", () => {
    const pages = ["Acme Insurance", "Acme Insurance", "Acme Insurance", "Acme Insurance"].map((header, position) => ({
      page: position + 1,
      source: "text" as const,
      text: `${header}\nPage ${position + 1} of 4\n${position + 1}.1 Clause body number ${position + 1} is here.`,
    }));

    const text = segmentClauses(pages).map((clause) => clause.text).join(" ");
    expect(text).not.toContain("Acme Insurance");
    expect(text).not.toMatch(/Page \d of 4/);
  });
});

describe("structured extraction on a representative health policy", () => {
  const { extraction } = analyze(healthPolicyA, "Care Plus");
  const facts = extraction.facts;

  it("reads the schedule: sum insured and premium", () => {
    const sum = find(facts, "sum_insured", /sum insured/i);
    expect(sum?.amount).toBe(500000);
    expect(sum?.citation.page).toBe(1);

    const premium = find(facts, "premium", /premium/i);
    expect(premium?.amount).toBe(12500);
    expect(premium?.label).toMatch(/per annum/i);
  });

  it("extracts waiting periods with their conditions and clause references", () => {
    const preExisting = find(facts, "waiting_period", /pre-existing/i);
    expect(preExisting?.days).toBe(36 * 30);
    expect(preExisting?.citation).toMatchObject({ page: 4, clauseRef: "3.2" });

    const maternity = find(facts, "waiting_period", /maternity/i);
    expect(maternity?.value).toBe("48 months");

    const initial = find(facts, "waiting_period", /initial/i);
    expect(initial?.days).toBe(30);
  });

  it("extracts sub-limits per cost head, including two in one sentence", () => {
    expect(find(facts, "sub_limit", /room rent/i)?.value).toBe("1% of sum insured per day");
    expect(find(facts, "sub_limit", /icu/i)?.value).toBe("2% of sum insured per day");
    expect(find(facts, "sub_limit", /ambulance/i)?.amount).toBe(2000);
    expect(find(facts, "sub_limit", /cataract/i)?.amount).toBe(40000);
  });

  it("extracts co-payment, deductible and claim procedure", () => {
    expect(find(facts, "co_payment", /co-payment/i)).toMatchObject({ percent: 20, citation: expect.objectContaining({ clauseRef: "5.1" }) });
    expect(find(facts, "deductible", /deductible/i)?.amount).toBe(10000);

    const notices = facts.filter((fact) => fact.category === "claim_procedure" && fact.label === "Claim notification");
    expect(notices.map((fact) => fact.value).sort()).toEqual(["24 hours", "48 hours"]);
    expect(find(facts, "claim_procedure", /settlement/i)?.value).toBe("30 days");
    expect(find(facts, "claim_procedure", /cashless/i)).toBeDefined();
  });

  it("extracts renewal and cancellation provisions", () => {
    expect(find(facts, "renewal", /grace/i)?.value).toBe("30 days");
    expect(find(facts, "renewal", /lifelong/i)).toBeDefined();
    expect(find(facts, "cancellation", /free-look/i)?.value).toBe("15 days");
    expect(find(facts, "cancellation", /by insurer/i)).toBeDefined();
  });

  it("extracts exclusions and definitions", () => {
    expect(facts.filter((fact) => fact.category === "exclusion").length).toBeGreaterThanOrEqual(5);
    expect(find(facts, "exclusion", /cosmetic/i)?.citation.clauseRef).toBe("4.1");
    expect(find(facts, "definition", /pre-existing disease/i)?.value).toMatch(/48 months/);
  });

  it("does not turn section titles into policy terms", () => {
    expect(facts.some((fact) => /^(WHAT IS COVERED|RENEWAL AND CANCELLATION|EXCLUSIONS)$/.test(fact.label))).toBe(false);
  });

  it("gives every fact a verbatim quote that really appears on the cited page", () => {
    const { pages } = analyze(healthPolicyA);
    expect(facts.length).toBeGreaterThan(30);

    for (const fact of facts) {
      expect(fact.basis).toBe("explicit");
      expect(quoteAppearsIn(fact.citation.quote, pages[fact.citation.page - 1].text)).toBe(true);
    }
  });

  it("reports no conflicts for a consistent policy and always states its limitation", () => {
    expect(extraction.issues.some((issue) => issue.kind === "conflict")).toBe(false);
    expect(extraction.issues.some((issue) => issue.kind === "limitation")).toBe(true);
    expect(extraction.insurer).toMatch(/Sample Shield/i);
  });
});

describe("terms that cannot be located", () => {
  const { extraction } = analyze(silentPolicy);

  it("says so instead of inventing a term", () => {
    const missing = extraction.notLocated.map((item) => item.category);

    expect(missing).toEqual(expect.arrayContaining(["waiting_period", "co_payment", "deductible", "exclusion", "cancellation"]));
    expect(extraction.facts.some((fact) => fact.category === "waiting_period")).toBe(false);
    expect(extraction.notLocated[0].message).toMatch(/does not mean none applies/i);
  });

  it("still finds what is actually there", () => {
    expect(extraction.facts.some((fact) => fact.category === "coverage")).toBe(true);
    expect(extraction.facts.find((fact) => fact.category === "sum_insured")?.amount).toBe(200000);
  });
});

describe("conflicting provisions", () => {
  const { extraction } = analyze(healthPolicyConflicting);

  it("flags two different waiting periods for the same condition", () => {
    const conflict = extraction.issues.find((issue) => issue.kind === "conflict" && /waiting periods/i.test(issue.message));

    expect(conflict).toBeDefined();
    expect(conflict?.message).toMatch(/36 months/);
    expect(conflict?.message).toMatch(/24 months/);
    expect(conflict?.citations.map((citation) => citation.page).sort()).toEqual([4, 7]);
  });

  it("flags maternity being both covered after a wait and excluded outright", () => {
    const conflict = extraction.issues.find((issue) => issue.kind === "conflict" && /maternity/i.test(issue.message));
    expect(conflict?.message).toMatch(/does not reconcile/i);
  });
});

describe("OCR-sourced pages", () => {
  it("warns that figures may be wrong when pages came from OCR", () => {
    const pages = healthPolicyA.map((text, index) => ({ page: index + 1, source: index === 2 ? ("ocr" as const) : ("text" as const), text }));
    const clauses = segmentClauses(pages);
    return import("@/lib/policy/extraction").then(({ extractPolicyFacts }) => {
      const result = extractPolicyFacts({ doc: { id: "d", title: "t" }, pages, clauses });
      const quality = result.issues.find((issue) => issue.kind === "quality");

      expect(quality?.message).toMatch(/Pages 3 .*OCR/);
    });
  });
});

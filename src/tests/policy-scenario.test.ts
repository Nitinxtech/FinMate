import { describe, expect, it } from "vitest";
import { analyze } from "./helpers/policy";
import { healthPolicyA, lifePolicy, motorPolicy, silentPolicy } from "./fixtures/policies";
import { analyzeScenario, scenarioInputSchema, type ScenarioInput } from "@/lib/policy/scenario";

const health = analyze(healthPolicyA, "Care Plus", "doc-a");
const motor = analyze(motorPolicy, "Car Policy", "doc-m");
const life = analyze(lifePolicy, "Term Plan", "doc-l");
const silent = analyze(silentPolicy, "Simple Health", "doc-s");

function run(policy: ReturnType<typeof analyze>, type: Parameters<typeof analyzeScenario>[0]["policyType"], overrides: Partial<ScenarioInput>) {
  const input = scenarioInputSchema.parse({ kind: "health_hospitalization", ...overrides });
  return analyzeScenario({ input, doc: policy.doc, policyType: type, extraction: policy.extraction, clauses: policy.clauses });
}

describe("health scenario with explicit assumptions", () => {
  const result = run(health, "health", {
    claimAmount: 200000,
    monthsSinceStart: 6,
    isPreExisting: true,
    circumstance: "diabetes treatment",
    insuredAge: 65,
    roomRentPerDay: 8000,
    stayDays: 4,
  });

  it("records every input as an assumption and says where it came from", () => {
    const labels = result.assumptions.map((assumption) => assumption.label);

    expect(labels).toEqual(expect.arrayContaining(["Claim amount", "Months since the policy started", "Condition existed before the policy", "Age of insured"]));
    expect(result.assumptions.find((assumption) => assumption.label === "Claim amount")?.source).toBe("you");
    expect(result.assumptions.find((assumption) => assumption.label === "Sum insured / IDV used")?.source).toBe("document");
  });

  it("applies the pre-existing waiting period using the clause that states it", () => {
    const waiting = result.screening.find((item) => /pre-existing/i.test(item.label));

    expect(waiting?.outcome).toBe("may_apply");
    expect(waiting?.basis).toBe("explicit");
    expect(waiting?.citations[0]).toMatchObject({ page: 4, clauseRef: "3.2" });
    expect(waiting?.detail).toMatch(/may not be payable/i);
  });

  it("recognises the initial waiting period has already passed", () => {
    const initial = result.screening.find((item) => /initial/i.test(item.label));
    expect(initial?.outcome).toBe("does_not_appear_to_apply");
  });

  it("applies the age-based co-payment and cites it", () => {
    const coPay = result.steps.find((step) => step.title === "Co-payment");

    expect(coPay?.basis).toBe("explicit");
    expect(coPay?.citations[0].clauseRef).toBe("5.1");
    expect(coPay?.detail).toMatch(/20%/);
  });

  it("labels the room-rent adjustment as interpretation when the policy does not say how it is applied", () => {
    const room = result.steps.find((step) => /room rent/i.test(step.title));

    expect(room?.basis).toBe("interpretation");
    expect(room?.detail).toMatch(/No proportionate-reduction wording was located/);
    expect(room?.citations[0].clauseRef).toBe("2.5");
  });

  it("does not apply an optional deductible, and says so", () => {
    expect(result.steps.some((step) => step.title === "Deductible")).toBe(false);
    expect(result.notApplied.join(" ")).toMatch(/Deductible of .*applies only under an option/i);
  });

  it("computes an estimate from located terms only and marks it incomplete", () => {
    // 200,000 - room-rent excess (3,000 x 4) = 188,000; less 20% co-payment = 150,400.
    expect(result.estimate).toMatchObject({ claimAmount: 200000, insurerShare: 150400, yourShare: 49600 });
    expect(result.estimate?.complete).toBe(false);
  });

  it("never promises an outcome and always carries the disclaimer", () => {
    const text = JSON.stringify(result).toLowerCase();

    expect(text).not.toMatch(/will be paid|will be approved|guaranteed|is covered in full|will definitely/);
    expect(result.summary.join(" ")).toMatch(/if the insurer accepted/i);
    expect(result.disclaimer).toMatch(/insurer's own assessment/i);
  });
});

describe("scenario inputs that change the outcome", () => {
  it("does not apply the age co-payment to a younger insured", () => {
    const result = run(health, "health", { claimAmount: 100000, insuredAge: 40 });
    expect(result.steps.find((step) => step.title === "Co-payment")?.detail).toMatch(/not applied/);
    expect(result.estimate?.insurerShare).toBe(100000);
  });

  it("will not guess when the age needed for a co-payment is missing", () => {
    const result = run(health, "health", { claimAmount: 100000 });

    expect(result.notApplied.join(" ")).toMatch(/age was not provided/);
    expect(result.estimate?.complete).toBe(false);
  });

  it("asks for the policy age instead of guessing a waiting-period outcome", () => {
    const result = run(health, "health", { claimAmount: 50000, isPreExisting: true, insuredAge: 30 });

    const waiting = result.screening.find((item) => /pre-existing/i.test(item.label));
    expect(waiting?.outcome).toBe("cannot_determine");
    expect(waiting?.detail).toMatch(/how long the policy has been in force/i);
  });

  it("treats a long-running policy as past the waiting period", () => {
    const result = run(health, "health", { claimAmount: 50000, monthsSinceStart: 40, isPreExisting: true, insuredAge: 30 });
    expect(result.screening.find((item) => /pre-existing/i.test(item.label))?.outcome).toBe("does_not_appear_to_apply");
  });

  it("applies the accident exception to the initial waiting period", () => {
    const result = run(health, "health", { claimAmount: 50000, monthsSinceStart: 0.5, circumstance: "road accident injury", insuredAge: 30 });
    const initial = result.screening.find((item) => /initial/i.test(item.label));

    expect(initial?.outcome).toBe("does_not_appear_to_apply");
    expect(initial?.basis).toBe("explicit");
  });

  it("screens exclusions by keyword and says it is not a determination", () => {
    const result = run(health, "health", { claimAmount: 80000, monthsSinceStart: 40, circumstance: "cosmetic plastic surgery on my nose", insuredAge: 30 });
    const exclusion = result.screening.find((item) => /cosmetic/i.test(item.label));

    expect(exclusion?.outcome).toBe("may_apply");
    expect(exclusion?.detail).toMatch(/not a determination/i);
    expect(exclusion?.citations[0].clauseRef).toBe("4.1");
    expect(exclusion?.basis).toBe("interpretation");
  });

  it("does not calculate amounts when none was given", () => {
    const result = run(health, "health", { monthsSinceStart: 12 });

    expect(result.estimate).toBeNull();
    expect(result.steps[0].detail).toMatch(/No claim amount was given/);
  });

  it("caps the payout at the sum insured and cites where the figure came from", () => {
    const result = run(health, "health", { claimAmount: 900000, insuredAge: 30, monthsSinceStart: 40 });
    const cap = result.steps.find((step) => /sum insured/i.test(step.title));

    expect(result.estimate?.insurerShare).toBe(500000);
    expect(cap?.citations[0]).toMatchObject({ page: 1 });
  });

  it("lets the user override the sum insured and shows the assumption as theirs", () => {
    const result = run(health, "health", { claimAmount: 900000, insuredAge: 30, sumInsuredOverride: 600000 });

    expect(result.estimate?.insurerShare).toBe(600000);
    expect(result.assumptions.find((assumption) => assumption.label === "Sum insured / IDV used")?.source).toBe("you");
  });

  it("applies the deductible only when its option is chosen", () => {
    const base = run(motor, "motor", { kind: "motor_damage", claimAmount: 100000 });
    expect(base.steps.find((step) => step.title === "Deductible")?.effect).toMatch(/1,00,000.*99,000/);
    expect(base.notApplied.join(" ")).toMatch(/Voluntary deductible/i);

    const chosen = run(motor, "motor", { kind: "motor_damage", claimAmount: 100000, chooseVoluntaryDeductible: true });
    expect(chosen.estimate?.insurerShare).toBe(96500);
  });
});

describe("terms that cannot be located in the scenario", () => {
  it("lists missing terms as not applied instead of assuming values", () => {
    const result = run(silent, "health", { claimAmount: 300000, roomRentPerDay: 6000, stayDays: 3 });

    expect(result.notApplied.join(" ")).toMatch(/Room rent limit \(none was located/);
    expect(result.estimate?.insurerShare).toBe(200000);
    expect(result.estimate?.complete).toBe(false);
  });

  it("states that no exclusion was located without claiming the policy has none", () => {
    const result = run(silent, "health", { claimAmount: 10000, circumstance: "knee surgery", monthsSinceStart: 12 });
    const exclusions = result.screening.find((item) => item.label === "Exclusions");

    expect(exclusions?.detail).toMatch(/cannot rule out an exclusion/i);
  });

  it("reports a missing pre-existing waiting period as not located", () => {
    const result = run(silent, "health", { isPreExisting: true, monthsSinceStart: 3, claimAmount: 1000 });
    expect(result.screening.find((item) => /pre-existing/i.test(item.label))?.basis).toBe("not_located");
  });
});

describe("motor and life scenarios", () => {
  it("flags a drink-driving circumstance against the matching exclusion", () => {
    const result = run(motor, "motor", { kind: "motor_damage", claimAmount: 50000, circumstance: "accident while driving under the influence of alcohol" });
    const hit = result.screening.find((item) => /alcohol|influence/i.test(item.label));

    expect(hit?.outcome).toBe("may_apply");
    expect(hit?.citations[0].clauseRef).toBe("2.2");
  });

  it("checks the life policy's suicide clause against how long the policy has run", () => {
    const early = run(life, "life", { kind: "life_death", monthsSinceStart: 6, circumstance: "suicide" });
    const late = run(life, "life", { kind: "life_death", monthsSinceStart: 24, circumstance: "suicide" });

    expect(early.screening.find((item) => /suicide/i.test(item.label))?.outcome).toBe("may_apply");
    expect(late.screening.find((item) => /suicide/i.test(item.label))?.outcome).toBe("does_not_appear_to_apply");
    expect(early.estimate).toBeNull();
    expect(early.steps[0].citations.length).toBeGreaterThan(0);
  });
});

describe("scenario input validation", () => {
  it("rejects nonsense values", () => {
    expect(() => scenarioInputSchema.parse({ kind: "generic", claimAmount: -5 })).toThrow();
    expect(() => scenarioInputSchema.parse({ kind: "generic", claimAmount: 1e15 })).toThrow();
    expect(() => scenarioInputSchema.parse({ kind: "hack" })).toThrow();
    expect(() => scenarioInputSchema.parse({ kind: "generic", circumstance: "x".repeat(500) })).toThrow();
  });
});

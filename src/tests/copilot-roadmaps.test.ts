import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import { buildPurchasePlan, buildPurchaseThread, detectPurchaseItem } from "@/lib/ai/copilot-purchase-plan";
import { runFinancialCopilot } from "@/lib/ai/copilot-service";
import type { CopilotRequest } from "@/lib/ai/copilot-schemas";

const user = { id: "user-1" } as User;
const supabase = {} as never;

// Mirrors the numbers from the user's real chat: 36,400 take-home, 12,600.78 spare.
const profile = {
  currency_code: "INR",
  monthly_take_home_salary: 36400,
  monthly_expenses: [{ category: "Household", amount: 12000 }],
  debts: [{ lender: "Bike", monthlyPayment: 5000 }],
  insurances: [{ provider: "Health", premium: 1799.68 }],
  investments: [{ instrument: "Mutual fund", monthlyContribution: 4999.54 }],
  monthly_savings_target: 10000,
};

const planInput = {
  text: "",
  targetAmount: null as number | null,
  monthlyIncome: 36400,
  monthlySurplus: 12600.78,
  monthlyDebt: 5000,
  essentialsMonthly: 17000,
  emergencyBalance: 60000,
  currencyCode: "INR",
  downPayment: null as number | null,
  tenureMonths: null as number | null,
  interestRatePct: null as number | null,
};

function request(question: string, history: CopilotRequest["history"] = []): CopilotRequest {
  return { question, hypothetical: false, attachments: [], webpages: [], history };
}

const narrative = async () => ({ answer: "Short answer.", risks: [], nextSteps: [], uncertainty: "" });

describe("item detection and threads", () => {
  it("prefers a named model over the generic word", () => {
    expect(detectPurchaseItem("i want to buy a creta car")?.key).toBe("creta");
  });

  it("keeps the current item and drops an earlier unrelated one", () => {
    const turns = ["I want to buy a bike for 1.5 lakh", "downpayment 36000", "i want to buy a creta car can i buy it"];
    const thread = buildPurchaseThread(turns, "anyhow how can i afford it on emi and how much time it will take");

    expect(thread.toLowerCase()).toContain("creta");
    expect(thread).not.toContain("1.5 lakh");
    expect(thread).not.toContain("36000");
  });

  it("treats a bare follow-up like 'then?' as part of the purchase", () => {
    const thread = buildPurchaseThread(["i want to buy a creta car"], "then?");
    expect(thread.toLowerCase()).toContain("creta");
  });

  it("leaves an unrelated question alone", () => {
    const turns = ["i want to buy a creta car"];
    expect(buildPurchaseThread(turns, "Is my emergency fund enough?")).toBe("Is my emergency fund enough?");
    expect(buildPurchaseThread(turns, "How can I save more every month?")).toBe("How can I save more every month?");
  });

  it("keeps the earlier details for a short answer about the same item", () => {
    const turns = ["I want to buy a bike for 1.5 lakh"];
    const thread = buildPurchaseThread(turns, "downpayment 36000 and 24 months");
    expect(thread).toContain("1.5 lakh");
  });
});

describe("buildPurchasePlan", () => {
  it("builds a Creta plan with an assumed price and says honestly it is out of reach", () => {
    const plan = buildPurchasePlan({ ...planInput, text: "i want to buy a creta car" })!;

    expect(plan.priceAssumed).toBe(true);
    expect(plan.targetAmount).toBe(1_600_000);
    expect(plan.readiness.readyNow).toBe(false);
    expect(plan.readiness.readyInMonths).toBe(120);
    expect(plan.readiness.incomeNeeded).toBeGreaterThan(planInput.monthlyIncome * 1.5);
    expect(plan.takeaway.toLowerCase()).toContain("out of reach");
    expect(plan.readiness.checks.length).toBeGreaterThanOrEqual(3);
    expect(plan.readiness.runningCost).toBeGreaterThan(0);
  });

  it("gives a realistic timeline for something that is within reach", () => {
    const plan = buildPurchasePlan({ ...planInput, text: "buy a bike", targetAmount: 150000 })!;

    expect(plan.priceAssumed).toBe(false);
    expect(plan.readiness.readyInMonths).toBeGreaterThan(0);
    expect(plan.readiness.readyInMonths).toBeLessThan(120);
    expect(plan.roadmaps.find((roadmap) => roadmap.id === plan.recommendedId)?.tag).toBe("recommended");
  });

  it("uses a down payment the user already has", () => {
    const plan = buildPurchasePlan({ ...planInput, text: "buy a bike", targetAmount: 150000, downPayment: 36000 })!;

    expect(plan.roadmaps.find((roadmap) => roadmap.id === "down-emi")?.upfront).toBe(36000);
    expect(plan.inputs.find((input) => input.label === "Down payment")?.assumed).toBe(false);
  });

  it("returns nothing when the price is unknown and cannot be guessed", () => {
    expect(buildPurchasePlan({ ...planInput, text: "i want to buy a house" })).toBeNull();
  });
});

describe("copilot conversation behaviour", () => {
  it("builds a Creta plan even though the user never gave a price", async () => {
    const response = await runFinancialCopilot(
      { supabase, user, request: request("i want to buy a creta car can i buy it financial roadmap please") },
      { loadProfileContext: async () => profile, generateNarrative: narrative },
    );

    expect(response.plan?.itemLabel).toBe("Creta");
    expect(response.plan?.priceAssumed).toBe(true);
    expect(response.clarifyingQuestions.join(" ").toLowerCase()).toContain("on-road price");
  });

  it("answers 'then?' and 'how much time' with the Creta plan, not the bike", async () => {
    const history = [
      { role: "user" as const, content: "I want to buy a bike for 1.5 lakh" },
      { role: "assistant" as const, content: "Here are some options." },
      { role: "user" as const, content: "i want to buy a creta car can i buy it" },
      { role: "assistant" as const, content: "Not yet." },
    ];

    for (const question of ["then?", "anyhow how can i afford it on emi and how much time it will take"]) {
      const response = await runFinancialCopilot(
        { supabase, user, request: request(question, history) },
        { loadProfileContext: async () => profile, generateNarrative: narrative },
      );

      expect(response.plan?.itemLabel).toBe("Creta");
      expect(response.plan?.targetAmount).toBe(1_600_000);
    }
  });

  it("does not mistake a down payment for the price", async () => {
    const response = await runFinancialCopilot(
      {
        supabase,
        user,
        request: request("i can pay a downpayment of 3 lakh", [{ role: "user", content: "i want to buy a creta car" }]),
      },
      { loadProfileContext: async () => profile, generateNarrative: narrative },
    );

    expect(response.plan?.targetAmount).toBe(1_600_000);
    expect(response.plan?.roadmaps.find((roadmap) => roadmap.id === "down-emi")?.upfront).toBe(300_000);
  });

  it("reads a down payment written before the word", async () => {
    const response = await runFinancialCopilot(
      {
        supabase,
        user,
        request: request("36000 downpayment and 10% interest", [
          { role: "user", content: "I want to buy a bike for 1.5 lakh" },
        ]),
      },
      { loadProfileContext: async () => profile, generateNarrative: narrative },
    );

    expect(response.plan?.roadmaps.find((roadmap) => roadmap.id === "down-emi")?.upfront).toBe(36000);
    expect(response.plan?.inputs.find((input) => input.label === "Loan interest")?.value).toContain("10%");
  });

  it("answers a normal question plainly after a purchase chat", async () => {
    const response = await runFinancialCopilot(
      {
        supabase,
        user,
        request: request("Is my emergency fund enough?", [{ role: "user", content: "i want to buy a creta car" }]),
      },
      { loadProfileContext: async () => profile, generateNarrative: narrative },
    );

    expect(response.status).toBe("ok");
    expect(response.plan).toBeUndefined();
    expect(response.clarifyingQuestions).toEqual([]);
  });

  it("still gives a real, readable answer when the AI is slow or down", async () => {
    const failing = async () => {
      throw new Error("timeout");
    };

    const chat = await runFinancialCopilot(
      { supabase, user, request: request("Is my emergency fund enough?") },
      { loadProfileContext: async () => profile, generateNarrative: failing },
    );
    expect(chat.answer).toContain("3.5 months");
    expect(chat.answer.toLowerCase()).toContain("slow");

    const plan = await runFinancialCopilot(
      { supabase, user, request: request("i want to buy a creta car can i buy it") },
      { loadProfileContext: async () => profile, generateNarrative: failing },
    );
    expect(plan.plan).toBeDefined();
    expect(plan.answer).toContain("What to hit");
  });
});

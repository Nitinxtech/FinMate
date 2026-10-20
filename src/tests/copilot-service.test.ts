import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import { runFinancialCopilot } from "@/lib/ai/copilot-service";
import type { CopilotRequest } from "@/lib/ai/copilot-schemas";

const user = { id: "user-1" } as User;
const supabase = {} as never;

function buildRequest(overrides: Partial<CopilotRequest> = {}): CopilotRequest {
  const merged = {
    question: "How is my cash flow this month?",
    hypothetical: false,
    attachments: [],
    webpages: [],
    history: [],
    ...overrides,
  };

  return {
    ...merged,
    history: merged.history ?? [],
  };
}

describe("runFinancialCopilot", () => {
  it("asks clarifying questions when key inputs are missing", async () => {
    const response = await runFinancialCopilot(
      {
        supabase,
        user,
        request: buildRequest({ question: "Can you calculate my debt-to-income ratio?" }),
      },
      {
        loadProfileContext: async () => ({
          currency_code: "USD",
          debts: [],
        }),
      },
    );

    expect(response.status).toBe("needs_clarification");
    expect(response.clarifyingQuestions.length).toBeGreaterThan(0);
    expect(response.answer.toLowerCase()).toContain("missing inputs");
  });

  it("returns structured error when deterministic tools fail", async () => {
    const response = await runFinancialCopilot(
      {
        supabase,
        user,
        request: buildRequest(),
      },
      {
        loadProfileContext: async () => ({ currency_code: "USD" }),
        runTools: () => {
          throw new Error("tool failure");
        },
      },
    );

    expect(response.status).toBe("error");
    expect(response.answer.toLowerCase()).toContain("couldn't run the financial calculators");
    expect(response.risks.some((risk) => risk.toLowerCase().includes("tool execution"))).toBe(true);
  });

  it("blocks unsupported guarantee-like claims from model narrative", async () => {
    const response = await runFinancialCopilot(
      {
        supabase,
        user,
        request: buildRequest({ question: "How much should I invest?" }),
      },
      {
        loadProfileContext: async () => ({
          currency_code: "USD",
          monthly_take_home_salary: 4000,
          monthly_expenses: [{ category: "Rent", amount: 1000 }],
          debts: [{ lender: "Loan", monthlyPayment: 500 }],
          insurances: [{ provider: "Health", premium: 150 }],
          investments: [{ instrument: "Mutual Fund", monthlyContribution: 300 }],
          monthly_savings_target: 700,
          goals: [{ name: "Retirement", targetAmount: 500000, horizonMonths: 180 }],
        }),
        generateNarrative: async () => ({
          answer: "This plan gives a guaranteed return every year.",
          risks: ["none"],
          nextSteps: ["Do it now"],
          uncertainty: "none",
        }),
      },
    );

    expect(response.status).toBe("ok");
    expect(response.answer.toLowerCase()).not.toContain("guaranteed return");
    expect(response.uncertainty.toLowerCase()).toContain("excludes taxes");
  });

  it("captures explicit scenario framing for hypothetical questions", async () => {
    const response = await runFinancialCopilot(
      {
        supabase,
        user,
        request: buildRequest({
          question: "What if my salary grows by 20% next year?",
          hypothetical: true,
        }),
      },
      {
        loadProfileContext: async () => ({
          currency_code: "USD",
          monthly_take_home_salary: 5000,
          monthly_expenses: [{ category: "Living", amount: 1800 }],
          debts: [{ lender: "Loan", monthlyPayment: 600 }],
          insurances: [{ provider: "Health", premium: 100 }],
          investments: [{ instrument: "ETF", monthlyContribution: 500 }],
          goals: [{ name: "Home", targetAmount: 200000, horizonMonths: 120 }],
          monthly_savings_target: 800,
        }),
        generateNarrative: async () => ({
          answer: "Here is a scenario-based estimate using your current inputs.",
          risks: ["Future returns are uncertain."],
          nextSteps: ["Share exact growth assumptions for a refined scenario."],
          uncertainty: "This scenario is sensitive to assumptions.",
        }),
      },
    );

    expect(response.status).toBe("ok");
    expect(response.hypotheticalScenarios.length).toBeGreaterThan(0);
    expect(response.assumptions.some((text) => text.toLowerCase().includes("tax"))).toBe(true);
  });
});

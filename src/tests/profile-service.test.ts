import { describe, expect, it } from "vitest";
import { computeDerivedValues } from "@/features/profile/service";

describe("computeDerivedValues", () => {
  it("reconciles CTC against only applicable components", () => {
    const derived = computeDerivedValues({
      ctcAnnual: 2400000,
      ctcComponents: [
        { name: "Base", applies: true, annualAmount: 1800000 },
        { name: "Bonus", applies: true, annualAmount: 600000 },
        { name: "ESOP", applies: false, annualAmount: 300000 },
      ],
      monthlyDeductions: [
        { name: "PF", amount: 5000 },
        { name: "Insurance", amount: 1000 },
      ],
      monthlyExpenses: [
        { category: "Rent", amount: 40000 },
        { category: "Groceries", amount: 12000 },
      ],
    });

    expect(derived.ctcApplicableComponentsAnnual).toBe(2400000);
    expect(derived.ctcReconciliationDelta).toBe(0);
    expect(derived.monthlyDeductionTotal).toBe(6000);
    expect(derived.monthlyExpenseTotal).toBe(52000);
  });

  it("does not assume CTC equals take-home salary", () => {
    const derived = computeDerivedValues({
      ctcAnnual: 1200000,
      ctcComponents: [{ name: "Base", applies: true, annualAmount: 1000000 }],
    });

    expect(derived.ctcReconciliationDelta).toBe(200000);
  });
});

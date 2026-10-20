import { describe, expect, it } from "vitest";
import {
  adjustFutureValueForInflation,
  analyzeInvestmentAllocation,
  calculateEmergencyFundCoverage,
  calculateLoanAmortization,
  calculateMonthlyCashFlow,
  calculateRequiredMonthlyContribution,
  computeBasicFinancialRatios,
  projectCompoundInterest,
} from "@/lib/finance/engine";

function expectClose(actual: number, expected: number, precision = 2) {
  expect(actual).toBeCloseTo(expected, precision);
}

describe("finance engine", () => {
  it("calculates monthly cash flow and savings rate", () => {
    const result = calculateMonthlyCashFlow({
      monthlyIncome: 5000,
      monthlyEssentialExpenses: 2500,
      monthlyDebtPayments: 500,
      monthlyInsurancePremiums: 200,
      monthlyInvestments: 300,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.monthlyOutflows).toBe(3500);
    expect(result.value.monthlySurplus).toBe(1500);
    expect(result.value.savingsRate).toBe(30);
  });

  it("calculates emergency fund coverage and target shortfall", () => {
    const result = calculateEmergencyFundCoverage({
      emergencyFundBalance: 12000,
      monthlyEssentialExpenses: 2000,
      targetCoverageMonths: 6,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expectClose(result.value.coverageMonths, 6, 4);
    expect(result.value.targetFundAmount).toBe(12000);
    expect(result.value.shortfall).toBe(0);
  });

  it("calculates EMI and amortization schedule for reducing balance loan", () => {
    const result = calculateLoanAmortization({
      principal: 100000,
      annualRatePct: 12,
      tenureMonths: 12,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expectClose(result.value.monthlyEmi, 8884.88, 2);
    expectClose(result.value.totalInterest, 6618.53, 2);
    expectClose(result.value.totalRepayment, 106618.53, 2);
    expect(result.value.schedule).toHaveLength(12);
    expectClose(result.value.schedule[11]?.closingBalance ?? 1, 0, 2);
  });

  it("projects compound growth using deterministic nominal assumptions", () => {
    const result = projectCompoundInterest({
      initialPrincipal: 10000,
      monthlyContribution: 500,
      annualReturnPct: 12,
      years: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expectClose(result.value.endingNominalValue, 26184.07, 2);
    expectClose(result.value.totalContributions, 22000, 2);
    expectClose(result.value.totalGrowth, 4184.07, 2);
    expect(result.value.yearlySeries).toHaveLength(2);
  });

  it("adjusts nominal future value for inflation", () => {
    const result = adjustFutureValueForInflation({
      nominalFutureValue: 100000,
      annualInflationPct: 4,
      years: 10,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expectClose(result.value.inflationAdjustedFutureValue, 67556.42, 2);
  });

  it("computes required monthly contribution for a target goal", () => {
    const result = calculateRequiredMonthlyContribution({
      goalTarget: 120000,
      currentAmount: 10000,
      annualReturnPct: 8,
      monthsToGoal: 120,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expectClose(result.value.requiredMonthlyContribution, 534.61, 2);
  });

  it("analyzes allocation concentration using HHI", () => {
    const result = analyzeInvestmentAllocation({
      holdings: [
        { name: "Index Fund", value: 600 },
        { name: "Debt Fund", value: 400 },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.totalValue).toBe(1000);
    expect(result.value.slices[0]?.weightPct).toBe(60);
    expect(result.value.slices[1]?.weightPct).toBe(40);
    expectClose(result.value.concentrationHhi, 0.52, 4);
    expect(result.value.maxSingleAssetWeightPct).toBe(60);
  });

  it("computes basic financial ratios with documented formulas", () => {
    const result = computeBasicFinancialRatios({
      monthlyIncome: 5000,
      monthlyEssentialExpenses: 2500,
      monthlyDebtPayments: 500,
      monthlyInvestments: 300,
      emergencyFundBalance: 12000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const byKey = Object.fromEntries(result.value.map((ratio) => [ratio.key, ratio.value]));

    expect(byKey.savingsRate).toBe(40);
    expect(byKey.debtToIncome).toBe(10);
    expect(byKey.expenseToIncome).toBe(50);
    expect(byKey.investmentToIncome).toBe(6);
    expectClose(byKey.emergencyCoverageMonths, 4.8, 2);
  });

  it("rejects invalid input values deterministically", () => {
    const result = calculateMonthlyCashFlow({
      monthlyIncome: -1,
      monthlyEssentialExpenses: 1000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.issues.some((issue) => issue.field === "monthlyIncome")).toBe(true);
  });
});

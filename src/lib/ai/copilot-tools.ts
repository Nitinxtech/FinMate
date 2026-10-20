import {
  analyzeInvestmentAllocation,
  calculateEmergencyFundCoverage,
  calculateMonthlyCashFlow,
  calculateRequiredMonthlyContribution,
  computeBasicFinancialRatios,
  projectCompoundInterest,
} from "@/lib/finance/engine";
import type { CopilotIntent } from "@/lib/ai/copilot-plan";
import type { CopilotProfileContext } from "@/lib/ai/copilot-profile";
import type { CopilotCalculation } from "@/lib/ai/copilot-schemas";

type ExpenseItem = { category?: string; amount?: number };
type DebtItem = { lender?: string; monthlyPayment?: number };
type InsuranceItem = { provider?: string; premium?: number };
type InvestmentItem = { instrument?: string; monthlyContribution?: number };
type GoalItem = { name?: string; targetAmount?: number; horizonMonths?: number };

export type CopilotToolResult = {
  facts: string[];
  estimates: string[];
  assumptions: string[];
  hypotheticalScenarios: string[];
  calculations: CopilotCalculation[];
  clarifyingQuestions: string[];
  sources: string[];
  risks: string[];
};

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function fmtMoney(value: number, currencyCode: string): string {
  const currency = currencyCode.length === 3 ? currencyCode : "USD";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function parseArrays(profile: CopilotProfileContext) {
  return {
    expenses: (profile.monthly_expenses ?? []) as ExpenseItem[],
    debts: (profile.debts ?? []) as DebtItem[],
    insurances: (profile.insurances ?? []) as InsuranceItem[],
    investments: (profile.investments ?? []) as InvestmentItem[],
    goals: (profile.goals ?? []) as GoalItem[],
  };
}

function getMonthlyIncome(profile: CopilotProfileContext): number {
  return num(profile.monthly_take_home_salary) || num(profile.monthly_gross_salary);
}

export function runCopilotDeterministicTools(
  intents: CopilotIntent[],
  profile: CopilotProfileContext,
  asksForScenario: boolean,
): CopilotToolResult {
  const currencyCode = profile.currency_code ?? "USD";
  const monthlyIncome = getMonthlyIncome(profile);
  const arrays = parseArrays(profile);

  const monthlyExpenses = arrays.expenses.reduce((sum, item) => sum + num(item.amount), 0);
  const monthlyDebt = arrays.debts.reduce((sum, item) => sum + num(item.monthlyPayment), 0);
  const monthlyInsurance = arrays.insurances.reduce((sum, item) => sum + num(item.premium), 0);
  const monthlyInvestments = arrays.investments.reduce((sum, item) => sum + num(item.monthlyContribution), 0);

  const facts: string[] = [];
  const estimates: string[] = [];
  const assumptions: string[] = [];
  const hypotheticalScenarios: string[] = [];
  const calculations: CopilotCalculation[] = [];
  const clarifyingQuestions: string[] = [];
  const sources = new Set<string>(["financial_profiles.currency_code"]);
  const risks: string[] = [];

  if (monthlyIncome <= 0) {
    clarifyingQuestions.push(
      "What is your current monthly take-home salary (or gross salary) so I can compute reliable ratios and cash flow?",
    );
  }

  if (intents.includes("cash_flow") || intents.includes("general")) {
    sources.add("financial_profiles.monthly_take_home_salary");
    sources.add("financial_profiles.monthly_gross_salary");
    sources.add("financial_profiles.monthly_expenses");
    sources.add("financial_profiles.debts");
    sources.add("financial_profiles.insurances");
    sources.add("financial_profiles.investments");

    const cashflow = calculateMonthlyCashFlow({
      monthlyIncome,
      monthlyEssentialExpenses: monthlyExpenses,
      monthlyDebtPayments: monthlyDebt,
      monthlyInsurancePremiums: monthlyInsurance,
      monthlyInvestments,
    });

    if (cashflow.ok) {
      calculations.push({
        name: "Monthly cash flow",
        formula: "income - (expenses + debt + insurance + investments)",
        result: `${fmtMoney(cashflow.value.monthlySurplus, currencyCode)} surplus (${cashflow.value.savingsRate.toFixed(2)}% savings rate)`,
        confidence: "deterministic",
      });
      facts.push(
        `Your current monthly outflow in this model is ${fmtMoney(cashflow.value.monthlyOutflows, currencyCode)}.`,
      );
      if (cashflow.value.monthlySurplus < 0) {
        risks.push("Current entered data indicates a monthly deficit.");
      }
    } else {
      clarifyingQuestions.push("I could not compute cash flow. Please confirm your monthly values are non-negative numbers.");
    }
  }

  if (intents.includes("emergency") || intents.includes("general")) {
    sources.add("financial_profiles.monthly_savings_target");
    sources.add("financial_profiles.monthly_expenses");
    sources.add("financial_profiles.debts");

    const emergencyFundBalanceProxy = num(profile.monthly_savings_target) * 6;
    if (num(profile.monthly_savings_target) <= 0) {
      clarifyingQuestions.push(
        "Please share your monthly savings target so I can estimate emergency fund coverage more accurately.",
      );
    }

    const emergency = calculateEmergencyFundCoverage({
      emergencyFundBalance: emergencyFundBalanceProxy,
      monthlyEssentialExpenses: monthlyExpenses + monthlyDebt,
      targetCoverageMonths: 6,
    });

    if (emergency.ok) {
      calculations.push({
        name: "Emergency fund coverage",
        formula: "estimated emergency balance / monthly essential outflow",
        result: `${emergency.value.coverageMonths.toFixed(2)} months (shortfall ${fmtMoney(emergency.value.shortfall, currencyCode)})`,
        confidence: "estimated",
      });
      estimates.push(
        "Emergency balance is estimated as monthly savings target multiplied by 6 because no dedicated emergency-fund field exists yet.",
      );
      if (emergency.value.coverageMonths < 3) {
        risks.push("Emergency coverage appears low versus a 3-6 month cushion benchmark.");
      }
    }
  }

  if (intents.includes("debt") || intents.includes("ratios") || intents.includes("general")) {
    sources.add("financial_profiles.debts");
    if (arrays.debts.length === 0) {
      clarifyingQuestions.push("Do you currently have any loan EMIs or debt payments to include?");
    }

    const ratios = computeBasicFinancialRatios({
      monthlyIncome,
      monthlyEssentialExpenses: monthlyExpenses,
      monthlyDebtPayments: monthlyDebt,
      monthlyInvestments,
      emergencyFundBalance: num(profile.monthly_savings_target) * 6,
    });

    if (ratios.ok) {
      const dti = ratios.value.find((ratio) => ratio.key === "debtToIncome");
      const savingsRate = ratios.value.find((ratio) => ratio.key === "savingsRate");

      if (dti) {
        calculations.push({
          name: "Debt-to-income ratio",
          formula: "monthly debt payments / monthly income",
          result: `${dti.value.toFixed(2)}%`,
          confidence: "deterministic",
        });
      }

      if (savingsRate) {
        calculations.push({
          name: "Savings ratio",
          formula: "(income - essential expenses - debt) / income",
          result: `${savingsRate.value.toFixed(2)}%`,
          confidence: "deterministic",
        });
      }
    }
  }

  if (intents.includes("investment") || intents.includes("general")) {
    sources.add("financial_profiles.investments");
    if (arrays.investments.length === 0) {
      clarifyingQuestions.push("Please add at least one investment contribution to analyze allocation and projections.");
    } else {
      const allocation = analyzeInvestmentAllocation({
        holdings: arrays.investments.map((investment) => ({
          name: investment.instrument?.trim() || "Unnamed investment",
          value: num(investment.monthlyContribution),
        })),
      });

      if (allocation.ok) {
        calculations.push({
          name: "Investment concentration",
          formula: "Herfindahl-Hirschman index from contribution weights",
          result: `HHI ${allocation.value.concentrationHhi.toFixed(3)}, largest holding ${allocation.value.maxSingleAssetWeightPct.toFixed(2)}%`,
          confidence: "deterministic",
        });
      }
    }
  }

  if (intents.includes("goal") || intents.includes("general")) {
    sources.add("financial_profiles.goals");
    sources.add("financial_profiles.investments");

    if (arrays.goals.length === 0) {
      clarifyingQuestions.push("What financial goal should I analyze first (for example, emergency fund, home purchase, or retirement)?");
    } else {
      const firstGoal = arrays.goals[0];
      const goalTarget = num(firstGoal?.targetAmount);
      const horizonMonths = num(firstGoal?.horizonMonths) > 0 ? num(firstGoal.horizonMonths) : 60;
      const contribution = arrays.investments.length > 0 ? monthlyInvestments / arrays.goals.length : 0;

      const projection = projectCompoundInterest({
        initialPrincipal: 0,
        monthlyContribution: contribution,
        annualReturnPct: 8,
        years: Math.max(1, Math.round(horizonMonths / 12)),
      });

      if (projection.ok) {
        calculations.push({
          name: `Goal projection: ${firstGoal?.name || "Primary goal"}`,
          formula: "monthly contribution compounded monthly at 8% annual return",
          result: `Projected nominal value ${fmtMoney(projection.value.endingNominalValue, currencyCode)} in ${horizonMonths} months`,
          confidence: "estimated",
        });
        assumptions.push(
          "Goal projection uses a fixed 8% annual return assumption with monthly compounding and excludes taxes and fees.",
        );
      }

      if (goalTarget > 0) {
        const required = calculateRequiredMonthlyContribution({
          goalTarget,
          currentAmount: 0,
          annualReturnPct: 8,
          monthsToGoal: Math.max(1, Math.round(horizonMonths)),
        });

        if (required.ok) {
          calculations.push({
            name: `Required contribution: ${firstGoal?.name || "Primary goal"}`,
            formula: "future value of monthly contributions to reach target",
            result: `${fmtMoney(required.value.requiredMonthlyContribution, currencyCode)} per month`,
            confidence: "estimated",
          });
          estimates.push(required.value.assumptions);
        }
      }
    }
  }

  if (asksForScenario) {
    hypotheticalScenarios.push(
      "Your question appears hypothetical. Results should be interpreted as scenario analysis, not guaranteed outcomes.",
    );
  }

  assumptions.push("Tax calculations, market prices, and policy clauses are not inferred unless explicitly provided in trusted numeric inputs.");

  return {
    facts,
    estimates,
    assumptions,
    hypotheticalScenarios,
    calculations,
    clarifyingQuestions: Array.from(new Set(clarifyingQuestions)),
    sources: Array.from(sources),
    risks,
  };
}

import type { FinancialProfileRecord } from "@/features/profile/types";
import {
  adjustFutureValueForInflation,
  analyzeInvestmentAllocation,
  calculateEmergencyFundCoverage,
  calculateMonthlyCashFlow,
  calculateRequiredMonthlyContribution,
  computeBasicFinancialRatios,
  projectCompoundInterest,
  type AllocationSlice,
  type RatioDefinition,
} from "@/lib/finance/engine";

export type GoalProgress = {
  goalName: string;
  targetAmount: number;
  projectedNominal: number;
  projectedReal: number;
  requiredMonthlyContribution: number;
  horizonMonths: number;
  progressPctNominal: number;
};

export type DashboardFinanceModel = {
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyDebtPayments: number;
  monthlyInvestments: number;
  monthlyInsurance: number;
  monthlyOutflows: number;
  monthlySurplus: number;
  savingsRate: number;
  emergencyCoverageMonths: number;
  emergencyFundShortfall: number;
  investmentAllocation: AllocationSlice[];
  concentrationHhi: number;
  concentrationMaxWeightPct: number;
  ratios: RatioDefinition[];
  goalProgress: GoalProgress[];
};

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function buildDashboardFinanceModel(profile: FinancialProfileRecord): DashboardFinanceModel {
  const monthlyIncome = profile.monthly_take_home_salary ?? profile.monthly_gross_salary ?? 0;
  const monthlyExpenses = profile.monthly_expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const monthlyDebtPayments = profile.debts.reduce((sum, debt) => sum + debt.monthlyPayment, 0);
  const monthlyInvestments = profile.investments.reduce(
    (sum, investment) => sum + investment.monthlyContribution,
    0,
  );
  const monthlyInsurance = profile.insurances.reduce((sum, insurance) => sum + insurance.premium, 0);

  const cashFlow = calculateMonthlyCashFlow({
    monthlyIncome,
    monthlyEssentialExpenses: monthlyExpenses,
    monthlyDebtPayments,
    monthlyInsurancePremiums: monthlyInsurance,
    monthlyInvestments,
  });

  const emergencyFundAssumed = (profile.monthly_savings_target ?? 0) * 6;
  const emergency = calculateEmergencyFundCoverage({
    emergencyFundBalance: emergencyFundAssumed,
    monthlyEssentialExpenses: monthlyExpenses + monthlyDebtPayments,
    targetCoverageMonths: 6,
  });

  const allocation = analyzeInvestmentAllocation({
    holdings: profile.investments.map((investment) => ({
      name: investment.instrument,
      value: investment.monthlyContribution,
    })),
  });

  const ratios = computeBasicFinancialRatios({
    monthlyIncome,
    monthlyEssentialExpenses: monthlyExpenses,
    monthlyDebtPayments,
    monthlyInvestments,
    emergencyFundBalance: emergencyFundAssumed,
  });

  const goalProgress = profile.goals.map((goal) => {
    const horizonMonths = goal.horizonMonths ?? 60;

    const projection = projectCompoundInterest({
      initialPrincipal: 0,
      monthlyContribution: profile.goals.length > 0 ? monthlyInvestments / profile.goals.length : 0,
      annualReturnPct: 8,
      years: Math.max(1, Math.round(horizonMonths / 12)),
    });

    const nominal = projection.ok ? projection.value.endingNominalValue : 0;
    const inflation = adjustFutureValueForInflation({
      nominalFutureValue: nominal,
      annualInflationPct: 4,
      years: Math.max(1, Math.round(horizonMonths / 12)),
    });

    const required = calculateRequiredMonthlyContribution({
      goalTarget: goal.targetAmount,
      currentAmount: 0,
      annualReturnPct: 8,
      monthsToGoal: horizonMonths,
    });

    const projectedReal = inflation.ok ? inflation.value.inflationAdjustedFutureValue : 0;

    return {
      goalName: goal.name,
      targetAmount: goal.targetAmount,
      projectedNominal: nominal,
      projectedReal,
      requiredMonthlyContribution: required.ok ? required.value.requiredMonthlyContribution : 0,
      horizonMonths,
      progressPctNominal: clampPercent(goal.targetAmount > 0 ? (nominal / goal.targetAmount) * 100 : 0),
    };
  });

  return {
    monthlyIncome,
    monthlyExpenses,
    monthlyDebtPayments,
    monthlyInvestments,
    monthlyInsurance,
    monthlyOutflows: cashFlow.ok ? cashFlow.value.monthlyOutflows : 0,
    monthlySurplus: cashFlow.ok ? cashFlow.value.monthlySurplus : 0,
    savingsRate: cashFlow.ok ? cashFlow.value.savingsRate : 0,
    emergencyCoverageMonths: emergency.ok ? emergency.value.coverageMonths : 0,
    emergencyFundShortfall: emergency.ok ? emergency.value.shortfall : 0,
    investmentAllocation: allocation.ok ? allocation.value.slices : [],
    concentrationHhi: allocation.ok ? allocation.value.concentrationHhi : 0,
    concentrationMaxWeightPct: allocation.ok ? allocation.value.maxSingleAssetWeightPct : 0,
    ratios: ratios.ok ? ratios.value : [],
    goalProgress,
  };
}

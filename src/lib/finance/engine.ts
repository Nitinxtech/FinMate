/**
 * Finance engine notes:
 * - Monetary values are converted to integer cents for deterministic arithmetic.
 * - Percent rates are represented as percentages (e.g. 8 means 8%).
 * - Rounding strategy for money is half-away-from-zero at cent precision.
 * - Tax calculations are intentionally excluded from this module.
 */

export type Money = number;

export type ValidationIssue = {
  field: string;
  message: string;
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

export type CashFlowInput = {
  monthlyIncome: Money;
  monthlyEssentialExpenses: Money;
  monthlyDebtPayments?: Money;
  monthlyInsurancePremiums?: Money;
  monthlyInvestments?: Money;
};

export type CashFlowOutput = {
  monthlyIncome: Money;
  monthlyOutflows: Money;
  monthlySurplus: Money;
  savingsRate: number;
};

export type EmergencyFundInput = {
  emergencyFundBalance: Money;
  monthlyEssentialExpenses: Money;
  targetCoverageMonths?: number;
};

export type EmergencyFundOutput = {
  coverageMonths: number;
  targetCoverageMonths: number;
  targetFundAmount: Money;
  shortfall: Money;
};

export type LoanInput = {
  principal: Money;
  annualRatePct: number;
  tenureMonths: number;
  startMonthLabel?: string;
};

export type LoanEmiOutput = {
  monthlyEmi: Money;
  totalInterest: Money;
  totalRepayment: Money;
};

export type AmortizationEntry = {
  monthNumber: number;
  monthLabel: string;
  openingBalance: Money;
  interestPaid: Money;
  principalPaid: Money;
  closingBalance: Money;
};

export type LoanAmortizationOutput = LoanEmiOutput & {
  schedule: AmortizationEntry[];
};

export type CompoundProjectionInput = {
  initialPrincipal: Money;
  monthlyContribution: Money;
  annualReturnPct: number;
  years: number;
};

export type CompoundProjectionPoint = {
  year: number;
  nominalValue: Money;
};

export type CompoundProjectionOutput = {
  endingNominalValue: Money;
  totalContributions: Money;
  totalGrowth: Money;
  yearlySeries: CompoundProjectionPoint[];
};

export type InflationAdjustmentInput = {
  nominalFutureValue: Money;
  annualInflationPct: number;
  years: number;
};

export type InflationAdjustmentOutput = {
  nominalFutureValue: Money;
  inflationAdjustedFutureValue: Money;
  inflationFactor: number;
};

export type GoalContributionInput = {
  goalTarget: Money;
  currentAmount: Money;
  annualReturnPct: number;
  monthsToGoal: number;
};

export type GoalContributionOutput = {
  requiredMonthlyContribution: Money;
  assumptions: string;
};

export type AllocationHolding = {
  name: string;
  value: Money;
};

export type AllocationInput = {
  holdings: AllocationHolding[];
};

export type AllocationSlice = {
  name: string;
  value: Money;
  weightPct: number;
};

export type AllocationOutput = {
  totalValue: Money;
  slices: AllocationSlice[];
  concentrationHhi: number;
  maxSingleAssetWeightPct: number;
};

export type RatioDefinition = {
  key: string;
  label: string;
  definition: string;
  value: number;
};

export type RatioInput = {
  monthlyIncome: Money;
  monthlyEssentialExpenses: Money;
  monthlyDebtPayments: Money;
  monthlyInvestments: Money;
  emergencyFundBalance: Money;
};

function roundToCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100);
}

function fromCents(value: number): number {
  return roundToCents(value / 100);
}

function safeDivide(numerator: number, denominator: number): number {
  if (denominator === 0) {
    return 0;
  }

  return numerator / denominator;
}

function validateNonNegativeMoney(value: number, field: string): ValidationIssue[] {
  if (!Number.isFinite(value)) {
    return [{ field, message: "Value must be a finite number" }];
  }

  if (value < 0) {
    return [{ field, message: "Value must be zero or greater" }];
  }

  return [];
}

function validateRatePct(value: number, field: string, min = -99.99, max = 1000): ValidationIssue[] {
  if (!Number.isFinite(value)) {
    return [{ field, message: "Rate must be a finite number" }];
  }

  if (value < min || value > max) {
    return [{ field, message: `Rate must be between ${min}% and ${max}%` }];
  }

  return [];
}

function validatePositiveInteger(value: number, field: string): ValidationIssue[] {
  if (!Number.isInteger(value) || value <= 0) {
    return [{ field, message: "Value must be a positive integer" }];
  }

  return [];
}

function validationError<T>(issues: ValidationIssue[]): ValidationResult<T> {
  return { ok: false, issues };
}

export function calculateMonthlyCashFlow(input: CashFlowInput): ValidationResult<CashFlowOutput> {
  const issues: ValidationIssue[] = [
    ...validateNonNegativeMoney(input.monthlyIncome, "monthlyIncome"),
    ...validateNonNegativeMoney(input.monthlyEssentialExpenses, "monthlyEssentialExpenses"),
    ...validateNonNegativeMoney(input.monthlyDebtPayments ?? 0, "monthlyDebtPayments"),
    ...validateNonNegativeMoney(input.monthlyInsurancePremiums ?? 0, "monthlyInsurancePremiums"),
    ...validateNonNegativeMoney(input.monthlyInvestments ?? 0, "monthlyInvestments"),
  ];

  if (issues.length > 0) {
    return validationError(issues);
  }

  const monthlyIncomeCents = toCents(input.monthlyIncome);
  const outflowCents =
    toCents(input.monthlyEssentialExpenses) +
    toCents(input.monthlyDebtPayments ?? 0) +
    toCents(input.monthlyInsurancePremiums ?? 0) +
    toCents(input.monthlyInvestments ?? 0);

  const surplusCents = monthlyIncomeCents - outflowCents;

  const savingsRate = roundToCents(safeDivide(surplusCents, monthlyIncomeCents) * 100);

  return {
    ok: true,
    value: {
      monthlyIncome: fromCents(monthlyIncomeCents),
      monthlyOutflows: fromCents(outflowCents),
      monthlySurplus: fromCents(surplusCents),
      savingsRate,
    },
  };
}

export function calculateEmergencyFundCoverage(
  input: EmergencyFundInput,
): ValidationResult<EmergencyFundOutput> {
  const targetCoverageMonths = input.targetCoverageMonths ?? 6;

  const issues: ValidationIssue[] = [
    ...validateNonNegativeMoney(input.emergencyFundBalance, "emergencyFundBalance"),
    ...validateNonNegativeMoney(input.monthlyEssentialExpenses, "monthlyEssentialExpenses"),
    ...validatePositiveInteger(Math.round(targetCoverageMonths), "targetCoverageMonths"),
  ];

  if (issues.length > 0) {
    return validationError(issues);
  }

  const emergencyCents = toCents(input.emergencyFundBalance);
  const essentialCents = toCents(input.monthlyEssentialExpenses);

  const coverageMonths = essentialCents === 0 ? 0 : roundToCents(emergencyCents / essentialCents);
  const targetFundCents = essentialCents * targetCoverageMonths;
  const shortfallCents = Math.max(0, targetFundCents - emergencyCents);

  return {
    ok: true,
    value: {
      coverageMonths,
      targetCoverageMonths,
      targetFundAmount: fromCents(targetFundCents),
      shortfall: fromCents(shortfallCents),
    },
  };
}

export function calculateLoanEmi(input: LoanInput): ValidationResult<LoanEmiOutput> {
  const amortization = calculateLoanAmortization(input);

  if (!amortization.ok) {
    return amortization;
  }

  const { monthlyEmi, totalInterest, totalRepayment } = amortization.value;

  return {
    ok: true,
    value: {
      monthlyEmi,
      totalInterest,
      totalRepayment,
    },
  };
}

export function calculateLoanAmortization(input: LoanInput): ValidationResult<LoanAmortizationOutput> {
  const issues: ValidationIssue[] = [
    ...validateNonNegativeMoney(input.principal, "principal"),
    ...validateRatePct(input.annualRatePct, "annualRatePct", 0, 200),
    ...validatePositiveInteger(input.tenureMonths, "tenureMonths"),
  ];

  if (issues.length > 0) {
    return validationError(issues);
  }

  const principalCents = toCents(input.principal);
  const monthlyRate = input.annualRatePct / 100 / 12;

  let emi: number;
  if (monthlyRate === 0) {
    emi = principalCents / input.tenureMonths;
  } else {
    const factor = Math.pow(1 + monthlyRate, input.tenureMonths);
    emi = (principalCents * monthlyRate * factor) / (factor - 1);
  }

  let balance = principalCents;
  const emiCents = Math.round(emi);
  const schedule: AmortizationEntry[] = [];

  let totalInterestCents = 0;

  for (let month = 1; month <= input.tenureMonths; month += 1) {
    const interestCents = Math.round(balance * monthlyRate);
    const principalPaidCents = month === input.tenureMonths ? balance : Math.min(balance, emiCents - interestCents);
    const paymentCents = principalPaidCents + interestCents;
    const closingBalance = Math.max(0, balance - principalPaidCents);

    totalInterestCents += interestCents;

    schedule.push({
      monthNumber: month,
      monthLabel: `${input.startMonthLabel ?? "Month"} ${month}`,
      openingBalance: fromCents(balance),
      interestPaid: fromCents(interestCents),
      principalPaid: fromCents(principalPaidCents),
      closingBalance: fromCents(closingBalance),
    });

    balance = closingBalance;

    if (paymentCents <= 0 && closingBalance > 0) {
      return validationError([
        {
          field: "annualRatePct",
          message: "Rate and tenure combination results in non-amortizing loan",
        },
      ]);
    }
  }

  const totalRepaymentCents = principalCents + totalInterestCents;

  return {
    ok: true,
    value: {
      monthlyEmi: fromCents(emiCents),
      totalInterest: fromCents(totalInterestCents),
      totalRepayment: fromCents(totalRepaymentCents),
      schedule,
    },
  };
}

export function projectCompoundInterest(
  input: CompoundProjectionInput,
): ValidationResult<CompoundProjectionOutput> {
  const issues: ValidationIssue[] = [
    ...validateNonNegativeMoney(input.initialPrincipal, "initialPrincipal"),
    ...validateNonNegativeMoney(input.monthlyContribution, "monthlyContribution"),
    ...validateRatePct(input.annualReturnPct, "annualReturnPct", -99.99, 200),
    ...validatePositiveInteger(input.years, "years"),
  ];

  if (issues.length > 0) {
    return validationError(issues);
  }

  const monthlyRate = input.annualReturnPct / 100 / 12;
  const months = input.years * 12;

  let valueCents = toCents(input.initialPrincipal);
  const monthlyContributionCents = toCents(input.monthlyContribution);
  let totalContributionCents = toCents(input.initialPrincipal);

  const yearlySeries: CompoundProjectionPoint[] = [];

  for (let month = 1; month <= months; month += 1) {
    valueCents = Math.round(valueCents * (1 + monthlyRate));
    valueCents += monthlyContributionCents;
    totalContributionCents += monthlyContributionCents;

    if (month % 12 === 0) {
      yearlySeries.push({
        year: month / 12,
        nominalValue: fromCents(valueCents),
      });
    }
  }

  const growthCents = valueCents - totalContributionCents;

  return {
    ok: true,
    value: {
      endingNominalValue: fromCents(valueCents),
      totalContributions: fromCents(totalContributionCents),
      totalGrowth: fromCents(growthCents),
      yearlySeries,
    },
  };
}

export function adjustFutureValueForInflation(
  input: InflationAdjustmentInput,
): ValidationResult<InflationAdjustmentOutput> {
  const issues: ValidationIssue[] = [
    ...validateNonNegativeMoney(input.nominalFutureValue, "nominalFutureValue"),
    ...validateRatePct(input.annualInflationPct, "annualInflationPct", -50, 100),
    ...validatePositiveInteger(input.years, "years"),
  ];

  if (issues.length > 0) {
    return validationError(issues);
  }

  const inflationFactor = Math.pow(1 + input.annualInflationPct / 100, input.years);
  const adjusted = roundToCents(input.nominalFutureValue / inflationFactor);

  return {
    ok: true,
    value: {
      nominalFutureValue: roundToCents(input.nominalFutureValue),
      inflationAdjustedFutureValue: adjusted,
      inflationFactor: roundToCents(inflationFactor),
    },
  };
}

export function calculateRequiredMonthlyContribution(
  input: GoalContributionInput,
): ValidationResult<GoalContributionOutput> {
  const issues: ValidationIssue[] = [
    ...validateNonNegativeMoney(input.goalTarget, "goalTarget"),
    ...validateNonNegativeMoney(input.currentAmount, "currentAmount"),
    ...validateRatePct(input.annualReturnPct, "annualReturnPct", -99.99, 200),
    ...validatePositiveInteger(input.monthsToGoal, "monthsToGoal"),
  ];

  if (issues.length > 0) {
    return validationError(issues);
  }

  const targetCents = toCents(input.goalTarget);
  const currentCents = toCents(input.currentAmount);

  if (currentCents >= targetCents) {
    return {
      ok: true,
      value: {
        requiredMonthlyContribution: 0,
        assumptions:
          "Current amount already meets or exceeds target. Required contribution is zero under this assumption.",
      },
    };
  }

  const monthlyRate = input.annualReturnPct / 100 / 12;
  const months = input.monthsToGoal;

  let requiredContribution: number;

  if (monthlyRate === 0) {
    requiredContribution = (targetCents - currentCents) / months;
  } else {
    const futureCurrent = currentCents * Math.pow(1 + monthlyRate, months);
    const annuityFactor = (Math.pow(1 + monthlyRate, months) - 1) / monthlyRate;
    requiredContribution = (targetCents - futureCurrent) / annuityFactor;
  }

  return {
    ok: true,
    value: {
      requiredMonthlyContribution: fromCents(Math.max(0, Math.ceil(requiredContribution))),
      assumptions:
        "Contribution is assumed at month-end, constant nominal return, and no taxes/fees in this engine.",
    },
  };
}

export function analyzeInvestmentAllocation(
  input: AllocationInput,
): ValidationResult<AllocationOutput> {
  const issues: ValidationIssue[] = [];

  if (!Array.isArray(input.holdings) || input.holdings.length === 0) {
    issues.push({ field: "holdings", message: "At least one holding is required" });
  }

  input.holdings.forEach((holding, index) => {
    if (!holding.name || !holding.name.trim()) {
      issues.push({ field: `holdings[${index}].name`, message: "Name is required" });
    }

    issues.push(...validateNonNegativeMoney(holding.value, `holdings[${index}].value`));
  });

  if (issues.length > 0) {
    return validationError(issues);
  }

  const totalValueCents = input.holdings.reduce((sum, holding) => sum + toCents(holding.value), 0);

  const slices: AllocationSlice[] = input.holdings.map((holding) => {
    const valueCents = toCents(holding.value);
    const weightPct = totalValueCents === 0 ? 0 : roundToCents((valueCents / totalValueCents) * 100);

    return {
      name: holding.name,
      value: fromCents(valueCents),
      weightPct,
    };
  });

  const concentrationHhi = roundToCents(
    slices.reduce((sum, slice) => sum + Math.pow(slice.weightPct / 100, 2), 0),
  );

  const maxSingleAssetWeightPct = slices.reduce((max, slice) => Math.max(max, slice.weightPct), 0);

  return {
    ok: true,
    value: {
      totalValue: fromCents(totalValueCents),
      slices,
      concentrationHhi,
      maxSingleAssetWeightPct: roundToCents(maxSingleAssetWeightPct),
    },
  };
}

export function computeBasicFinancialRatios(input: RatioInput): ValidationResult<RatioDefinition[]> {
  const issues: ValidationIssue[] = [
    ...validateNonNegativeMoney(input.monthlyIncome, "monthlyIncome"),
    ...validateNonNegativeMoney(input.monthlyEssentialExpenses, "monthlyEssentialExpenses"),
    ...validateNonNegativeMoney(input.monthlyDebtPayments, "monthlyDebtPayments"),
    ...validateNonNegativeMoney(input.monthlyInvestments, "monthlyInvestments"),
    ...validateNonNegativeMoney(input.emergencyFundBalance, "emergencyFundBalance"),
  ];

  if (issues.length > 0) {
    return validationError(issues);
  }

  const income = input.monthlyIncome;
  const essential = input.monthlyEssentialExpenses;
  const debt = input.monthlyDebtPayments;
  const investments = input.monthlyInvestments;
  const emergency = input.emergencyFundBalance;

  const ratios: RatioDefinition[] = [
    {
      key: "savingsRate",
      label: "Savings Rate",
      definition: "(Monthly income - monthly essential expenses - debt payments) / monthly income",
      value: roundToCents(safeDivide(income - essential - debt, income) * 100),
    },
    {
      key: "debtToIncome",
      label: "Debt-to-Income Ratio",
      definition: "Monthly debt payments / monthly income",
      value: roundToCents(safeDivide(debt, income) * 100),
    },
    {
      key: "expenseToIncome",
      label: "Expense-to-Income Ratio",
      definition: "Monthly essential expenses / monthly income",
      value: roundToCents(safeDivide(essential, income) * 100),
    },
    {
      key: "investmentToIncome",
      label: "Investment Contribution Rate",
      definition: "Monthly investments / monthly income",
      value: roundToCents(safeDivide(investments, income) * 100),
    },
    {
      key: "emergencyCoverageMonths",
      label: "Emergency Coverage (Months)",
      definition: "Emergency fund balance / monthly essential expenses",
      value: roundToCents(safeDivide(emergency, essential)),
    },
  ];

  return { ok: true, value: ratios };
}

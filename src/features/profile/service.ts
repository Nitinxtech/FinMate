import {
  countryCurrencyStepSchema,
  employmentStepSchema,
  financialSnapshotStepSchema,
  monthlyCompensationStepSchema,
  onboardingInputSchema,
} from "@/features/profile/schemas";
import type {
  FinancialProfileRecord,
  OnboardingDerivedValues,
  OnboardingStep,
  OnboardingUserInput,
} from "@/features/profile/types";

export function computeDerivedValues(input: OnboardingUserInput): OnboardingDerivedValues {
  const ctcApplicableComponentsAnnual = (input.ctcComponents ?? [])
    .filter((component) => component.applies)
    .reduce((sum, component) => sum + (component.annualAmount ?? 0), 0);

  const ctcAnnual = input.ctcAnnual ?? 0;
  const ctcReconciliationDelta = Number((ctcAnnual - ctcApplicableComponentsAnnual).toFixed(2));

  const monthlyDeductionTotal = (input.monthlyDeductions ?? []).reduce(
    (sum, deduction) => sum + deduction.amount,
    0,
  );

  const monthlyExpenseTotal = (input.monthlyExpenses ?? []).reduce(
    (sum, expense) => sum + expense.amount,
    0,
  );

  return {
    ctcApplicableComponentsAnnual: Number(ctcApplicableComponentsAnnual.toFixed(2)),
    ctcReconciliationDelta,
    monthlyDeductionTotal: Number(monthlyDeductionTotal.toFixed(2)),
    monthlyExpenseTotal: Number(monthlyExpenseTotal.toFixed(2)),
  };
}

export function getNextStep(current: OnboardingStep): OnboardingStep {
  switch (current) {
    case "country_currency":
      return "employment";
    case "employment":
      return "monthly_compensation";
    case "monthly_compensation":
      return "financial_snapshot";
    case "financial_snapshot":
      return "review";
    case "review":
      return "review";
    default:
      return "country_currency";
  }
}

export function validateStepInput(step: OnboardingStep, input: unknown) {
  if (step === "country_currency") {
    return countryCurrencyStepSchema.parse(input);
  }

  if (step === "employment") {
    return employmentStepSchema.parse(input);
  }

  if (step === "monthly_compensation") {
    return monthlyCompensationStepSchema.parse(input);
  }

  if (step === "financial_snapshot") {
    return financialSnapshotStepSchema.parse(input);
  }

  return onboardingInputSchema.parse(input);
}

export function toFormDefaults(record: FinancialProfileRecord | null): OnboardingUserInput {
  if (!record) {
    return {
      countryCode: "",
      currencyCode: "",
      employmentType: "",
      ctcAnnual: undefined,
      ctcComponents: [{ name: "Base salary", applies: true, annualAmount: undefined }],
      monthlyGrossSalary: undefined,
      monthlyDeductions: [],
      monthlyTakeHomeSalary: undefined,
      monthlyExpenses: [],
      monthlySavingsTarget: 0,
      debts: [],
      insurances: [],
      investments: [],
      goals: [],
    };
  }

  return {
    countryCode: record.country_code ?? "",
    currencyCode: record.currency_code ?? "",
    employmentType: record.employment_type ?? "",
    ctcAnnual: record.ctc_annual ?? undefined,
    ctcComponents: record.ctc_components?.length
      ? record.ctc_components
      : [{ name: "Base salary", applies: true, annualAmount: undefined }],
    monthlyGrossSalary: record.monthly_gross_salary ?? undefined,
    monthlyDeductions: record.monthly_deductions ?? [],
    monthlyTakeHomeSalary: record.monthly_take_home_salary ?? undefined,
    monthlyExpenses: record.monthly_expenses ?? [],
    monthlySavingsTarget: record.monthly_savings_target ?? 0,
    debts: record.debts ?? [],
    insurances: record.insurances ?? [],
    investments: record.investments ?? [],
    goals: record.goals ?? [],
  };
}

export const onboardingSteps = [
  "country_currency",
  "employment",
  "monthly_compensation",
  "financial_snapshot",
  "review",
] as const;

export type OnboardingStep = (typeof onboardingSteps)[number];

export type CtcComponentInput = {
  name: string;
  applies: boolean;
  annualAmount?: number;
};

export type DeductionInput = {
  name: string;
  amount: number;
};

export type ExpenseInput = {
  category: string;
  amount: number;
};

export type DebtInput = {
  lender: string;
  monthlyPayment: number;
  outstandingBalance?: number;
};

export type InsuranceInput = {
  provider: string;
  premium: number;
};

export type InvestmentInput = {
  instrument: string;
  monthlyContribution: number;
};

export type GoalInput = {
  name: string;
  targetAmount: number;
  horizonMonths?: number;
};

export type OnboardingUserInput = {
  countryCode?: string;
  currencyCode?: string;
  employmentType?: string;
  ctcAnnual?: number;
  ctcComponents?: CtcComponentInput[];
  monthlyGrossSalary?: number;
  monthlyDeductions?: DeductionInput[];
  monthlyTakeHomeSalary?: number;
  monthlyExpenses?: ExpenseInput[];
  monthlySavingsTarget?: number;
  debts?: DebtInput[];
  insurances?: InsuranceInput[];
  investments?: InvestmentInput[];
  goals?: GoalInput[];
};

export type OnboardingDerivedValues = {
  ctcApplicableComponentsAnnual: number;
  ctcReconciliationDelta: number;
  monthlyDeductionTotal: number;
  monthlyExpenseTotal: number;
};

export type FinancialProfileRecord = {
  id: string;
  user_id: string;
  onboarding_step: OnboardingStep;
  onboarding_completed: boolean;
  country_code: string | null;
  currency_code: string | null;
  employment_type: string | null;
  ctc_annual: number | null;
  ctc_components: CtcComponentInput[];
  monthly_gross_salary: number | null;
  monthly_deductions: DeductionInput[];
  monthly_take_home_salary: number | null;
  monthly_expenses: ExpenseInput[];
  monthly_savings_target: number | null;
  debts: DebtInput[];
  insurances: InsuranceInput[];
  investments: InvestmentInput[];
  goals: GoalInput[];
  derived_values: OnboardingDerivedValues;
  created_at: string;
  updated_at: string;
};

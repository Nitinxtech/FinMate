import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ProfileField } from "@/lib/ai/copilot-plan";

type ExpenseItem = { category: string; amount: number };
type DebtItem = { lender: string; monthlyPayment: number; outstandingBalance?: number };
type InsuranceItem = { provider: string; premium: number };
type InvestmentItem = { instrument: string; monthlyContribution: number };
type GoalItem = { name: string; targetAmount: number; horizonMonths?: number };

export type CopilotProfileContext = {
  country_code?: string | null;
  currency_code?: string | null;
  employment_type?: string | null;
  ctc_annual?: number | null;
  monthly_gross_salary?: number | null;
  monthly_take_home_salary?: number | null;
  monthly_expenses?: ExpenseItem[];
  monthly_savings_target?: number | null;
  debts?: DebtItem[];
  insurances?: InsuranceItem[];
  investments?: InvestmentItem[];
  goals?: GoalItem[];
  onboarding_completed?: boolean;
};

function toSafeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

const COPILOT_PROFILE_SELECT = [
  "country_code",
  "currency_code",
  "employment_type",
  "ctc_annual",
  "monthly_gross_salary",
  "monthly_take_home_salary",
  "monthly_expenses",
  "monthly_savings_target",
  "debts",
  "insurances",
  "investments",
  "goals",
  "onboarding_completed",
].join(",");

export async function loadCopilotProfileContext(
  supabase: SupabaseClient<Database>,
  user: User,
  fields: ProfileField[],
): Promise<CopilotProfileContext | null> {
  void fields;

  const { data, error } = await supabase
    .from("financial_profiles")
    .select(COPILOT_PROFILE_SELECT)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load profile context: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const normalized = data as unknown as Record<string, unknown>;
  const context: CopilotProfileContext = {
    country_code: (normalized.country_code as string | null | undefined) ?? undefined,
    currency_code: (normalized.currency_code as string | null | undefined) ?? undefined,
    employment_type: (normalized.employment_type as string | null | undefined) ?? undefined,
    ctc_annual: (normalized.ctc_annual as number | null | undefined) ?? undefined,
    monthly_gross_salary:
      (normalized.monthly_gross_salary as number | null | undefined) ?? undefined,
    monthly_take_home_salary:
      (normalized.monthly_take_home_salary as number | null | undefined) ?? undefined,
    monthly_savings_target:
      (normalized.monthly_savings_target as number | null | undefined) ?? undefined,
    onboarding_completed:
      (normalized.onboarding_completed as boolean | undefined) ?? undefined,
  };

  if ("monthly_expenses" in normalized) {
    context.monthly_expenses = toSafeArray<ExpenseItem>(normalized.monthly_expenses);
  }
  if ("debts" in normalized) {
    context.debts = toSafeArray<DebtItem>(normalized.debts);
  }
  if ("insurances" in normalized) {
    context.insurances = toSafeArray<InsuranceItem>(normalized.insurances);
  }
  if ("investments" in normalized) {
    context.investments = toSafeArray<InvestmentItem>(normalized.investments);
  }
  if ("goals" in normalized) {
    context.goals = toSafeArray<GoalItem>(normalized.goals);
  }

  return context;
}

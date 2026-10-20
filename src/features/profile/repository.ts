import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { computeDerivedValues, getNextStep } from "@/features/profile/service";
import type {
  FinancialProfileRecord,
  OnboardingStep,
  OnboardingUserInput,
} from "@/features/profile/types";

type ProfileRow = Database["public"]["Tables"]["financial_profiles"]["Row"];

type ProfileUpdate = Partial<OnboardingUserInput> & {
  onboardingStep?: OnboardingStep;
  onboardingCompleted?: boolean;
};

function parseArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function parseObject<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as T;
  }

  return fallback;
}

function mapRow(row: ProfileRow): FinancialProfileRecord {
  return {
    id: row.id,
    user_id: row.user_id,
    onboarding_step: row.onboarding_step,
    onboarding_completed: row.onboarding_completed,
    country_code: row.country_code,
    currency_code: row.currency_code,
    employment_type: row.employment_type,
    ctc_annual: row.ctc_annual,
    ctc_components: parseArray(row.ctc_components),
    monthly_gross_salary: row.monthly_gross_salary,
    monthly_deductions: parseArray(row.monthly_deductions),
    monthly_take_home_salary: row.monthly_take_home_salary,
    monthly_expenses: parseArray(row.monthly_expenses),
    monthly_savings_target: row.monthly_savings_target,
    debts: parseArray(row.debts),
    insurances: parseArray(row.insurances),
    investments: parseArray(row.investments),
    goals: parseArray(row.goals),
    derived_values: parseObject(row.derived_values, {
      ctcApplicableComponentsAnnual: 0,
      ctcReconciliationDelta: 0,
      monthlyDeductionTotal: 0,
      monthlyExpenseTotal: 0,
    }),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getFinancialProfile(
  supabase: SupabaseClient<Database>,
  user: User,
): Promise<FinancialProfileRecord | null> {
  const { data, error } = await supabase
    .from("financial_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to fetch financial profile: ${error.message}`);
  }

  return data ? mapRow(data) : null;
}

export async function upsertFinancialProfile(
  supabase: SupabaseClient<Database>,
  user: User,
  update: ProfileUpdate,
): Promise<FinancialProfileRecord> {
  const existing = await getFinancialProfile(supabase, user);

  const mergedInput: OnboardingUserInput = {
    countryCode: update.countryCode ?? existing?.country_code ?? undefined,
    currencyCode: update.currencyCode ?? existing?.currency_code ?? undefined,
    employmentType: update.employmentType ?? existing?.employment_type ?? undefined,
    ctcAnnual: update.ctcAnnual ?? existing?.ctc_annual ?? undefined,
    ctcComponents: update.ctcComponents ?? existing?.ctc_components ?? undefined,
    monthlyGrossSalary: update.monthlyGrossSalary ?? existing?.monthly_gross_salary ?? undefined,
    monthlyDeductions: update.monthlyDeductions ?? existing?.monthly_deductions ?? undefined,
    monthlyTakeHomeSalary:
      update.monthlyTakeHomeSalary ?? existing?.monthly_take_home_salary ?? undefined,
    monthlyExpenses: update.monthlyExpenses ?? existing?.monthly_expenses ?? undefined,
    monthlySavingsTarget:
      update.monthlySavingsTarget ?? existing?.monthly_savings_target ?? undefined,
    debts: update.debts ?? existing?.debts ?? undefined,
    insurances: update.insurances ?? existing?.insurances ?? undefined,
    investments: update.investments ?? existing?.investments ?? undefined,
    goals: update.goals ?? existing?.goals ?? undefined,
  };

  const derivedValues = computeDerivedValues(mergedInput);

  const currentStep = update.onboardingStep ?? existing?.onboarding_step ?? "country_currency";

  const payload: Database["public"]["Tables"]["financial_profiles"]["Insert"] = {
    user_id: user.id,
    onboarding_step: update.onboardingCompleted ? "review" : getNextStep(currentStep),
    onboarding_completed: update.onboardingCompleted ?? existing?.onboarding_completed ?? false,
    country_code: mergedInput.countryCode ?? null,
    currency_code: mergedInput.currencyCode ?? null,
    employment_type: mergedInput.employmentType ?? null,
    ctc_annual: mergedInput.ctcAnnual ?? null,
    ctc_components: mergedInput.ctcComponents ?? [],
    monthly_gross_salary: mergedInput.monthlyGrossSalary ?? null,
    monthly_deductions: mergedInput.monthlyDeductions ?? [],
    monthly_take_home_salary: mergedInput.monthlyTakeHomeSalary ?? null,
    monthly_expenses: mergedInput.monthlyExpenses ?? [],
    monthly_savings_target: mergedInput.monthlySavingsTarget ?? null,
    debts: mergedInput.debts ?? [],
    insurances: mergedInput.insurances ?? [],
    investments: mergedInput.investments ?? [],
    goals: mergedInput.goals ?? [],
    derived_values: derivedValues,
  };

  const { data, error } = await supabase
    .from("financial_profiles")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Unable to save financial profile: ${error.message}`);
  }

  return mapRow(data);
}

"use client";

import { type ReactNode, useMemo, useState, useTransition } from "react";
import { CheckCircle2, ChevronRight, Plus, Sparkles } from "lucide-react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/loading-state";
import { notify } from "@/components/ui/notification-provider";
import {
  completeOnboardingAction,
  saveOnboardingStepAction,
  type ActionResult,
} from "@/features/profile/actions";
import { validateStepInput } from "@/features/profile/service";
import {
  onboardingSteps,
  type OnboardingStep,
  type OnboardingUserInput,
} from "@/features/profile/types";
import { countryCurrencyOptions, supportedCurrencies } from "@/lib/finance/country-currency";

type OnboardingWizardProps = {
  initialStep: OnboardingStep;
  initialValues: OnboardingUserInput;
  completed: boolean;
  mode?: "onboarding" | "profile";
};

type Preset = {
  name: string;
};

const ctcPresets: Preset[] = [
  { name: "Base Salary" },
  { name: "HRA" },
  { name: "Special Allowance" },
  { name: "Performance Bonus" },
  { name: "Employer PF" },
  { name: "Stock Compensation" },
  { name: "Retention Bonus" },
  { name: "Joining Bonus" },
];

const deductionPresets: Preset[] = [
  { name: "Income Tax (TDS)" },
  { name: "Employee PF" },
  { name: "Professional Tax" },
  { name: "Health Insurance" },
  { name: "Retirement Contribution" },
  { name: "Other Payroll Deduction" },
];

const expensePresets: Preset[] = [
  { name: "Rent / Mortgage" },
  { name: "Food & Groceries" },
  { name: "Utilities" },
  { name: "Transport" },
  { name: "Family Support" },
  { name: "Lifestyle" },
];

const debtPresets: Preset[] = [
  { name: "Home Loan" },
  { name: "Car Loan" },
  { name: "Personal Loan" },
  { name: "Education Loan" },
  { name: "Credit Card EMI" },
];

const insurancePresets: Preset[] = [
  { name: "Health Insurance" },
  { name: "Term Insurance" },
  { name: "Vehicle Insurance" },
  { name: "Home Insurance" },
];

const investmentPresets: Preset[] = [
  { name: "Mutual Funds" },
  { name: "Stocks / ETFs" },
  { name: "PPF" },
  { name: "NPS" },
  { name: "Fixed Deposits" },
  { name: "Gold" },
];

const goalPresets: Array<{ name: string; horizonMonths: number }> = [
  { name: "Emergency Fund", horizonMonths: 12 },
  { name: "Buy a House", horizonMonths: 120 },
  { name: "Buy a Car", horizonMonths: 48 },
  { name: "Child Education", horizonMonths: 180 },
  { name: "Retirement", horizonMonths: 240 },
  { name: "Wealth Creation", horizonMonths: 180 },
];

const stepMeta: Record<OnboardingStep, { title: string; description: string; short: string }> = {
  country_currency: {
    title: "Location and currency",
    description: "Set your planning country and preferred currency for all calculations.",
    short: "Country",
  },
  employment: {
    title: "Compensation and CTC breakdown",
    description:
      "Use presets or create your own fields. Fill only what applies, and edit names anytime.",
    short: "CTC",
  },
  monthly_compensation: {
    title: "Monthly pay and deductions",
    description: "Capture payroll deductions and compare estimated vs entered take-home salary.",
    short: "Monthly",
  },
  financial_snapshot: {
    title: "Expenses, liabilities, investments, and goals",
    description:
      "Build your monthly profile with flexible sections. Every list supports manual custom entries.",
    short: "Snapshot",
  },
  review: {
    title: "Review and finalize",
    description: "Confirm your profile and complete onboarding to unlock your live dashboard.",
    short: "Review",
  },
};

function getStepIndex(step: OnboardingStep) {
  return onboardingSteps.indexOf(step);
}

function normalizePayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizePayload(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, normalizePayload(nestedValue)]),
    );
  }

  if (typeof value === "number" && Number.isNaN(value)) {
    return undefined;
  }

  return value;
}

function payloadForStep(step: OnboardingStep, values: OnboardingUserInput) {
  if (step === "country_currency") {
    return {
      countryCode: values.countryCode,
      currencyCode: values.currencyCode,
    };
  }

  if (step === "employment") {
    return {
      employmentType: values.employmentType,
      ctcAnnual: values.ctcAnnual,
      ctcComponents: values.ctcComponents,
    };
  }

  if (step === "monthly_compensation") {
    return {
      monthlyGrossSalary: values.monthlyGrossSalary,
      monthlyDeductions: values.monthlyDeductions,
      monthlyTakeHomeSalary: values.monthlyTakeHomeSalary,
    };
  }

  if (step === "financial_snapshot") {
    return {
      monthlyExpenses: values.monthlyExpenses,
      monthlySavingsTarget: values.monthlySavingsTarget,
      debts: values.debts,
      insurances: values.insurances,
      investments: values.investments,
      goals: values.goals,
    };
  }

  return values;
}

function readMessage(result: ActionResult, fallback: string) {
  return result.message ?? fallback;
}

function toAmount(value: number | undefined): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

function formatCurrency(value: number, currencyCode: string) {
  const safeCode = currencyCode.length === 3 ? currencyCode : "USD";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: safeCode,
    maximumFractionDigits: 2,
  }).format(value);
}

function hasPreset(values: Array<{ name?: string }>, name: string): boolean {
  return values.some((item) => (item.name ?? "").trim().toLowerCase() === name.toLowerCase());
}

export function OnboardingWizard({
  initialStep,
  initialValues,
  completed,
  mode = "onboarding",
}: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(
    completed ? "review" : initialStep,
  );
  const [stepError, setStepError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const form = useForm<OnboardingUserInput>({
    defaultValues: initialValues,
    mode: "onChange",
  });

  const ctcComponents = useFieldArray({
    control: form.control,
    name: "ctcComponents",
  });
  const deductions = useFieldArray({
    control: form.control,
    name: "monthlyDeductions",
  });
  const expenses = useFieldArray({
    control: form.control,
    name: "monthlyExpenses",
  });
  const debts = useFieldArray({
    control: form.control,
    name: "debts",
  });
  const insurances = useFieldArray({
    control: form.control,
    name: "insurances",
  });
  const investments = useFieldArray({
    control: form.control,
    name: "investments",
  });
  const goals = useFieldArray({
    control: form.control,
    name: "goals",
  });

  const watched = useWatch({ control: form.control }) as OnboardingUserInput;

  const progress = useMemo(() => {
    const index = getStepIndex(currentStep);
    return Math.round(((index + 1) / onboardingSteps.length) * 100);
  }, [currentStep]);

  const currencyCode = watched.currencyCode || "USD";

  const calculations = useMemo(() => {
    const ctcAnnual = toAmount(watched.ctcAnnual);
    const ctcApplicableAnnual = (watched.ctcComponents ?? [])
      .filter((component) => component.applies)
      .reduce((sum, component) => sum + toAmount(component.annualAmount), 0);

    const monthlyDeductions = (watched.monthlyDeductions ?? []).reduce(
      (sum, deduction) => sum + toAmount(deduction.amount),
      0,
    );

    const monthlyGross = toAmount(watched.monthlyGrossSalary);
    const enteredTakeHome = toAmount(watched.monthlyTakeHomeSalary);
    const estimatedTakeHome = Math.max(0, monthlyGross - monthlyDeductions);

    const monthlyExpenses = (watched.monthlyExpenses ?? []).reduce(
      (sum, expense) => sum + toAmount(expense.amount),
      0,
    );
    const monthlyDebtPayments = (watched.debts ?? []).reduce(
      (sum, debt) => sum + toAmount(debt.monthlyPayment),
      0,
    );
    const monthlyInsurance = (watched.insurances ?? []).reduce(
      (sum, insurance) => sum + toAmount(insurance.premium),
      0,
    );
    const monthlyInvestments = (watched.investments ?? []).reduce(
      (sum, investment) => sum + toAmount(investment.monthlyContribution),
      0,
    );
    const monthlySavingsTarget = toAmount(watched.monthlySavingsTarget);

    const totalMonthlyPlan =
      monthlyExpenses +
      monthlyDebtPayments +
      monthlyInsurance +
      monthlyInvestments +
      monthlySavingsTarget;

    const monthlyBaseIncome = enteredTakeHome || estimatedTakeHome || monthlyGross;
    const monthlyFreeCash = monthlyBaseIncome - totalMonthlyPlan;

    return {
      ctcAnnual,
      ctcApplicableAnnual,
      ctcDelta: Number((ctcAnnual - ctcApplicableAnnual).toFixed(2)),
      monthlyDeductions,
      estimatedTakeHome,
      enteredTakeHome,
      monthlyExpenses,
      monthlyDebtPayments,
      monthlyInsurance,
      monthlyInvestments,
      monthlySavingsTarget,
      totalMonthlyPlan,
      monthlyBaseIncome,
      monthlyFreeCash,
    };
  }, [watched]);

  function moveStep(direction: "prev" | "next") {
    const index = getStepIndex(currentStep);
    const nextIndex =
      direction === "next"
        ? Math.min(index + 1, onboardingSteps.length - 1)
        : Math.max(index - 1, 0);

    setCurrentStep(onboardingSteps[nextIndex]);
  }

  function saveCurrentStep() {
    const rawValues = form.getValues();
    const cleanedValues = normalizePayload(rawValues) as OnboardingUserInput;
    const stepPayload = payloadForStep(currentStep, cleanedValues);

    try {
      validateStepInput(currentStep, stepPayload);
      setStepError(null);
    } catch (error) {
      setStepError(error instanceof Error ? error.message : "Validation failed");
      return;
    }

    startTransition(async () => {
      const result = await saveOnboardingStepAction({
        step: currentStep,
        payload: stepPayload as Record<string, unknown>,
      });

      if (!result.success) {
        const message = readMessage(result, "Unable to save step");
        setStepError(message);
        notify.error(message);
        return;
      }

      notify.success(readMessage(result, "Progress saved"));
      setStepError(null);

      if (currentStep !== "review") {
        moveStep("next");
      }
    });
  }

  function completeOnboarding() {
    const cleanedValues = normalizePayload(form.getValues()) as OnboardingUserInput;

    startTransition(async () => {
      const result = await completeOnboardingAction(cleanedValues as Record<string, unknown>);

      if (!result.success) {
        const message = readMessage(result, "Unable to complete onboarding");
        setStepError(message);
        notify.error(message);
        return;
      }

      notify.success(readMessage(result, "Onboarding complete"));
      setStepError(null);
    });
  }

  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden border-sky-200/60 bg-gradient-to-br from-sky-50 via-white to-emerald-50">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-sky-200/35 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-16 h-64 w-64 rounded-full bg-emerald-200/35 blur-3xl" />

        <CardContent className="relative p-4 sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-xl bg-sky-600 p-2 text-white">
              <Sparkles className="size-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-sky-900">
                {mode === "profile" ? "Profile editor" : "Dynamic onboarding"}
              </p>
              <p className="text-xs text-sky-800/70">
                Flexible fields, live calculations, and reusable presets.
              </p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
            <aside className="space-y-3 rounded-2xl border border-sky-100 bg-white/80 p-3 backdrop-blur">
              {onboardingSteps.map((step, index) => {
                const active = step === currentStep;
                const completedStep = index < getStepIndex(currentStep);

                return (
                  <button
                    key={step}
                    type="button"
                    onClick={() => setCurrentStep(step)}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                      active
                        ? "border-sky-400 bg-sky-50 shadow-sm"
                        : "border-transparent bg-white hover:border-sky-200"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`grid h-7 w-7 place-content-center rounded-full text-xs font-semibold ${
                          completedStep
                            ? "bg-emerald-500 text-white"
                            : active
                              ? "bg-sky-600 text-white"
                              : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {completedStep ? <CheckCircle2 className="size-4" /> : index + 1}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{stepMeta[step].short}</p>
                        <p className="text-xs text-slate-500">{stepMeta[step].title}</p>
                      </div>
                    </div>
                  </button>
                );
              })}

              <div className="rounded-xl border border-sky-100 bg-sky-50/70 p-3">
                <p className="text-xs font-medium text-sky-900">Completion</p>
                <p className="text-xl font-bold text-sky-950">{progress}%</p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-sky-100">
                  <div className="h-full bg-sky-600 transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
            </aside>

            <section>
              <Card className="border-slate-200 bg-white/95">
                <CardHeader>
                  <CardTitle className="text-2xl">{stepMeta[currentStep].title}</CardTitle>
                  <CardDescription>{stepMeta[currentStep].description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {stepError ? <ErrorState message={stepError} /> : null}
                  {isPending ? <LoadingState message="Saving your progress..." /> : null}

                  {currentStep === "country_currency" ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="countryCode">Country</Label>
                        <select
                          id="countryCode"
                          className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          {...form.register("countryCode")}
                        >
                          <option value="">Select country</option>
                          {countryCurrencyOptions.map((option) => (
                            <option key={option.countryCode} value={option.countryCode}>
                              {option.countryName}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="currencyCode">Currency</Label>
                        <select
                          id="currencyCode"
                          className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          {...form.register("currencyCode")}
                        >
                          <option value="">Select currency</option>
                          {supportedCurrencies.map((currency) => (
                            <option key={currency} value={currency}>
                              {currency}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ) : null}

                  {currentStep === "employment" ? (
                    <div className="space-y-5">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="employmentType">Employment type (optional)</Label>
                          <select
                            id="employmentType"
                            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            {...form.register("employmentType")}
                          >
                            <option value="">Select employment type</option>
                            <option value="full_time">Full-time</option>
                            <option value="contract">Contract</option>
                            <option value="self_employed">Self-employed</option>
                            <option value="part_time">Part-time</option>
                          </select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="ctcAnnual">Annual CTC (optional)</Label>
                          <Input
                            id="ctcAnnual"
                            type="number"
                            step="0.01"
                            placeholder="0"
                            {...form.register("ctcAnnual", { valueAsNumber: true })}
                          />
                        </div>
                      </div>

                      <div className="space-y-3 rounded-xl border p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">CTC components</p>
                            <p className="text-xs text-muted-foreground">
                              Add standard components instantly or type your own labels.
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              ctcComponents.append({ name: "", applies: true, annualAmount: undefined })
                            }
                          >
                            <Plus className="size-4" />
                            Add component
                          </Button>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {ctcPresets.map((preset) => (
                            <button
                              key={preset.name}
                              type="button"
                              className="rounded-full border border-sky-200 px-3 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50"
                              onClick={() => {
                                const values = form.getValues("ctcComponents") ?? [];
                                if (!hasPreset(values, preset.name)) {
                                  ctcComponents.append({
                                    name: preset.name,
                                    applies: true,
                                    annualAmount: undefined,
                                  });
                                }
                              }}
                            >
                              + {preset.name}
                            </button>
                          ))}
                        </div>

                        <div className="space-y-3">
                          {ctcComponents.fields.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No components yet. Use presets or add a custom component.
                            </p>
                          ) : (
                            ctcComponents.fields.map((field, index) => (
                              <div
                                key={field.id}
                                className="grid gap-3 rounded-lg border p-3 md:grid-cols-[2fr_1fr_auto_auto]"
                              >
                                <Input
                                  placeholder="Component name"
                                  {...form.register(`ctcComponents.${index}.name`)}
                                />
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="Annual amount"
                                  {...form.register(`ctcComponents.${index}.annualAmount`, {
                                    valueAsNumber: true,
                                  })}
                                />
                                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <input
                                    type="checkbox"
                                    className="size-4"
                                    {...form.register(`ctcComponents.${index}.applies`)}
                                  />
                                  Applies
                                </label>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => ctcComponents.remove(index)}
                                >
                                  Remove
                                </Button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-3">
                        <InsightCard
                          label="Applicable components"
                          value={formatCurrency(calculations.ctcApplicableAnnual, currencyCode)}
                        />
                        <InsightCard
                          label="Annual CTC"
                          value={formatCurrency(calculations.ctcAnnual, currencyCode)}
                        />
                        <InsightCard
                          label="Reconciliation delta"
                          value={formatCurrency(calculations.ctcDelta, currencyCode)}
                          tone={Math.abs(calculations.ctcDelta) <= 0.01 ? "good" : "warn"}
                        />
                      </div>
                    </div>
                  ) : null}

                  {currentStep === "monthly_compensation" ? (
                    <div className="space-y-5">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="monthlyGrossSalary">Monthly gross salary (optional)</Label>
                          <Input
                            id="monthlyGrossSalary"
                            type="number"
                            step="0.01"
                            placeholder="0"
                            {...form.register("monthlyGrossSalary", { valueAsNumber: true })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="monthlyTakeHomeSalary">Monthly take-home salary (optional)</Label>
                          <Input
                            id="monthlyTakeHomeSalary"
                            type="number"
                            step="0.01"
                            placeholder="0"
                            {...form.register("monthlyTakeHomeSalary", { valueAsNumber: true })}
                          />
                        </div>
                      </div>

                      <DynamicSimpleSection
                        title="Deductions"
                        helper="Add all known deductions. If unknown, skip and update later."
                        fields={deductions.fields}
                        presets={deductionPresets}
                        onAddEmpty={() => deductions.append({ name: "", amount: 0 })}
                        onAddPreset={(name) => {
                          const values = form.getValues("monthlyDeductions") ?? [];
                          if (!hasPreset(values, name)) {
                            deductions.append({ name, amount: 0 });
                          }
                        }}
                        onRemove={(index) => deductions.remove(index)}
                        renderRow={(index) => (
                          <>
                            <Input
                              placeholder="Deduction name"
                              {...form.register(`monthlyDeductions.${index}.name`)}
                            />
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Amount"
                              {...form.register(`monthlyDeductions.${index}.amount`, {
                                valueAsNumber: true,
                              })}
                            />
                          </>
                        )}
                      />

                      <div className="grid gap-3 md:grid-cols-3">
                        <InsightCard
                          label="Deduction total"
                          value={formatCurrency(calculations.monthlyDeductions, currencyCode)}
                        />
                        <InsightCard
                          label="Estimated take-home"
                          value={formatCurrency(calculations.estimatedTakeHome, currencyCode)}
                        />
                        <InsightCard
                          label="Entered take-home gap"
                          value={formatCurrency(
                            calculations.enteredTakeHome - calculations.estimatedTakeHome,
                            currencyCode,
                          )}
                        />
                      </div>
                    </div>
                  ) : null}

                  {currentStep === "financial_snapshot" ? (
                    <div className="space-y-5">
                      <div className="space-y-2">
                        <Label htmlFor="monthlySavingsTarget">Monthly savings target (optional)</Label>
                        <Input
                          id="monthlySavingsTarget"
                          type="number"
                          step="0.01"
                          placeholder="0"
                          {...form.register("monthlySavingsTarget", { valueAsNumber: true })}
                        />
                      </div>

                      <DynamicSimpleSection
                        title="Monthly expenses"
                        helper="Add essentials first, then discretionary categories."
                        fields={expenses.fields}
                        presets={expensePresets}
                        onAddEmpty={() => expenses.append({ category: "", amount: 0 })}
                        onAddPreset={(name) => {
                          const values = (form.getValues("monthlyExpenses") ?? []).map((entry) => ({
                            name: entry.category,
                          }));
                          if (!hasPreset(values, name)) {
                            expenses.append({ category: name, amount: 0 });
                          }
                        }}
                        onRemove={(index) => expenses.remove(index)}
                        renderRow={(index) => (
                          <>
                            <Input
                              placeholder="Category"
                              {...form.register(`monthlyExpenses.${index}.category`)}
                            />
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Amount"
                              {...form.register(`monthlyExpenses.${index}.amount`, {
                                valueAsNumber: true,
                              })}
                            />
                          </>
                        )}
                      />

                      <DynamicSimpleSection
                        title="Loans and EMIs"
                        helper="Track your monthly debt obligations."
                        fields={debts.fields}
                        presets={debtPresets}
                        onAddEmpty={() =>
                          debts.append({ lender: "", monthlyPayment: 0, outstandingBalance: 0 })
                        }
                        onAddPreset={(name) => {
                          const values = (form.getValues("debts") ?? []).map((entry) => ({
                            name: entry.lender,
                          }));
                          if (!hasPreset(values, name)) {
                            debts.append({ lender: name, monthlyPayment: 0, outstandingBalance: 0 });
                          }
                        }}
                        onRemove={(index) => debts.remove(index)}
                        renderRow={(index) => (
                          <>
                            <Input placeholder="Loan name" {...form.register(`debts.${index}.lender`)} />
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Monthly payment"
                              {...form.register(`debts.${index}.monthlyPayment`, {
                                valueAsNumber: true,
                              })}
                            />
                          </>
                        )}
                      />

                      <DynamicSimpleSection
                        title="Insurance"
                        helper="Enter monthly premium commitments."
                        fields={insurances.fields}
                        presets={insurancePresets}
                        onAddEmpty={() => insurances.append({ provider: "", premium: 0 })}
                        onAddPreset={(name) => {
                          const values = (form.getValues("insurances") ?? []).map((entry) => ({
                            name: entry.provider,
                          }));
                          if (!hasPreset(values, name)) {
                            insurances.append({ provider: name, premium: 0 });
                          }
                        }}
                        onRemove={(index) => insurances.remove(index)}
                        renderRow={(index) => (
                          <>
                            <Input
                              placeholder="Policy name"
                              {...form.register(`insurances.${index}.provider`)}
                            />
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Monthly premium"
                              {...form.register(`insurances.${index}.premium`, {
                                valueAsNumber: true,
                              })}
                            />
                          </>
                        )}
                      />

                      <DynamicSimpleSection
                        title="Investments"
                        helper="Add your recurring monthly contributions by instrument."
                        fields={investments.fields}
                        presets={investmentPresets}
                        onAddEmpty={() => investments.append({ instrument: "", monthlyContribution: 0 })}
                        onAddPreset={(name) => {
                          const values = (form.getValues("investments") ?? []).map((entry) => ({
                            name: entry.instrument,
                          }));
                          if (!hasPreset(values, name)) {
                            investments.append({ instrument: name, monthlyContribution: 0 });
                          }
                        }}
                        onRemove={(index) => investments.remove(index)}
                        renderRow={(index) => (
                          <>
                            <Input
                              placeholder="Instrument"
                              {...form.register(`investments.${index}.instrument`)}
                            />
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Monthly contribution"
                              {...form.register(`investments.${index}.monthlyContribution`, {
                                valueAsNumber: true,
                              })}
                            />
                          </>
                        )}
                      />

                      <div className="space-y-3 rounded-xl border p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">Financial goals</p>
                            <p className="text-xs text-muted-foreground">
                              Use common goal presets or enter your own custom target.
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => goals.append({ name: "", targetAmount: 0, horizonMonths: 12 })}
                          >
                            <Plus className="size-4" />
                            Add goal
                          </Button>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {goalPresets.map((preset) => (
                            <button
                              key={preset.name}
                              type="button"
                              className="rounded-full border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                              onClick={() => {
                                const values = form.getValues("goals") ?? [];
                                if (!hasPreset(values, preset.name)) {
                                  goals.append({
                                    name: preset.name,
                                    targetAmount: 0,
                                    horizonMonths: preset.horizonMonths,
                                  });
                                }
                              }}
                            >
                              + {preset.name}
                            </button>
                          ))}
                        </div>

                        <div className="space-y-3">
                          {goals.fields.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No goals added yet.</p>
                          ) : (
                            goals.fields.map((field, index) => (
                              <div
                                key={field.id}
                                className="grid gap-3 rounded-lg border p-3 md:grid-cols-[2fr_1fr_1fr_auto]"
                              >
                                <Input
                                  placeholder="Goal name"
                                  {...form.register(`goals.${index}.name`)}
                                />
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="Target amount"
                                  {...form.register(`goals.${index}.targetAmount`, {
                                    valueAsNumber: true,
                                  })}
                                />
                                <Input
                                  type="number"
                                  placeholder="Horizon months"
                                  {...form.register(`goals.${index}.horizonMonths`, {
                                    valueAsNumber: true,
                                  })}
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => goals.remove(index)}
                                >
                                  Remove
                                </Button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-3">
                        <InsightCard
                          label="Monthly planned outflow"
                          value={formatCurrency(calculations.totalMonthlyPlan, currencyCode)}
                        />
                        <InsightCard
                          label="Income base"
                          value={formatCurrency(calculations.monthlyBaseIncome, currencyCode)}
                        />
                        <InsightCard
                          label="Monthly free cash"
                          value={formatCurrency(calculations.monthlyFreeCash, currencyCode)}
                          tone={calculations.monthlyFreeCash >= 0 ? "good" : "warn"}
                        />
                      </div>
                    </div>
                  ) : null}

                  {currentStep === "review" ? (
                    <div className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                        <ReviewStat
                          label="CTC components"
                          value={`${watched.ctcComponents?.length ?? 0}`}
                        />
                        <ReviewStat
                          label="Deductions"
                          value={`${watched.monthlyDeductions?.length ?? 0}`}
                        />
                        <ReviewStat
                          label="Investments"
                          value={`${watched.investments?.length ?? 0}`}
                        />
                        <ReviewStat label="Goals" value={`${watched.goals?.length ?? 0}`} />
                      </div>

                      <div className="space-y-3 rounded-xl border p-4 text-sm">
                        <p className="font-semibold text-slate-900">Final checks</p>
                        <p className="text-muted-foreground">
                          Country: {watched.countryCode || "Not set"} | Currency: {watched.currencyCode || "Not set"}
                        </p>
                        <p className="text-muted-foreground">
                          Annual CTC: {formatCurrency(calculations.ctcAnnual, currencyCode)} | Component total: {formatCurrency(calculations.ctcApplicableAnnual, currencyCode)}
                        </p>
                        <p className="text-muted-foreground">
                          Estimated monthly take-home: {formatCurrency(calculations.estimatedTakeHome, currencyCode)} | Monthly free cash: {formatCurrency(calculations.monthlyFreeCash, currencyCode)}
                        </p>
                        <p className="flex items-center gap-2 text-xs text-slate-500">
                          <CheckCircle2 className="size-4 text-emerald-600" />
                          These values update dynamically from your form entries. You can revisit any step before submitting.
                        </p>
                      </div>
                    </div>
                  ) : null}

                  <footer className="flex flex-wrap items-center gap-3 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => moveStep("prev")}
                      disabled={getStepIndex(currentStep) === 0 || isPending}
                    >
                      Back
                    </Button>

                    {currentStep !== "review" ? (
                      <Button type="button" onClick={saveCurrentStep} disabled={isPending}>
                        Continue
                        <ChevronRight className="size-4" />
                      </Button>
                    ) : (
                      <Button type="button" onClick={completeOnboarding} disabled={isPending}>
                        Complete setup
                      </Button>
                    )}

                    <Button type="button" variant="secondary" onClick={saveCurrentStep} disabled={isPending}>
                      Save draft
                    </Button>
                  </footer>
                </CardContent>
              </Card>
            </section>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

type DynamicSimpleSectionProps = {
  title: string;
  helper: string;
  fields: Array<{ id: string }>;
  presets: Preset[];
  onAddEmpty: () => void;
  onAddPreset: (name: string) => void;
  onRemove: (index: number) => void;
  renderRow: (index: number) => ReactNode;
};

function DynamicSimpleSection({
  title,
  helper,
  fields,
  presets,
  onAddEmpty,
  onAddPreset,
  onRemove,
  renderRow,
}: DynamicSimpleSectionProps) {
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{helper}</p>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={onAddEmpty}>
          <Plus className="size-4" />
          Add
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <button
            key={preset.name}
            type="button"
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
            onClick={() => onAddPreset(preset.name)}
          >
            + {preset.name}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">No entries yet.</p>
        ) : (
          fields.map((field, index) => (
            <div key={field.id} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[2fr_1fr_auto]">
              {renderRow(index)}
              <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(index)}>
                Remove
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

type InsightCardProps = {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn";
};

function InsightCard({ label, value, tone = "neutral" }: InsightCardProps) {
  const toneClass =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-slate-200 bg-slate-50 text-slate-900";

  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <p className="text-xs uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-base font-semibold">{value}</p>
    </div>
  );
}

type ReviewStatProps = {
  label: string;
  value: string;
};

function ReviewStat({ label, value }: ReviewStatProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

import { z } from "zod";
import { onboardingSteps } from "@/features/profile/types";

const positiveAmount = z.coerce.number().finite().nonnegative();

export const ctcComponentSchema = z
  .object({
    name: z.string().trim().min(1, "Component name is required"),
    applies: z.boolean(),
    annualAmount: positiveAmount.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.applies && value.annualAmount === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["annualAmount"],
        message: "Add amount or toggle off applies",
      });
    }
  });

export const deductionSchema = z.object({
  name: z.string().trim().min(1, "Deduction name is required"),
  amount: positiveAmount,
});

export const expenseSchema = z.object({
  category: z.string().trim().min(1, "Expense category is required"),
  amount: positiveAmount,
});

export const debtSchema = z.object({
  lender: z.string().trim().min(1, "Lender is required"),
  monthlyPayment: positiveAmount,
  outstandingBalance: positiveAmount.optional(),
});

export const insuranceSchema = z.object({
  provider: z.string().trim().min(1, "Provider is required"),
  premium: positiveAmount,
});

export const investmentSchema = z.object({
  instrument: z.string().trim().min(1, "Instrument is required"),
  monthlyContribution: positiveAmount,
});

export const goalSchema = z.object({
  name: z.string().trim().min(1, "Goal name is required"),
  targetAmount: positiveAmount,
  horizonMonths: z.coerce.number().int().positive().optional(),
});

export const countryCurrencyStepSchema = z.object({
  countryCode: z.string().trim().length(2, "Use a 2-letter country code").optional(),
  currencyCode: z.string().trim().length(3, "Use a 3-letter currency code").optional(),
});

export const employmentStepBaseSchema = z.object({
  employmentType: z.string().trim().optional(),
  ctcAnnual: z.coerce.number().finite().nonnegative("CTC cannot be negative").optional(),
  ctcComponents: z.array(ctcComponentSchema).optional(),
});

export const employmentStepSchema = employmentStepBaseSchema.superRefine((_value, ctx) => {
  const components = _value.ctcComponents ?? [];

  components.forEach((component, index) => {
    if (component.applies && component.annualAmount === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["ctcComponents", index, "annualAmount"],
        message: "Add amount or toggle off applies",
      });
    }
  });
});

export const monthlyCompensationStepSchema = z.object({
  monthlyGrossSalary: z.coerce
    .number()
    .finite()
    .nonnegative("Gross salary cannot be negative")
    .optional(),
  monthlyDeductions: z.array(deductionSchema).optional(),
  monthlyTakeHomeSalary: z.coerce
    .number()
    .finite()
    .nonnegative("Take-home salary cannot be negative")
    .optional(),
});

export const financialSnapshotStepSchema = z.object({
  monthlyExpenses: z.array(expenseSchema).optional(),
  monthlySavingsTarget: z.coerce
    .number()
    .finite()
    .nonnegative("Savings target cannot be negative")
    .optional(),
  debts: z.array(debtSchema).optional(),
  insurances: z.array(insuranceSchema).optional(),
  investments: z.array(investmentSchema).optional(),
  goals: z.array(goalSchema).optional(),
});

export const reviewStepSchema = z.object({
  acceptReview: z.boolean().refine((value) => value, "Please confirm review before finishing"),
});

export const onboardingInputSchema = countryCurrencyStepSchema
  .partial()
  .merge(employmentStepBaseSchema.partial())
  .merge(monthlyCompensationStepSchema.partial())
  .merge(financialSnapshotStepSchema.partial());

export const onboardingStepSchema = z.enum(onboardingSteps);

export const authSignInSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const authSignUpSchema = authSignInSchema
  .extend({
    confirmPassword: z.string().min(8, "Confirm your password"),
  })
  .superRefine((value, ctx) => {
    if (value.password !== value.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "Passwords do not match",
      });
    }
  });

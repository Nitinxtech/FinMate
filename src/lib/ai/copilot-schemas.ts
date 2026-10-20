import { z } from "zod";

export const copilotAttachmentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(6000),
});

export const copilotWebpageSchema = z.object({
  url: z.url(),
  content: z.string().trim().min(1).max(6000),
});

export const copilotHistoryMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(1200),
});

export const copilotRequestSchema = z.object({
  question: z.string().trim().min(5).max(1200),
  hypothetical: z.boolean().optional().default(false),
  attachments: z.array(copilotAttachmentSchema).max(3).optional().default([]),
  webpages: z.array(copilotWebpageSchema).max(3).optional().default([]),
  history: z.array(copilotHistoryMessageSchema).max(12).optional().default([]),
});

export type CopilotRequest = z.infer<typeof copilotRequestSchema>;

export const copilotNarrativeSchema = z.object({
  answer: z.string().trim().min(1).max(2400),
  risks: z.array(z.string().trim().min(1).max(240)).max(6).default([]),
  nextSteps: z.array(z.string().trim().min(1).max(240)).max(6).default([]),
  uncertainty: z.string().trim().max(420).default(""),
});

export type CopilotNarrative = z.infer<typeof copilotNarrativeSchema>;

export const copilotCalculationSchema = z.object({
  name: z.string().trim().min(1),
  formula: z.string().trim().min(1),
  result: z.string().trim().min(1),
  confidence: z.enum(["deterministic", "estimated"]),
});

export type CopilotCalculation = z.infer<typeof copilotCalculationSchema>;

export const copilotRoadmapSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  tag: z.enum(["recommended", "safest", "fastest", "costly"]).optional(),
  fit: z.enum(["comfortable", "tight", "stretch"]),
  upfront: z.number(),
  monthly: z.number(),
  months: z.number(),
  monthsToOwn: z.number(),
  totalCost: z.number(),
  extraCost: z.number(),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  steps: z.array(z.string()),
});

export const copilotReadinessSchema = z.object({
  readyNow: z.boolean(),
  readyInMonths: z.number(),
  maxPriceToday: z.number(),
  comfortableEmi: z.number(),
  standardEmi: z.number(),
  standardTenure: z.number(),
  incomeNow: z.number(),
  incomeNeeded: z.number(),
  runningCost: z.number(),
  steps: z.array(z.object({ title: z.string(), detail: z.string(), months: z.number() })),
  checks: z.array(
    z.object({
      label: z.string(),
      haveText: z.string(),
      needText: z.string(),
      progress: z.number(),
      status: z.enum(["ok", "warn", "bad"]),
    }),
  ),
});

export const copilotPurchasePlanSchema = z.object({
  itemLabel: z.string(),
  targetAmount: z.number(),
  priceAssumed: z.boolean(),
  monthlySurplus: z.number(),
  currencyCode: z.string(),
  inputs: z.array(z.object({ label: z.string(), value: z.string(), assumed: z.boolean() })),
  readiness: copilotReadinessSchema,
  roadmaps: z.array(copilotRoadmapSchema).min(1),
  recommendedId: z.string(),
  takeaway: z.string(),
});

export type CopilotPurchasePlan = z.infer<typeof copilotPurchasePlanSchema>;

export const copilotResponseSchema = z.object({
  status: z.enum(["ok", "needs_clarification", "error"]),
  answer: z.string().trim().min(1),
  facts: z.array(z.string()).default([]),
  estimates: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  hypotheticalScenarios: z.array(z.string()).default([]),
  calculations: z.array(copilotCalculationSchema).default([]),
  sources: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  nextSteps: z.array(z.string()).default([]),
  clarifyingQuestions: z.array(z.string()).default([]),
  uncertainty: z.string().default(""),
  plan: copilotPurchasePlanSchema.optional(),
});

export type CopilotResponse = z.infer<typeof copilotResponseSchema>;

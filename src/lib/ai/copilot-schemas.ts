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
  uncertainty: z.string().trim().min(1).max(420),
});

export type CopilotNarrative = z.infer<typeof copilotNarrativeSchema>;

export const copilotCalculationSchema = z.object({
  name: z.string().trim().min(1),
  formula: z.string().trim().min(1),
  result: z.string().trim().min(1),
  confidence: z.enum(["deterministic", "estimated"]),
});

export type CopilotCalculation = z.infer<typeof copilotCalculationSchema>;

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
});

export type CopilotResponse = z.infer<typeof copilotResponseSchema>;

import { z } from "zod";

export const POLICY_TYPES = ["health", "life", "motor", "travel", "home", "personal_accident", "other"] as const;
export type PolicyType = (typeof POLICY_TYPES)[number];

export const FACT_CATEGORIES = [
  "sum_insured",
  "coverage",
  "exclusion",
  "waiting_period",
  "sub_limit",
  "deductible",
  "co_payment",
  "premium",
  "renewal",
  "claim_procedure",
  "cancellation",
  "definition",
] as const;
export type FactCategory = (typeof FACT_CATEGORIES)[number];

export const FACT_CATEGORY_LABELS: Record<FactCategory, string> = {
  sum_insured: "Sum insured / limit",
  coverage: "Coverage",
  exclusion: "Exclusions",
  waiting_period: "Waiting periods",
  sub_limit: "Sub-limits",
  deductible: "Deductibles",
  co_payment: "Co-payments",
  premium: "Premium",
  renewal: "Renewal conditions",
  claim_procedure: "Claim procedure",
  cancellation: "Cancellation",
  definition: "Definitions",
};

export const citationSchema = z.object({
  documentId: z.string(),
  documentTitle: z.string(),
  page: z.number().int().min(1),
  clauseRef: z.string().nullable(),
  quote: z.string(),
});
export type Citation = z.infer<typeof citationSchema>;

export const factSchema = z.object({
  id: z.string(),
  category: z.enum(FACT_CATEGORIES),
  label: z.string(),
  value: z.string().nullable(),
  amount: z.number().nullable(),
  percent: z.number().nullable(),
  days: z.number().nullable(),
  currency: z.string().nullable(),
  qualifiers: z.array(z.string()),
  hedges: z.array(z.string()),
  // "explicit" means the quote is verbatim policy text; interpretation is always labelled separately.
  basis: z.literal("explicit"),
  citation: citationSchema,
});
export type Fact = z.infer<typeof factSchema>;

export const issueSchema = z.object({
  kind: z.enum(["conflict", "ambiguity", "quality", "limitation"]),
  severity: z.enum(["info", "warning"]),
  message: z.string(),
  citations: z.array(citationSchema),
});
export type Issue = z.infer<typeof issueSchema>;

export const notLocatedSchema = z.object({
  category: z.enum(FACT_CATEGORIES),
  message: z.string(),
});

export const extractionSchema = z.object({
  facts: z.array(factSchema),
  notLocated: z.array(notLocatedSchema),
  issues: z.array(issueSchema),
  insurer: z.string().nullable(),
  policyName: z.string().nullable(),
  generatedBy: z.enum(["rules", "rules+llm"]),
  version: z.number(),
});
export type Extraction = z.infer<typeof extractionSchema>;

export type PageText = { page: number; text: string; source: "text" | "ocr" };

export type Clause = {
  index: number;
  ref: string | null;
  heading: string | null;
  section: string | null;
  page: number;
  continued: boolean;
  text: string;
};

export type DocumentMeta = { id: string; title: string };

export type Classification = {
  type: PolicyType;
  isInsurancePolicy: boolean;
  confidence: number;
  ambiguous: boolean;
  runnerUp: PolicyType | null;
  signals: Array<{ term: string; page: number; type: PolicyType }>;
};

export const POLICY_DISCLAIMER =
  "This is an automated reading of the document you provided, not legal or insurance advice. Actual claim outcomes depend on the full policy (including schedule and endorsements), applicable law, and the insurer's own assessment. Nothing here guarantees that any claim will be accepted.";

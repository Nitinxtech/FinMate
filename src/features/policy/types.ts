import type { Classification, PolicyType } from "@/lib/policy/types";

// Client-safe: this file must not import anything marked server-only.
export type PolicyStatus = "uploaded" | "processing" | "ready" | "failed";

export type PolicyDocumentSummary = {
  id: string;
  title: string;
  sourceKind: "upload" | "url";
  sourceUrl: string | null;
  originalFilename: string | null;
  pageCount: number | null;
  status: PolicyStatus;
  statusDetail: string | null;
  ocr: { done: number; total: number };
  policyType: PolicyType;
  typeConfidence: number | null;
  isInsurancePolicy: boolean;
  classification: Classification | null;
  insurer: string | null;
  factCount: number;
  issueCount: number;
  createdAt: string;
  fileExpiresAt: string | null;
  hasTemporaryFile: boolean;
};

import type { PolicyType } from "@/lib/policy/types";
import type { PolicyStatus } from "@/features/policy/types";

export const POLICY_TYPE_LABELS: Record<PolicyType, string> = {
  health: "Health",
  life: "Life",
  motor: "Motor",
  travel: "Travel",
  home: "Home",
  personal_accident: "Personal accident",
  other: "Other / unrecognised",
};

export const STATUS_STYLES: Record<PolicyStatus, { label: string; className: string }> = {
  uploaded: { label: "Waiting to process", className: "border-slate-200 bg-slate-50 text-slate-600" },
  processing: { label: "Processing", className: "border-cyan-200 bg-cyan-50 text-cyan-700" },
  ready: { label: "Ready", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  failed: { label: "Failed", className: "border-rose-200 bg-rose-50 text-rose-700" },
};

export function citationLabel(citation: { page: number; clauseRef: string | null }): string {
  return `p.${citation.page}${citation.clauseRef ? ` \u00B7 clause ${citation.clauseRef}` : ""}`;
}

export function viewerHref(documentId: string, citation: { page: number; clauseRef: string | null }): string {
  const params = new URLSearchParams({ page: String(citation.page) });
  if (citation.clauseRef) {
    params.set("clause", citation.clauseRef);
  }
  return `/dashboard/policies/${documentId}?${params.toString()}`;
}

export async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : fallback;
  } catch {
    return fallback;
  }
}

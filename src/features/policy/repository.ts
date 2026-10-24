import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { POLICY_BUCKET } from "@/lib/policy/limits";
import { PolicyInputError } from "@/lib/policy/file-validation";
import type { PolicyDocumentSummary } from "@/features/policy/types";
import {
  extractionSchema,
  type Classification,
  type Clause,
  type Extraction,
  type PageText,
} from "@/lib/policy/types";
import type { Database, Json, PolicyClauseRow, PolicyDocumentRow, PolicyPageRow } from "@/types/database";

type Client = SupabaseClient<Database>;

export type { PolicyDocumentSummary };

function parseExtraction(value: Json): Extraction | null {
  const parsed = extractionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseClassification(value: Json): Classification | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Partial<Classification>;
  return typeof candidate.type === "string" && Array.isArray(candidate.signals) ? (candidate as Classification) : null;
}

export function summarize(row: PolicyDocumentRow): PolicyDocumentSummary {
  const extraction = parseExtraction(row.extraction);
  return {
    id: row.id,
    title: row.title,
    sourceKind: row.source_kind,
    sourceUrl: row.source_url,
    originalFilename: row.original_filename,
    pageCount: row.page_count,
    status: row.status,
    statusDetail: row.status_detail,
    ocr: { done: Math.max(0, row.ocr_total - row.pending_ocr_pages.length), total: row.ocr_total },
    policyType: row.policy_type,
    typeConfidence: row.type_confidence,
    isInsurancePolicy: row.is_insurance_policy,
    classification: parseClassification(row.classification),
    insurer: row.insurer,
    factCount: extraction?.facts.length ?? 0,
    issueCount: extraction?.issues.filter((issue) => issue.kind === "conflict" || issue.kind === "ambiguity").length ?? 0,
    createdAt: row.created_at,
    fileExpiresAt: row.file_expires_at,
    hasTemporaryFile: row.storage_path !== null,
  };
}

export function extractionOf(row: PolicyDocumentRow): Extraction | null {
  return parseExtraction(row.extraction);
}

function fail(message: string): never {
  throw new Error(message);
}

export async function listDocuments(supabase: Client, userId: string): Promise<PolicyDocumentRow[]> {
  const { data, error } = await supabase
    .from("policy_documents")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) fail(`Unable to list policies: ${error.message}`);
  return data ?? [];
}

export async function getDocument(supabase: Client, userId: string, id: string): Promise<PolicyDocumentRow | null> {
  const { data, error } = await supabase.from("policy_documents").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) fail(`Unable to load policy: ${error.message}`);
  return data;
}

export async function requireDocument(supabase: Client, userId: string, id: string): Promise<PolicyDocumentRow> {
  const row = await getDocument(supabase, userId, id);
  if (!row) {
    throw new PolicyInputError("That policy was not found.", "not_found", 404);
  }
  return row;
}

export async function insertDocument(supabase: Client, values: Database["public"]["Tables"]["policy_documents"]["Insert"]): Promise<PolicyDocumentRow> {
  const { data, error } = await supabase.from("policy_documents").insert(values).select("*").single();
  if (error || !data) fail(`Unable to save policy: ${error?.message ?? "no row returned"}`);
  return data;
}

export async function updateDocument(
  supabase: Client,
  userId: string,
  id: string,
  patch: Database["public"]["Tables"]["policy_documents"]["Update"],
): Promise<PolicyDocumentRow> {
  const { data, error } = await supabase.from("policy_documents").update(patch).eq("id", id).eq("user_id", userId).select("*").single();
  if (error || !data) fail(`Unable to update policy: ${error?.message ?? "no row returned"}`);
  return data;
}

// Only moves a document out of "uploaded" once, so two overlapping requests cannot both start processing it.
export async function claimForProcessing(supabase: Client, userId: string, id: string): Promise<PolicyDocumentRow | null> {
  const { data, error } = await supabase
    .from("policy_documents")
    .update({ status: "processing" })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("status", "uploaded")
    .select("*")
    .maybeSingle();

  if (error) fail(`Unable to start processing: ${error.message}`);
  return data;
}

export async function deleteDocumentRow(supabase: Client, userId: string, id: string): Promise<void> {
  const { error } = await supabase.from("policy_documents").delete().eq("id", id).eq("user_id", userId);
  if (error) fail(`Unable to delete policy: ${error.message}`);
}

export async function savePages(supabase: Client, userId: string, documentId: string, pages: PageText[]): Promise<void> {
  if (pages.length === 0) {
    return;
  }

  const { error } = await supabase.from("policy_pages").upsert(
    pages.map((page) => ({ document_id: documentId, user_id: userId, page_number: page.page, text: page.text, text_source: page.source })),
    { onConflict: "document_id,page_number" },
  );
  if (error) fail(`Unable to save pages: ${error.message}`);
}

export async function loadPages(supabase: Client, userId: string, documentId: string): Promise<PageText[]> {
  const { data, error } = await supabase
    .from("policy_pages")
    .select("page_number,text,text_source")
    .eq("document_id", documentId)
    .eq("user_id", userId)
    .order("page_number", { ascending: true });

  if (error) fail(`Unable to load pages: ${error.message}`);
  return (data ?? []).map((row: Pick<PolicyPageRow, "page_number" | "text" | "text_source">) => ({
    page: row.page_number,
    text: row.text,
    source: row.text_source,
  }));
}

export async function replaceClauses(supabase: Client, userId: string, documentId: string, clauses: Clause[]): Promise<void> {
  const removal = await supabase.from("policy_clauses").delete().eq("document_id", documentId).eq("user_id", userId);
  if (removal.error) fail(`Unable to reset clauses: ${removal.error.message}`);

  for (let offset = 0; offset < clauses.length; offset += 200) {
    const batch = clauses.slice(offset, offset + 200).map((clause) => ({
      document_id: documentId,
      user_id: userId,
      clause_index: clause.index,
      clause_ref: clause.ref,
      heading: clause.heading,
      section: clause.section,
      page_number: clause.page,
      continued: clause.continued,
      text: clause.text,
    }));

    const { error } = await supabase.from("policy_clauses").insert(batch);
    if (error) fail(`Unable to save clauses: ${error.message}`);
  }
}

export async function loadClauses(supabase: Client, userId: string, documentId: string): Promise<Clause[]> {
  const { data, error } = await supabase
    .from("policy_clauses")
    .select("clause_index,clause_ref,heading,section,page_number,continued,text")
    .eq("document_id", documentId)
    .eq("user_id", userId)
    .order("clause_index", { ascending: true });

  if (error) fail(`Unable to load clauses: ${error.message}`);
  return (data ?? []).map((row: Pick<PolicyClauseRow, "clause_index" | "clause_ref" | "heading" | "section" | "page_number" | "continued" | "text">) => ({
    index: row.clause_index,
    ref: row.clause_ref,
    heading: row.heading,
    section: row.section,
    page: row.page_number,
    continued: row.continued,
    text: row.text,
  }));
}

export async function uploadTemporaryFile(supabase: Client, path: string, bytes: Uint8Array): Promise<void> {
  const { error } = await supabase.storage.from(POLICY_BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (error) fail(`Unable to store the file: ${error.message}`);
}

export async function downloadTemporaryFile(supabase: Client, path: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from(POLICY_BUCKET).download(path);
  if (error || !data) fail(`Unable to read the stored file: ${error?.message ?? "missing"}`);
  return new Uint8Array(await data.arrayBuffer());
}

export async function removeTemporaryFile(supabase: Client, path: string | null): Promise<void> {
  if (!path) {
    return;
  }

  const { error } = await supabase.storage.from(POLICY_BUCKET).remove([path]);
  if (error) {
    console.error("[policy] temporary file removal failed:", error.message);
  }
}

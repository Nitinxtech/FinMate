import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PolicyInputError, sha256Hex, validatePdfBytes } from "@/lib/policy/file-validation";
import { MAX_OCR_PAGES, STUCK_PROCESSING_HOURS, TEMP_FILE_TTL_HOURS } from "@/lib/policy/limits";
import { geminiOcrProvider, type OcrProvider } from "@/lib/policy/ocr";
import { extractPdfPages } from "@/lib/policy/pdf-text";
import { analyzePages, runOcrStep } from "@/lib/policy/pipeline";
import { safeFilename, titleFromFilename } from "@/lib/policy/sanitize";
import {
  claimForProcessing,
  downloadTemporaryFile,
  getDocument,
  insertDocument,
  loadClauses,
  loadPages,
  removeTemporaryFile,
  replaceClauses,
  requireDocument,
  savePages,
  summarize,
  extractionOf,
  updateDocument,
  uploadTemporaryFile,
  type PolicyDocumentSummary,
} from "@/features/policy/repository";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

const HOUR_MS = 60 * 60 * 1000;
const SAFE_FAILURE = "We could not process this document. Please try again or upload a different copy.";

export async function ingestPdf(args: {
  supabase: Client;
  userId: string;
  bytes: Uint8Array;
  filename: string | null;
  sourceKind: "upload" | "url";
  sourceUrl?: string | null;
}): Promise<PolicyDocumentSummary> {
  validatePdfBytes(args.bytes);

  const id = randomUUID();
  // The object path is built from ids only; nothing from the file or its name reaches the storage key.
  const path = `${args.userId}/${id}.pdf`;
  const filename = safeFilename(args.filename);

  await uploadTemporaryFile(args.supabase, path, args.bytes);

  try {
    const row = await insertDocument(args.supabase, {
      id,
      user_id: args.userId,
      title: titleFromFilename(filename),
      source_kind: args.sourceKind,
      source_url: args.sourceUrl ?? null,
      original_filename: filename,
      byte_size: args.bytes.byteLength,
      sha256: sha256Hex(args.bytes),
      status: "uploaded",
      storage_path: path,
      file_expires_at: new Date(Date.now() + TEMP_FILE_TTL_HOURS * HOUR_MS).toISOString(),
    });

    return summarize(row);
  } catch (error) {
    await removeTemporaryFile(args.supabase, path);
    throw error;
  }
}

async function markFailed(supabase: Client, userId: string, id: string, detail: string, path: string | null) {
  try {
    await updateDocument(supabase, userId, id, { status: "failed", status_detail: detail.slice(0, 480), pending_ocr_pages: [], storage_path: null, file_expires_at: null });
  } finally {
    await removeTemporaryFile(supabase, path);
  }
}

async function finalize(supabase: Client, userId: string, id: string, title: string, path: string | null): Promise<PolicyDocumentSummary> {
  const pages = await loadPages(supabase, userId, id);
  const analysis = analyzePages({ id, title }, pages);

  await replaceClauses(supabase, userId, id, analysis.clauses);
  const row = await updateDocument(supabase, userId, id, {
    status: "ready",
    status_detail: null,
    policy_type: analysis.classification.type,
    page_count: pages.length,
    type_confidence: analysis.classification.confidence,
    is_insurance_policy: analysis.classification.isInsurancePolicy,
    classification: JSON.parse(JSON.stringify(analysis.classification)),
    insurer: analysis.extraction.insurer,
    extraction: JSON.parse(JSON.stringify(analysis.extraction)),
    pending_ocr_pages: [],
    storage_path: null,
    file_expires_at: null,
  });

  // The temporary original is deleted as soon as the durable records are saved.
  await removeTemporaryFile(supabase, path);
  return summarize(row);
}

// One resumable step per call keeps requests short; the client repeats while status is "processing".
export async function processStep(args: { supabase: Client; userId: string; id: string; ocr?: OcrProvider }): Promise<PolicyDocumentSummary> {
  const { supabase, userId, id } = args;
  const ocr = args.ocr ?? geminiOcrProvider;

  let row = await requireDocument(supabase, userId, id);
  if (row.status === "ready" || row.status === "failed") {
    return summarize(row);
  }

  const path = row.storage_path;

  try {
    if (row.status === "uploaded") {
      const claimed = await claimForProcessing(supabase, userId, id);
      if (!claimed) {
        return summarize((await getDocument(supabase, userId, id)) ?? row);
      }
      row = claimed;

      if (!path) {
        throw new PolicyInputError("The temporary copy of this file is no longer available. Please upload it again.", "not_found");
      }

      const bytes = await downloadTemporaryFile(supabase, path);
      validatePdfBytes(bytes);
      const extracted = await extractPdfPages(bytes);
      await savePages(supabase, userId, id, extracted.pages);

      const toRead = extracted.ocrPages.slice(0, MAX_OCR_PAGES);
      if (toRead.length === 0) {
        return await finalize(supabase, userId, id, row.title, path);
      }

      const detail =
        extracted.ocrPages.length > toRead.length
          ? `Only the first ${MAX_OCR_PAGES} scanned pages will be read; ${extracted.ocrPages.length - toRead.length} more are skipped.`
          : null;
      row = await updateDocument(supabase, userId, id, {
        page_count: extracted.pageCount,
        pending_ocr_pages: toRead,
        ocr_total: toRead.length,
        status_detail: detail,
      });
      return summarize(row);
    }

    if (row.pending_ocr_pages.length > 0) {
      if (!path) {
        throw new PolicyInputError("The temporary copy of this file is no longer available. Please upload it again.", "not_found");
      }

      const bytes = await downloadTemporaryFile(supabase, path);
      const step = await runOcrStep({ pdfBytes: bytes, pending: row.pending_ocr_pages, provider: ocr });
      await savePages(supabase, userId, id, step.done);

      if (step.remaining.length > 0) {
        row = await updateDocument(supabase, userId, id, { pending_ocr_pages: step.remaining });
        return summarize(row);
      }

      return await finalize(supabase, userId, id, row.title, path);
    }

    return await finalize(supabase, userId, id, row.title, path);
  } catch (error) {
    const message = error instanceof PolicyInputError ? error.message : SAFE_FAILURE;
    if (!(error instanceof PolicyInputError)) {
      console.error("[policy] processing failed:", error instanceof Error ? error.message : error);
    }

    await markFailed(supabase, userId, id, message, path);
    return summarize((await getDocument(supabase, userId, id)) ?? row);
  }
}

export async function loadBundle(supabase: Client, userId: string, id: string) {
  const row = await requireDocument(supabase, userId, id);
  const [pages, clauses] = await Promise.all([loadPages(supabase, userId, id), loadClauses(supabase, userId, id)]);
  return { row, document: summarize(row), pages, clauses, extraction: extractionOf(row) };
}

export async function deletePolicy(supabase: Client, userId: string, id: string): Promise<void> {
  const row = await requireDocument(supabase, userId, id);
  await removeTemporaryFile(supabase, row.storage_path);
  const { error } = await supabase.from("policy_documents").delete().eq("id", id).eq("user_id", userId);
  if (error) {
    throw new Error(`Unable to delete policy: ${error.message}`);
  }
}

// A user's own expired working copies are removed opportunistically whenever they upload.
export async function purgeOwnExpired(supabase: Client, userId: string): Promise<number> {
  const { data } = await supabase
    .from("policy_documents")
    .select("id,storage_path")
    .eq("user_id", userId)
    .not("storage_path", "is", null)
    .lt("file_expires_at", new Date().toISOString())
    .limit(20);

  let removed = 0;
  for (const row of data ?? []) {
    await removeTemporaryFile(supabase, row.storage_path);
    await supabase.from("policy_documents").update({ storage_path: null, file_expires_at: null }).eq("id", row.id).eq("user_id", userId);
    removed += 1;
  }

  return removed;
}

export { STUCK_PROCESSING_HOURS };

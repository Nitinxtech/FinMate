import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { POLICY_BUCKET, STUCK_PROCESSING_HOURS, TEMP_FILE_TTL_HOURS } from "@/lib/policy/limits";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

export type SweepReport = {
  expiredFilesRemoved: number;
  stuckDocumentsFailed: number;
  orphanFilesRemoved: number;
};

const HOUR_MS = 60 * 60 * 1000;
const MAX_FOLDERS_PER_SWEEP = 200;

// Runs with the service-role client (see /api/policies/cleanup). It only ever deletes; it never reads document content.
export async function sweepTemporaryFiles(admin: Client, now = Date.now()): Promise<SweepReport> {
  const report: SweepReport = { expiredFilesRemoved: 0, stuckDocumentsFailed: 0, orphanFilesRemoved: 0 };
  const nowIso = new Date(now).toISOString();

  const expired = await admin.from("policy_documents").select("id,storage_path").not("storage_path", "is", null).lt("file_expires_at", nowIso).limit(500);
  for (const row of expired.data ?? []) {
    if (row.storage_path) {
      await admin.storage.from(POLICY_BUCKET).remove([row.storage_path]);
    }
    await admin.from("policy_documents").update({ storage_path: null, file_expires_at: null }).eq("id", row.id);
    report.expiredFilesRemoved += 1;
  }

  // Documents that never reached "ready" cannot be resumed once their working copy is gone.
  const stuckBefore = new Date(now - STUCK_PROCESSING_HOURS * HOUR_MS).toISOString();
  const stuck = await admin
    .from("policy_documents")
    .select("id")
    .in("status", ["uploaded", "processing"])
    .lt("updated_at", stuckBefore)
    .limit(500);
  for (const row of stuck.data ?? []) {
    await admin
      .from("policy_documents")
      .update({ status: "failed", status_detail: "Processing did not finish in time. Please upload the document again.", pending_ocr_pages: [] })
      .eq("id", row.id);
    report.stuckDocumentsFailed += 1;
  }

  // Files whose database row is gone (for example after a failed insert) are removed once they are older than the TTL.
  const cutoff = now - TEMP_FILE_TTL_HOURS * HOUR_MS;
  const folders = await admin.storage.from(POLICY_BUCKET).list("", { limit: MAX_FOLDERS_PER_SWEEP });
  for (const folder of folders.data ?? []) {
    if (folder.id !== null) {
      continue;
    }

    const files = await admin.storage.from(POLICY_BUCKET).list(folder.name, { limit: 1000 });
    const old = (files.data ?? []).filter((file) => file.created_at && new Date(file.created_at).getTime() < cutoff);
    if (old.length === 0) {
      continue;
    }

    const ids = old.map((file) => file.name.replace(/\.pdf$/, ""));
    const known = await admin.from("policy_documents").select("id,storage_path").in("id", ids);
    const stillReferenced = new Set((known.data ?? []).filter((row) => row.storage_path).map((row) => row.id));
    const orphans = old.filter((file) => !stillReferenced.has(file.name.replace(/\.pdf$/, "")));

    if (orphans.length > 0) {
      await admin.storage.from(POLICY_BUCKET).remove(orphans.map((file) => `${folder.name}/${file.name}`));
      report.orphanFilesRemoved += orphans.length;
    }
  }

  return report;
}

// Storage objects do not cascade when an account is deleted, so account deletion must call this explicitly.
export async function deleteAllFilesForUser(admin: Client, userId: string): Promise<number> {
  let removed = 0;

  for (let round = 0; round < 20; round += 1) {
    const listing = await admin.storage.from(POLICY_BUCKET).list(userId, { limit: 1000 });
    const names = (listing.data ?? []).map((file) => `${userId}/${file.name}`);
    if (names.length === 0) {
      break;
    }

    await admin.storage.from(POLICY_BUCKET).remove(names);
    removed += names.length;
  }

  return removed;
}

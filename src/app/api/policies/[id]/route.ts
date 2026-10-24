import type { NextRequest } from "next/server";
import { assertUuid, handlePolicyRequest, json } from "@/features/policy/http";
import { deletePolicy, loadBundle } from "@/features/policy/service";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handlePolicyRequest(null, async ({ supabase, user }) => {
    const bundle = await loadBundle(supabase, user.id, assertUuid(id));
    return json({ document: bundle.document, pages: bundle.pages, clauses: bundle.clauses, extraction: bundle.extraction });
  });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handlePolicyRequest(null, async ({ supabase, user }) => {
    await deletePolicy(supabase, user.id, assertUuid(id));
    return json({ deleted: true });
  });
}

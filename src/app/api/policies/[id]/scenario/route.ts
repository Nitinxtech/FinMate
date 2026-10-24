import type { NextRequest } from "next/server";
import { z } from "zod";
import { assertUuid, handlePolicyRequest, json } from "@/features/policy/http";
import { requireDocument, extractionOf } from "@/features/policy/repository";
import { loadClauses } from "@/features/policy/repository";
import { PolicyInputError } from "@/lib/policy/file-validation";
import { analyzeScenario, scenarioInputSchema } from "@/lib/policy/scenario";

const bodySchema = z.object({ scenario: scenarioInputSchema });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handlePolicyRequest("analyze", async ({ supabase, user }) => {
    const { scenario } = bodySchema.parse(await request.json());
    const row = await requireDocument(supabase, user.id, assertUuid(id));
    const extraction = extractionOf(row);

    if (row.status !== "ready" || !extraction) {
      throw new PolicyInputError("This policy has not finished processing yet.", "not_found", 409);
    }

    const clauses = await loadClauses(supabase, user.id, row.id);
    const result = analyzeScenario({
      input: scenario,
      doc: { id: row.id, title: row.title },
      policyType: row.policy_type,
      extraction,
      clauses,
    });

    return json({ result });
  });
}

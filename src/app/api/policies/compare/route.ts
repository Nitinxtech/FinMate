import type { NextRequest } from "next/server";
import { z } from "zod";
import { assertUuid, handlePolicyRequest, json } from "@/features/policy/http";
import { extractionOf, requireDocument } from "@/features/policy/repository";
import { PolicyInputError } from "@/lib/policy/file-validation";
import { MAX_COMPARE_DOCUMENTS } from "@/lib/policy/limits";
import { comparePolicies, type CompareInput } from "@/lib/policy/compare";

const bodySchema = z.object({ documentIds: z.array(z.string()).min(2).max(MAX_COMPARE_DOCUMENTS) });

export async function POST(request: NextRequest) {
  return handlePolicyRequest("analyze", async ({ supabase, user }) => {
    const body = bodySchema.parse(await request.json());
    const ids = [...new Set(body.documentIds.map(assertUuid))];
    if (ids.length < 2) {
      throw new PolicyInputError("Choose at least two different policies to compare.", "not_found");
    }

    const inputs: CompareInput[] = [];
    for (const id of ids) {
      const row = await requireDocument(supabase, user.id, id);
      const extraction = extractionOf(row);
      if (row.status !== "ready" || !extraction) {
        throw new PolicyInputError(`"${row.title}" has not finished processing yet.`, "not_found", 409);
      }

      inputs.push({ id: row.id, title: row.title, policyType: row.policy_type, insurer: row.insurer, extraction });
    }

    return json({ comparison: comparePolicies(inputs) });
  });
}

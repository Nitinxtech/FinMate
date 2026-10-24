import type { NextRequest } from "next/server";
import { z } from "zod";
import { assertUuid, handlePolicyRequest, json } from "@/features/policy/http";
import { extractionOf, loadClauses, requireDocument } from "@/features/policy/repository";
import { PolicyInputError } from "@/lib/policy/file-validation";
import { MAX_QUESTION_CHARS } from "@/lib/policy/limits";
import { answerPolicyQuestion, type QaDocument } from "@/lib/policy/qa";

const bodySchema = z.object({
  question: z.string().trim().min(5).max(MAX_QUESTION_CHARS),
  documentIds: z.array(z.string()).min(1).max(3),
});

export async function POST(request: NextRequest) {
  return handlePolicyRequest("ask", async ({ supabase, user }) => {
    const body = bodySchema.parse(await request.json());
    const ids = [...new Set(body.documentIds.map(assertUuid))];

    const documents: QaDocument[] = [];
    for (const id of ids) {
      // Ownership is checked per document, so a guessed id can never pull in someone else's policy.
      const row = await requireDocument(supabase, user.id, id);
      if (row.status !== "ready") {
        throw new PolicyInputError(`"${row.title}" has not finished processing yet.`, "not_found", 409);
      }

      documents.push({ doc: { id: row.id, title: row.title }, clauses: await loadClauses(supabase, user.id, row.id), extraction: extractionOf(row) });
    }

    return json({ answer: await answerPolicyQuestion({ question: body.question, documents }) });
  });
}

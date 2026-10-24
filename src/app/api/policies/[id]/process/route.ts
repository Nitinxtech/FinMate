import type { NextRequest } from "next/server";
import { assertUuid, handlePolicyRequest, json } from "@/features/policy/http";
import { processStep } from "@/features/policy/service";

// OCR can take a while per step; platforms that honour this setting get room to finish.
export const maxDuration = 120;

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handlePolicyRequest("process", async ({ supabase, user }) => {
    const document = await processStep({ supabase, userId: user.id, id: assertUuid(id) });
    return json({ document });
  });
}

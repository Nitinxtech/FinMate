import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import {
  enforceCopilotRateLimit,
  estimateTokensFromText,
} from "@/lib/ai/copilot-rate-limit";
import { copilotRequestSchema } from "@/lib/ai/copilot-schemas";
import { runFinancialCopilot } from "@/lib/ai/copilot-service";

export async function POST(request: NextRequest) {
  try {
    const payload = copilotRequestSchema.parse(await request.json());

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const untrustedTokens =
      payload.attachments.reduce((sum, item) => sum + estimateTokensFromText(item.content), 0) +
      payload.webpages.reduce((sum, item) => sum + estimateTokensFromText(item.content), 0);

    const historyTokens = payload.history.reduce(
      (sum, item) => sum + estimateTokensFromText(item.content),
      0,
    );

    const estimatedTokens = estimateTokensFromText(payload.question) + untrustedTokens + historyTokens;
    if (estimatedTokens > 3500) {
      return Response.json(
        {
          error:
            "Request too large. Please shorten the question or reduce document/webpage content.",
        },
        { status: 413 },
      );
    }

    const rateLimit = enforceCopilotRateLimit(`copilot:${user.id}`, estimatedTokens);
    if (!rateLimit.allowed) {
      return Response.json(
        {
          error: rateLimit.reason,
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        {
          status: 429,
          headers: rateLimit.retryAfterSeconds
            ? { "Retry-After": String(rateLimit.retryAfterSeconds) }
            : undefined,
        },
      );
    }

    const response = await runFinancialCopilot({
      supabase,
      user,
      request: payload,
    });

    return Response.json(response, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("invalid")) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    return Response.json(
      {
        error: "Unable to complete co-pilot request right now.",
      },
      { status: 500 },
    );
  }
}

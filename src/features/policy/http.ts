import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { ZodError } from "zod";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { PolicyInputError } from "@/lib/policy/file-validation";
import { checkPolicyRateLimit, rateLimitMessage } from "@/lib/policy/rate-limit";
import type { Database } from "@/types/database";

export type PolicyContext = { supabase: SupabaseClient<Database>; user: User };

const NO_STORE = { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" } as const;

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...extra } });
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function assertUuid(value: string): string {
  if (!isUuid(value)) {
    throw new PolicyInputError("That policy was not found.", "not_found", 404);
  }
  return value;
}

export async function handlePolicyRequest(
  action: "upload" | "process" | "ask" | "analyze" | null,
  work: (context: PolicyContext) => Promise<Response>,
): Promise<Response> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return json({ error: "Please sign in to continue." }, 401);
    }

    if (action) {
      const limit = checkPolicyRateLimit(user.id, action);
      if (!limit.allowed) {
        return json({ error: rateLimitMessage(action), retryAfterSeconds: limit.retryAfterSeconds }, 429, { "Retry-After": String(limit.retryAfterSeconds) });
      }
    }

    return await work({ supabase, user });
  } catch (error) {
    if (error instanceof PolicyInputError) {
      return json({ error: error.message, code: error.code }, error.status);
    }

    if (error instanceof ZodError) {
      return json({ error: "Some of the information sent was not valid. Please check it and try again." }, 400);
    }

    if (error instanceof SyntaxError) {
      return json({ error: "The request could not be read." }, 400);
    }

    // Internal details stay in the server log; the client only ever gets a generic message.
    console.error("[policy] request failed:", error instanceof Error ? error.message : error);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}

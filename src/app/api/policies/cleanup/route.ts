import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { sweepTemporaryFiles } from "@/features/policy/retention";
import { json } from "@/features/policy/http";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { env } from "@/lib/validation/env.server";

function secretMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function run(request: NextRequest): Promise<Response> {
  if (env.CRON_SECRET.length < 24) {
    return json({ error: "Not found" }, 404);
  }

  const presented = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secretMatches(presented, env.CRON_SECRET)) {
    return json({ error: "Not found" }, 404);
  }

  try {
    return json({ report: await sweepTemporaryFiles(createSupabaseAdminClient()) });
  } catch (error) {
    console.error("[policy] retention sweep failed:", error instanceof Error ? error.message : error);
    return json({ error: "Sweep failed" }, 500);
  }
}

// Disabled unless CRON_SECRET is a long random value. GET exists because hosted schedulers (e.g. Vercel Cron) call with GET;
// the endpoint only deletes expired temporary files, so a repeated call is harmless.
export const POST = run;
export const GET = run;

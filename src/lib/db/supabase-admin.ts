import "server-only";

import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/validation/env.server";
import type { Database } from "@/types/database";

export function createSupabaseAdminClient() {
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

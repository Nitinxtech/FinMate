import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const hasSupabaseEnv =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("example.supabase.co") &&
  !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.includes("test-key") &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY.includes("test-key");

const describeIfConfigured = hasSupabaseEnv ? describe : describe.skip;

describeIfConfigured("financial_profiles RLS isolation", () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const admin = () =>
    createClient<Database>(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

  const createdUserIds: string[] = [];

  async function createTestUser(prefix: string) {
    const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const password = `Pa55word!${Math.random().toString(36).slice(2, 6)}`;

    const created = await admin().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (created.error || !created.data.user) {
      throw new Error(created.error?.message ?? "Unable to create test user");
    }

    createdUserIds.push(created.data.user.id);

    const userClient = createClient<Database>(supabaseUrl, anonKey);
    const signedIn = await userClient.auth.signInWithPassword({ email, password });

    if (signedIn.error || !signedIn.data.user) {
      throw new Error(signedIn.error?.message ?? "Unable to sign in test user");
    }

    return {
      id: signedIn.data.user.id,
      client: userClient,
    };
  }

  beforeAll(async () => {
    const { error } = await admin().from("financial_profiles").select("id").limit(1);

    if (error && error.message.toLowerCase().includes("does not exist")) {
      throw new Error(
        "Table public.financial_profiles does not exist. Apply migrations before running integration tests.",
      );
    }
  });

  afterAll(async () => {
    await Promise.all(createdUserIds.map((id) => admin().auth.admin.deleteUser(id)));
  });

  it("prevents one user from reading or mutating another user's rows", async () => {
    const alice = await createTestUser("alice");
    const bob = await createTestUser("bob");

    const aliceInsert = await alice.client.from("financial_profiles").upsert(
      {
        user_id: alice.id,
        onboarding_step: "country_currency",
        onboarding_completed: false,
        country_code: "IN",
        currency_code: "INR",
      },
      { onConflict: "user_id" },
    );

    expect(aliceInsert.error).toBeNull();

    const bobReadsAlice = await bob.client
      .from("financial_profiles")
      .select("*")
      .eq("user_id", alice.id);

    expect(bobReadsAlice.error).toBeNull();
    expect(bobReadsAlice.data).toHaveLength(0);

    const bobUpdatesAlice = await bob.client
      .from("financial_profiles")
      .update({ country_code: "US" })
      .eq("user_id", alice.id)
      .select("id");

    expect(bobUpdatesAlice.error).toBeNull();
    expect(bobUpdatesAlice.data).toHaveLength(0);

    const aliceRecord = await alice.client
      .from("financial_profiles")
      .select("country_code")
      .eq("user_id", alice.id)
      .single();

    expect(aliceRecord.error).toBeNull();
    expect(aliceRecord.data?.country_code).toBe("IN");
  });
});

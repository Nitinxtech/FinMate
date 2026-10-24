import { afterAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Database } from "@/types/database";

const hasSupabaseEnv =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("example.supabase.co") &&
  !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.includes("test-key") &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY.includes("test-key");

const describeIfConfigured = hasSupabaseEnv ? describe : describe.skip;

// Requires migration 20261021090000_phase4_insurance_policy.sql to be applied.
describeIfConfigured("policy documents RLS and storage isolation", () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const BUCKET = "policy-documents";

  const admin = () => createClient<Database>(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const createdUserIds: string[] = [];

  async function createTestUser(prefix: string) {
    const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const password = `Pa55word!${Math.random().toString(36).slice(2, 6)}`;
    const created = await admin().auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error(created.error?.message ?? "Unable to create test user");
    createdUserIds.push(created.data.user.id);

    const client = createClient<Database>(url, anonKey);
    const signedIn = await client.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.user) throw new Error(signedIn.error?.message ?? "Unable to sign in");
    return { id: signedIn.data.user.id, client };
  }

  afterAll(async () => {
    await Promise.all(createdUserIds.map((id) => admin().auth.admin.deleteUser(id)));
  });

  it("keeps documents, pages and clauses private to their owner", async () => {
    const alice = await createTestUser("alice");
    const bob = await createTestUser("bob");
    const documentId = randomUUID();

    const inserted = await alice.client.from("policy_documents").insert({
      id: documentId,
      user_id: alice.id,
      title: "Alice policy",
      source_kind: "upload",
      byte_size: 100,
      sha256: "a".repeat(64),
    });
    expect(inserted.error).toBeNull();

    expect((await alice.client.from("policy_pages").insert({ document_id: documentId, user_id: alice.id, page_number: 1, text: "SECRET TERMS", text_source: "text" })).error).toBeNull();
    expect((await alice.client.from("policy_clauses").insert({ document_id: documentId, user_id: alice.id, clause_index: 0, page_number: 1, text: "SECRET CLAUSE" })).error).toBeNull();

    for (const table of ["policy_documents", "policy_pages", "policy_clauses"] as const) {
      const read = await bob.client.from(table).select("*");
      expect(read.error).toBeNull();
      expect(read.data).toHaveLength(0);
    }

    const update = await bob.client.from("policy_documents").update({ title: "pwned" }).eq("id", documentId).select("id");
    expect(update.data).toHaveLength(0);

    const del = await bob.client.from("policy_documents").delete().eq("id", documentId).select("id");
    expect(del.data).toHaveLength(0);

    const still = await alice.client.from("policy_documents").select("title").eq("id", documentId).single();
    expect(still.data?.title).toBe("Alice policy");
  });

  it("does not let a user attach pages or clauses to someone else's document", async () => {
    const alice = await createTestUser("alice2");
    const mallory = await createTestUser("mallory");
    const documentId = randomUUID();

    await alice.client.from("policy_documents").insert({ id: documentId, user_id: alice.id, title: "Alice", source_kind: "upload", byte_size: 100, sha256: "b".repeat(64) });

    const page = await mallory.client.from("policy_pages").insert({ document_id: documentId, user_id: mallory.id, page_number: 1, text: "injected", text_source: "text" });
    expect(page.error).not.toBeNull();

    const clause = await mallory.client.from("policy_clauses").insert({ document_id: documentId, user_id: mallory.id, clause_index: 0, page_number: 1, text: "injected" });
    expect(clause.error).not.toBeNull();

    const asAlice = await mallory.client.from("policy_documents").insert({ user_id: alice.id, title: "forged", source_kind: "upload", byte_size: 1, sha256: "c".repeat(64) });
    expect(asAlice.error).not.toBeNull();
  });

  it("keeps stored files private: owner only, no public URL", async () => {
    const alice = await createTestUser("alice3");
    const bob = await createTestUser("bob3");
    const path = `${alice.id}/${randomUUID()}.pdf`;
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

    const upload = await alice.client.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf" });
    expect(upload.error).toBeNull();

    expect((await alice.client.storage.from(BUCKET).download(path)).error).toBeNull();
    expect((await bob.client.storage.from(BUCKET).download(path)).error).not.toBeNull();

    const intoAlicesFolder = await bob.client.storage.from(BUCKET).upload(`${alice.id}/${randomUUID()}.pdf`, bytes, { contentType: "application/pdf" });
    expect(intoAlicesFolder.error).not.toBeNull();

    const bobRemoves = await bob.client.storage.from(BUCKET).remove([path]);
    expect(bobRemoves.data ?? []).toHaveLength(0);

    const publicUrl = alice.client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    expect((await fetch(publicUrl)).ok).toBe(false);

    const notPdf = await alice.client.storage.from(BUCKET).upload(`${alice.id}/${randomUUID()}.pdf`, new Uint8Array([1, 2, 3]), { contentType: "text/html" });
    expect(notPdf.error).not.toBeNull();

    await admin().storage.from(BUCKET).remove([path]);
  });
});

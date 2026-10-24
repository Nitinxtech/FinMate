import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { PolicyLibrary } from "@/components/policy/policy-library";
import { LoadingState } from "@/components/ui/loading-state";
import { listDocuments, summarize } from "@/features/policy/repository";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";

export default function PoliciesPage() {
  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Insurance policies</h1>
        <p className="text-sm text-slate-500">Upload a policy to see what it says in plain language, ask questions grounded in the document, compare policies and test what-if scenarios.</p>
      </div>
      <Suspense fallback={<LoadingState />}>
        <PoliciesContent />
      </Suspense>
    </main>
  );
}

async function PoliciesContent() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const rows = await listDocuments(supabase, user.id);
  return <PolicyLibrary initialDocuments={rows.map(summarize)} />;
}

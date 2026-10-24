import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { PolicyCompare } from "@/components/policy/policy-compare";
import { LoadingState } from "@/components/ui/loading-state";
import { isUuid } from "@/features/policy/http";
import { extractionOf, requireDocument } from "@/features/policy/repository";
import { PolicyInputError } from "@/lib/policy/file-validation";
import { comparePolicies, type CompareInput } from "@/lib/policy/compare";
import { MAX_COMPARE_DOCUMENTS } from "@/lib/policy/limits";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";

type Props = { searchParams: Promise<{ ids?: string }> };

export default function ComparePage({ searchParams }: Props) {
  return (
    <main>
      <Suspense fallback={<LoadingState message="Comparing policies..." />}>
        <CompareContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function CompareContent({ searchParams }: Props) {
  await connection();
  const { ids: rawIds } = await searchParams;
  const ids = [...new Set((rawIds ?? "").split(",").map((value) => value.trim()).filter(Boolean))];

  if (ids.length < 2 || ids.length > MAX_COMPARE_DOCUMENTS || !ids.every(isUuid)) {
    redirect("/dashboard/policies");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const inputs: CompareInput[] = [];
  for (const id of ids) {
    try {
      const row = await requireDocument(supabase, user.id, id);
      const extraction = extractionOf(row);
      if (row.status !== "ready" || !extraction) {
        redirect("/dashboard/policies");
      }

      inputs.push({ id: row.id, title: row.title, policyType: row.policy_type, insurer: row.insurer, extraction });
    } catch (error) {
      if (error instanceof PolicyInputError && error.code === "not_found") {
        notFound();
      }
      throw error;
    }
  }

  return <PolicyCompare comparison={comparePolicies(inputs)} />;
}

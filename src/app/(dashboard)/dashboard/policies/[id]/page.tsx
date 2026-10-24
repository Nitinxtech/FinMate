import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { PolicyViewer } from "@/components/policy/policy-viewer";
import { LoadingState } from "@/components/ui/loading-state";
import { isUuid } from "@/features/policy/http";
import { loadBundle } from "@/features/policy/service";
import { PolicyInputError } from "@/lib/policy/file-validation";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; clause?: string }>;
};

export default function PolicyPage({ params, searchParams }: Props) {
  return (
    <main>
      <Suspense fallback={<LoadingState message="Opening policy..." />}>
        <PolicyContent params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function PolicyContent({ params, searchParams }: Props) {
  await connection();
  const [{ id }, query] = await Promise.all([params, searchParams]);

  if (!isUuid(id)) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  let bundle: Awaited<ReturnType<typeof loadBundle>>;
  try {
    bundle = await loadBundle(supabase, user.id, id);
  } catch (error) {
    if (error instanceof PolicyInputError && error.code === "not_found") {
      notFound();
    }
    throw error;
  }

  if (bundle.document.status !== "ready") {
    redirect("/dashboard/policies");
  }

  const page = Number(query.page);
  return (
    <PolicyViewer
      document={bundle.document}
      pages={bundle.pages}
      clauses={bundle.clauses}
      extraction={bundle.extraction}
      initialPage={Number.isInteger(page) && page > 0 ? page : 1}
      initialClause={typeof query.clause === "string" && query.clause.length <= 60 ? query.clause : null}
    />
  );
}

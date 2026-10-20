import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { unstable_noStore as noStore } from "next/cache";
import { Button } from "@/components/ui/button";
import { FinanceDashboard } from "@/components/dashboard/finance-dashboard";
import { EmptyState } from "@/components/ui/empty-state";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { getFinancialProfile } from "@/features/profile/repository";
import { buildDashboardFinanceModel } from "@/lib/finance/dashboard";

export default async function DashboardPage() {
  noStore();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const profile = await getFinancialProfile(supabase, user);
  const currencyCode = profile?.currency_code ?? "USD";
  const displayName = user.email?.split("@")[0] ?? "there";

  return (
    <main className="space-y-6">
      {!profile ? (
        <EmptyState
          title="No financial profile yet"
          description="Start onboarding to save your country, compensation, and planning data with resume support."
          actionLabel="Start onboarding"
          actionIcon={<ArrowRight className="size-4" />}
        />
      ) : (
        <FinanceDashboard
          data={buildDashboardFinanceModel(profile)}
          currencyCode={currencyCode}
          displayName={displayName}
          onboardingComplete={profile.onboarding_completed}
        />
      )}

      {profile ? (
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/dashboard/onboarding">
            <Button>
              {profile.onboarding_completed ? "Review onboarding" : "Complete onboarding"}
              <ArrowRight className="size-4" />
            </Button>
          </Link>
          <Link href="/dashboard/profile">
            <Button variant="secondary">Edit profile details</Button>
          </Link>
        </div>
      ) : null}
    </main>
  );
}

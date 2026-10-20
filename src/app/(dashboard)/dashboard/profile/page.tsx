import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { getFinancialProfile } from "@/features/profile/repository";
import { toFormDefaults } from "@/features/profile/service";

export default async function ProfilePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const profile = await getFinancialProfile(supabase, user);

  return (
    <OnboardingWizard
      initialStep={profile?.onboarding_step ?? "country_currency"}
      initialValues={toFormDefaults(profile)}
      completed={profile?.onboarding_completed ?? false}
      mode="profile"
    />
  );
}

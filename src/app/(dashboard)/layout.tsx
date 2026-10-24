import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { ClipboardList, FileText, LayoutDashboard, User2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { signOutAction } from "@/features/profile/actions";
import { getFinancialProfile } from "@/features/profile/repository";

type DashboardLayoutProps = {
  children: ReactNode;
};

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <Suspense fallback={<LayoutFrame>{children}</LayoutFrame>}>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </Suspense>
  );
}

async function DashboardLayoutContent({ children }: DashboardLayoutProps) {
  await connection();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const profile = await getFinancialProfile(supabase, user);
  const shouldShowOnboardingNav = !profile?.onboarding_completed;

  return <LayoutFrame shouldShowOnboardingNav={shouldShowOnboardingNav}>{children}</LayoutFrame>;
}

type LayoutFrameProps = {
  children: ReactNode;
  shouldShowOnboardingNav?: boolean;
};

function LayoutFrame({ children, shouldShowOnboardingNav = false }: LayoutFrameProps) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-sky-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 p-1 text-sm font-medium text-sky-900">
            <NavPill href="/dashboard" label="Dashboard" icon={<LayoutDashboard className="size-4" />} />
            {shouldShowOnboardingNav ? (
              <NavPill href="/dashboard/onboarding" label="Onboarding" icon={<ClipboardList className="size-4" />} />
            ) : null}
            <NavPill href="/dashboard/policies" label="Policies" icon={<FileText className="size-4" />} />
            <NavPill href="/dashboard/profile" label="Profile" icon={<User2 className="size-4" />} />
          </div>
          <form action={signOutAction}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</div>
    </div>
  );
}

type NavPillProps = {
  href: string;
  label: string;
  icon: ReactNode;
};

function NavPill({ href, label, icon }: NavPillProps) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-slate-700 transition hover:bg-white hover:text-slate-900"
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}

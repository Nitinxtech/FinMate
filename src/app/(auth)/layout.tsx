import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";

type AuthLayoutProps = {
  children: ReactNode;
};

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <Suspense fallback={<>{children}</>}>
      <AuthLayoutContent>{children}</AuthLayoutContent>
    </Suspense>
  );
}

async function AuthLayoutContent({ children }: AuthLayoutProps) {
  await connection();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}

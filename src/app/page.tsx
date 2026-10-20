import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FormShell } from "@/components/ui/form-shell";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            Personal Finance AI Foundation
            <ShieldCheck className="size-5 text-primary" />
          </CardTitle>
          <CardDescription>
            Secure auth, onboarding, and profile editing are ready in Phase 1.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormShell
            title="UI Layer"
            description="Reusable form, loading, empty, error, and notification building blocks are in place."
          >
            <p className="text-sm text-muted-foreground">
              See src/components/ui for primitives and app-level patterns.
            </p>
          </FormShell>
          <FormShell
            title="Service Layer"
            description="AI and database integrations are separated behind server-only modules."
          >
            <p className="text-sm text-muted-foreground">
              Use feature services to orchestrate business logic without coupling to UI.
            </p>
          </FormShell>
          <div className="flex items-end gap-3 p-4">
            <Link href="/sign-in">
              <Button>Sign in</Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="secondary">Open dashboard</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <EmptyState
        title="Phase 1 Ready"
        description="Create an account, complete onboarding, review your data, and edit it later from profile."
        actionLabel="Start onboarding"
        actionIcon={<ArrowRight className="size-4" />}
      />
    </main>
  );
}

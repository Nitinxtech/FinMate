import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { Card, CardContent } from "@/components/ui/card";
import { signInAction } from "@/features/profile/actions";

export default function SignInPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 items-center px-6 py-10">
      <Card className="w-full">
        <CardContent className="space-y-6 pt-6">
          <AuthForm
            title="Sign in"
            description="Access your private financial workspace."
            action={signInAction}
          />
          <p className="text-center text-sm text-muted-foreground">
            New here?{" "}
            <Link className="text-primary hover:underline" href="/sign-up">
              Create an account
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

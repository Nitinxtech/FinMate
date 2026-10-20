import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { Card, CardContent } from "@/components/ui/card";
import { signUpAction } from "@/features/profile/actions";

export default function SignUpPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 items-center px-6 py-10">
      <Card className="w-full">
        <CardContent className="space-y-6 pt-6">
          <AuthForm
            title="Create account"
            description="Start secure onboarding and save your financial profile."
            action={signUpAction}
            isSignUp
          />
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link className="text-primary hover:underline" href="/sign-in">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
